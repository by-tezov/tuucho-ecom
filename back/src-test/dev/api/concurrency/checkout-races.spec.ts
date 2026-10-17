import { test, expect } from 'patchright/test';
import { pool } from '../../../../src/db/pool.js';
import {
  apiJson,
  createZeroingVoucher,
  pickPurchasableVariant,
  registerUser,
  testCourierCode,
  uniqueEmail,
} from '../../support/api.js';
import { E2E_PRODUCT_UIDS } from '../../support/catalog.js';
import {
  addCartLine,
  allocatedUnits,
  compositionBody,
  freeCheckout,
  prepareBuyers,
  raceVariant,
  serverErrors,
  setFreeUnits,
  SOLD_OUT_CODES,
  statusCounts,
} from '../../support/concurrency.js';
import { initVoucher } from '../../support/ops.js';

/**
 * Many customers pressing Payer at the same moment. Each test fires every
 * request at once and then checks the one outcome the locks promise, both
 * from the responses and from the database: a race that "mostly" works still
 * oversells, so a status histogram alone is not enough.
 */
test.describe('API concurrency: checkout', () => {
  let voucherCode: string;

  test.beforeAll(async () => {
    voucherCode = await createZeroingVoucher('race');
  });

  test('eight buyers, three free units: exactly three orders, the rest refused', async ({ request }) => {
    const variant = await raceVariant(E2E_PRODUCT_UIDS.RACE_STOCK);
    const buyers = await prepareBuyers(request, 8, variant);
    await setFreeUnits(variant, 3);
    const allocatedBefore = await allocatedUnits(variant);

    const results = await Promise.all(buyers.map((buyer) => freeCheckout(request, buyer, voucherCode)));

    expect(serverErrors(results)).toBe(0);
    expect(results.filter(({ status }) => status === 201)).toHaveLength(3);
    for (const refused of results.filter(({ status }) => status !== 201)) {
      expect(SOLD_OUT_CODES).toContain(refused.body.error?.code);
    }
    expect(await allocatedUnits(variant)).toBe(allocatedBefore + 3);
  });

  test('a voucher with two uses left, six buyers: exactly two orders use it', async ({ request }) => {
    const created = await initVoucher(
      `e2e-race-limited-${Date.now().toString(36)}`,
      { kind: 'amount', amount: 99_999 },
      { quantity: 2, end: '30d', maxPerUser: 0 },
    );
    const code =
      (created as { voucher?: { code?: string }; code?: string }).voucher?.code ??
      (created as { code?: string }).code;
    if (!code) throw new Error(`voucher init returned no code: ${JSON.stringify(created)}`);
    const variant = await pickPurchasableVariant(request);
    const buyers = await prepareBuyers(request, 6, variant);

    const results = await Promise.all(buyers.map((buyer) => freeCheckout(request, buyer, code)));

    expect(serverErrors(results)).toBe(0);
    expect(statusCounts(results)).toEqual({ 201: 2, 409: 4 });
    for (const refused of results.filter(({ status }) => status === 409)) {
      expect(refused.body.error?.code).toBe('voucher_depleted');
    }
    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from voucher_holds where lower(voucher_code) = lower($1) and state = 'consumed'`,
      [code],
    );
    expect(rows[0]?.n).toBe(2);
  });

  test('one account paying the same cart twice at once: places one order', async ({ request }) => {
    const variant = await pickPurchasableVariant(request);
    const [buyer] = await prepareBuyers(request, 1, variant);

    const results = await Promise.all([
      freeCheckout(request, buyer!, voucherCode),
      freeCheckout(request, buyer!, voucherCode),
    ]);

    expect(serverErrors(results)).toBe(0);
    expect(results.filter(({ status }) => status === 201)).toHaveLength(1);
    const { body } = await apiJson<{ orders?: unknown[] }>(request, 'GET', '/account/orders', {
      token: buyer!.accessToken,
      expectedStatus: 200,
    });
    expect(body.orders).toHaveLength(1);
  });

  test('second device during payment: reading and adding to the cart never fails', async ({
    request,
  }) => {
    const variant = await pickPurchasableVariant(request);
    const [buyer] = await prepareBuyers(request, 1, variant);

    // The order deletes the emptied active cart. An add that read the cart id
    // just before that delete used to fail on the cart foreign key, so the
    // adds are spread across the whole checkout to land on both sides of it.
    const adds = 24;
    const [paid, ...added] = await Promise.all([
      freeCheckout(request, buyer!, voucherCode),
      ...Array.from({ length: adds }, (_, index) =>
        new Promise((resolve) => setTimeout(resolve, index * 6)).then(() =>
          // Reading the cart re-syncs its cart-rule gift lines, a write too.
          index % 2
            ? apiJson(request, 'GET', '/account/cart', { token: buyer!.accessToken })
            : apiJson(request, 'POST', '/account/cart', {
                token: buyer!.accessToken,
                data: {
                  productId: variant.productId,
                  shapeKey: variant.shapeKey,
                  lengthKey: variant.lengthKey,
                  size: variant.size,
                  quantity: 1,
                },
              }),
        ),
      ),
    ]);

    expect(paid!.status).toBe(201);
    expect(statusCounts(added)).toEqual({ 200: adds });
    // Whatever the interleaving, the account still has one active cart to
    // shop in afterwards.
    await addCartLine(request, buyer!.accessToken, variant);
    const { body } = await apiJson<{ carts?: Array<{ isActive?: boolean }> }>(
      request,
      'GET',
      '/account/carts',
      { token: buyer!.accessToken, expectedStatus: 200 },
    );
    expect((body.carts ?? []).filter((cart) => cart.isActive)).toHaveLength(1);
  });

  test('two first invoice downloads: they share one invoice number', async ({ request }) => {
    const variant = await pickPurchasableVariant(request);
    const [buyer] = await prepareBuyers(request, 1, variant);
    const { body } = await freeCheckout(request, buyer!, voucherCode);
    const orderId = body.order!.id!;
    const { rows: before } = await pool.query<{ n: string }>(
      `select last_value::text as n from invoice_number_seq`,
    );

    const downloads = await Promise.all(
      Array.from({ length: 4 }, () =>
        request.get(`/account/orders/${orderId}/invoice`, {
          headers: { Authorization: `Bearer ${buyer!.accessToken}` },
        }),
      ),
    );

    expect(downloads.map((response) => response.status())).toEqual([200, 200, 200, 200]);
    const names = new Set(downloads.map((response) => response.headers()['content-disposition']));
    expect(names.size).toBe(1);
    // No number was reserved and then thrown away by a losing request.
    const { rows: after } = await pool.query<{ n: string }>(
      `select last_value::text as n from invoice_number_seq`,
    );
    expect(Number(after[0]!.n) - Number(before[0]!.n)).toBeLessThanOrEqual(1);
  });

  test('a set composed on a second device while the first one pays: is kept', async ({ request }) => {
    const variant = await pickPurchasableVariant(request);
    const [buyer] = await prepareBuyers(request, 1, variant);
    const composed = await compositionBody(request, E2E_PRODUCT_UIDS.NAIL_A);

    const [paid, ...saved] = await Promise.all([
      freeCheckout(request, buyer!, voucherCode),
      ...Array.from({ length: 3 }, () =>
        apiJson(request, 'POST', '/account/cart/compositions', { token: buyer!.accessToken, data: composed }),
      ),
    ]);

    expect(serverErrors([paid!, ...saved])).toBe(0);
    expect(paid!.status).toBe(201);
    expect(statusCounts(saved)).toEqual({ 201: 3 });
  });

  test('one account claiming the same guest order twice at once: owns it once', async ({ request }) => {
    const variant = await pickPurchasableVariant(request);
    const email = uniqueEmail('race-claim');
    const { body: placed } = await apiJson<{ order?: { id: string; integrityToken: string } }>(
      request,
      'POST',
      '/checkout/guest/free',
      {
        data: {
          items: [
            {
              productId: variant.productId,
              shapeKey: variant.shapeKey,
              lengthKey: variant.lengthKey,
              size: variant.size,
              packKey: '',
              quantity: 1,
            },
          ],
          address: {
            recipientName: 'Ada Lovelace',
            line1: '10 rue de Test',
            postalCode: '75001',
            city: 'Paris',
            countryCode: 'FR',
            phone: '+33601020304',
          },
          courierCode: testCourierCode,
          express: false,
          email,
          gdprConsent: { accepted: true },
          language: 'fr',
          voucherCode,
        },
        expectedStatus: 201,
      },
    );
    const order = placed.order!;
    const account = await registerUser(request, { email });

    const claims = await Promise.all(
      [0, 1].map(() =>
        apiJson(request, 'POST', `/account/guest-orders/${order.id}/claim`, {
          token: account.accessToken,
          data: { integrityToken: order.integrityToken },
        }),
      ),
    );

    expect(serverErrors(claims)).toBe(0);
    expect(claims.filter(({ status }) => status === 200)).toHaveLength(1);
    const { rows } = await pool.query<{ user_id: string | null }>(
      `select user_id from orders where id = $1`,
      [order.id],
    );
    expect(rows[0]?.user_id).toBe(account.user.id);
  });
});
