import { test, expect } from 'patchright/test';
import { pool } from '../../../../src/db/pool.js';
import { getGiftSettings } from '../../../../src/modules/gift/application/giftSettings.js';
import {
  apiJson,
  createAddress,
  createZeroingVoucher,
  registerUser,
  startCheckoutSession,
  testCourierCode,
} from '../../support/api.js';
import { E2E_PRODUCT_UIDS } from '../../support/catalog.js';
import {
  allocatedUnits,
  freeCheckout,
  prepareBuyers,
  raceVariant,
  serverErrors,
  setFreeUnits,
  SOLD_OUT_CODES,
  statusCounts,
} from '../../support/concurrency.js';
import {
  countOrdersForOffer,
  createGiftOffer,
  createOfferBody,
  extractGiftGiverToken,
  loadGiverPortal,
  putJulieDestination,
  putReceiverItem,
  seedOpenGiftCarts,
  seedReceiverChoice,
  waitForGiftShareMail,
  type GiftErrorBody,
} from '../../support/gift.js';

function receiverTokenFromUrl(url: string | null | undefined): string {
  const token = url?.match(/\/gift\/([A-Fa-f0-9]{64})/)?.[1];
  if (!token) throw new Error(`no receiver token in ${url}`);
  return token;
}

/** A signed-in giver's fresh offer: its id, receiver token and giver token. */
async function signedInOffer(request: Parameters<typeof apiJson>[0]) {
  const marc = await registerUser(request);
  const sinceMs = Date.now() - 1_000;
  const { body } = await createGiftOffer(request, createOfferBody({ giverEmail: marc.email }), {
    token: marc.accessToken,
  });
  const mail = await waitForGiftShareMail(marc.email, sinceMs);
  return {
    marc,
    offerId: body.offerId!,
    receiverToken: receiverTokenFromUrl(body.receiverUrl),
    giverToken: extractGiftGiverToken(mail.html),
  };
}

test.describe('API concurrency: gift', () => {
  let voucherCode: string;

  test.beforeAll(async () => {
    voucherCode = await createZeroingVoucher('gift-race');
  });

  test('parallel wrong PINs: cannot get past the free-failure allowance', async ({ request }) => {
    const free = (await getGiftSettings(pool)).pinFreeFailures;
    const sinceMs = Date.now() - 1_000;
    const offerBody = createOfferBody();
    const { body: created } = await createGiftOffer(request, offerBody);
    const mail = await waitForGiftShareMail(String(offerBody.giverEmail), sinceMs);
    const portal = await loadGiverPortal(request, extractGiftGiverToken(mail.html));
    const receiverToken = portal.shareCard!.receiverToken!;

    const guesses = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        apiJson<GiftErrorBody>(request, 'POST', `/gift/${receiverToken}/pin`, {
          data: { pin: String(1000 + index) },
        }),
      ),
    );

    expect(serverErrors(guesses)).toBe(0);
    // Every guess was actually checked against the PIN only while the counter
    // was under the allowance; every later one was turned away unchecked.
    const checked = guesses.filter(({ body }) => body.error?.code === 'gift_pin_invalid');
    expect(checked).toHaveLength(free - 1);
    const { rows } = await pool.query<{ failed_count: number }>(
      `select a.failed_count from gift_pin_attempts a where a.offer_id = $1 and a.role = 'receiver'`,
      [created.offerId],
    );
    expect(rows[0]?.failed_count).toBe(free);
    // The right PIN is still refused while the backoff runs.
    const { status } = await apiJson(request, 'POST', `/gift/${receiverToken}/pin`, {
      data: { pin: offerBody.accessPin },
    });
    expect(status).toBe(429);
  });

  test('a double: confirm holds the stock once', async ({ request }) => {
    const { marc, receiverToken } = await signedInOffer(request);
    const variant = await raceVariant(E2E_PRODUCT_UIDS.RACE_GIFT);
    await setFreeUnits(variant, 5);
    await putReceiverItem(request, receiverToken, variant, 1);
    await putJulieDestination(request, receiverToken);
    const allocatedBefore = await allocatedUnits(variant);

    const results = await Promise.all([
      apiJson(request, 'POST', `/gift/${receiverToken}/confirm`),
      apiJson(request, 'POST', `/gift/${receiverToken}/confirm`),
    ]);

    expect(statusCounts(results)).toEqual({ 200: 2 });
    expect(await allocatedUnits(variant)).toBe(allocatedBefore + 1);
    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from stock_reservations
       where user_id = $1 and purpose = 'gift' and state = 'held'`,
      [marc.user.id],
    );
    expect(rows[0]?.n).toBe(1);
  });

  test('a receiver confirm and a shop checkout racing for the last unit: one wins', async ({ request }) => {
    const { receiverToken } = await signedInOffer(request);
    const variant = await raceVariant(E2E_PRODUCT_UIDS.RACE_GIFT);
    await setFreeUnits(variant, 5);
    await putReceiverItem(request, receiverToken, variant, 1);
    await putJulieDestination(request, receiverToken);
    const [buyer] = await prepareBuyers(request, 1, variant);
    await setFreeUnits(variant, 1);
    const allocatedBefore = await allocatedUnits(variant);

    const [confirm, checkout] = await Promise.all([
      apiJson<GiftErrorBody>(request, 'POST', `/gift/${receiverToken}/confirm`),
      freeCheckout(request, buyer!, voucherCode),
    ]);

    expect(serverErrors([confirm, checkout])).toBe(0);
    const winners = [confirm.status === 200, checkout.status === 201].filter(Boolean);
    expect(winners).toHaveLength(1);
    if (confirm.status !== 200) expect(confirm.body.error?.code).toBe('gift_stock_unavailable');
    if (checkout.status !== 201) expect(SOLD_OUT_CODES).toContain(checkout.body.error?.code);
    expect(await allocatedUnits(variant)).toBe(allocatedBefore + 1);
  });

  test('a giver paying twice at once: places one order', async ({ request }) => {
    const { marc, offerId, receiverToken, giverToken } = await signedInOffer(request);
    await seedReceiverChoice(request, receiverToken);
    const address = await createAddress(request, marc.accessToken, { recipientName: 'Marc Giver' });
    const cart = {
      addressId: address.id,
      courierCode: testCourierCode,
      express: false,
      voucherCode,
      applyLoyalty: false,
    };
    await apiJson(request, 'PUT', `/gift/giver/${giverToken}/cart`, {
      token: marc.accessToken,
      giftPin: false,
      data: cart,
      expectedStatus: 200,
    });
    const { body: giftCart } = await apiJson<{ cart?: { id?: string } }>(
      request,
      'GET',
      `/gift/giver/${giverToken}/cart`,
      { token: marc.accessToken, giftPin: false, expectedStatus: 200 },
    );
    await apiJson(request, 'POST', `/account/carts/${giftCart.cart!.id}/activate`, {
      token: marc.accessToken,
      expectedStatus: 200,
    });
    const checkoutSession = await startCheckoutSession(request, marc.accessToken);

    const results = await Promise.all(
      [0, 1].map(() =>
        apiJson(request, 'POST', '/account/checkout/free', {
          token: marc.accessToken,
          checkoutSession,
          data: cart,
        }),
      ),
    );

    expect(serverErrors(results)).toBe(0);
    expect(results.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(await countOrdersForOffer(offerId)).toBe(1);
  });

  test('three offers: created at once cannot exceed the open-promise ceiling', async ({ request }) => {
    const ceiling = (await getGiftSettings(pool)).maxOpenPromisesPerGiver;
    const dana = await registerUser(request);
    await seedOpenGiftCarts(String(dana.user.id), ceiling - 1);

    const results = await Promise.all(
      [0, 1, 2].map(() =>
        createGiftOffer(request, createOfferBody({ giverEmail: dana.email }), {
          token: dana.accessToken,
          expectedStatus: [201, 400],
        }),
      ),
    );

    expect(statusCounts(results)).toEqual({ 201: 1, 400: 2 });
    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from carts where user_id = $1 and kind = 'gift'`,
      [dana.user.id],
    );
    expect(rows[0]?.n).toBe(ceiling);
  });
});
