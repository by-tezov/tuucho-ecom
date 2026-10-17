import { test, expect } from 'patchright/test';
import { apiJson, registerAdmin, uniqueEmail } from '../../support/api.js';
import { E2E_PRODUCT_UIDS } from '../../support/catalog.js';

type StockRow = {
  productUid: string;
  title: string;
  thumbnail: string | null;
  createdAt: string;
  price: number | null;
  shapeKey: string;
  shapeLabel: string;
  lengthKey: string;
  lengthLabel: string;
  sizes: Record<'XS' | 'S' | 'M' | 'L', number>;
  total: number;
  stockValue: number | null;
  owners?: string[];
};
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
type StockPage = { rows?: StockRow[]; pagination?: Pagination };

/** The disposable catalogue is shared with every other spec, so each stock
 * write below is followed by a write that restores exactly what it read. */
test.describe('API admin catalogue', () => {
  test('public nail variants: are paged, searchable and editable', async ({ request }) => {
    const admin = await registerAdmin(request);

    const { body: page } = await apiJson<StockPage>(request, 'GET', '/admin/library-stock', {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(page.pagination?.page).toBe(1);
    expect(page.pagination?.pageSize).toBe(15);
    expect((page.rows ?? []).length).toBeLessThanOrEqual(15);
    expect(page.pagination?.total).toBeGreaterThan(0);

    // `q` filters on the product UID: a plain substring, or a whole-UID glob.
    const uid = E2E_PRODUCT_UIDS.A1;
    const { body: searched } = await apiJson<StockPage>(
      request,
      'GET',
      `/admin/library-stock?q=${encodeURIComponent(uid)}`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    const rows = searched.rows ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.productUid === uid)).toBe(true);
    const { body: globbed } = await apiJson<StockPage>(
      request,
      'GET',
      `/admin/library-stock?q=${encodeURIComponent(`${uid.slice(0, 2)}-*`)}`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect((globbed.rows ?? []).every((row) => row.productUid.startsWith(uid.slice(0, 2)))).toBe(true);

    // One entry per product × shape × length, never aggregated across shapes.
    const variant = rows[0]!;
    expect(variant.shapeKey).toBeTruthy();
    expect(variant.lengthKey).toBeTruthy();
    expect(variant.shapeLabel).toBeTruthy();
    expect(variant.total).toBe(
      variant.sizes.XS + variant.sizes.S + variant.sizes.M + variant.sizes.L,
    );
    if (variant.price !== null) expect(variant.stockValue).toBeCloseTo(variant.price * variant.total, 5);

    for (const badBody of [
      {},
      { shapeKey: variant.shapeKey },
      { shapeKey: variant.shapeKey, lengthKey: variant.lengthKey },
      { shapeKey: 'not-a-shape', lengthKey: variant.lengthKey, price: 1 },
      { shapeKey: variant.shapeKey, lengthKey: variant.lengthKey, price: -1 },
      { shapeKey: variant.shapeKey, lengthKey: variant.lengthKey, sizes: { XS: -1, S: 0, M: 0, L: 0 } },
    ]) {
      await apiJson(request, 'PATCH', `/admin/library-stock/${uid}`, {
        token: admin.accessToken,
        data: badBody,
        expectedStatus: 400,
      });
    }
    await apiJson(request, 'PATCH', '/admin/library-stock/ZZ-ZZ-999', {
      token: admin.accessToken,
      data: { shapeKey: variant.shapeKey, lengthKey: variant.lengthKey, price: 10 },
      expectedStatus: 404,
    });

    // Re-writing the exact same source quantities is a real write through the
    // delete-and-reinsert path, and must return the variant unchanged.
    const { body: rewritten } = await apiJson<{ row?: StockRow }>(
      request,
      'PATCH',
      `/admin/library-stock/${uid}`,
      {
        token: admin.accessToken,
        data: { shapeKey: variant.shapeKey, lengthKey: variant.lengthKey, sizes: variant.sizes },
        expectedStatus: 200,
      },
    );
    expect(rewritten.row?.productUid).toBe(uid);
    expect(rewritten.row?.shapeKey).toBe(variant.shapeKey);
    expect(rewritten.row?.sizes).toEqual(variant.sizes);
    expect(rewritten.row?.total).toBe(variant.total);

    // A price change appends a history row; put the old price back after.
    const newPrice = Number(((variant.price ?? 10) + 1).toFixed(2));
    const { body: repriced } = await apiJson<{ row?: StockRow }>(
      request,
      'PATCH',
      `/admin/library-stock/${uid}`,
      {
        token: admin.accessToken,
        data: { shapeKey: variant.shapeKey, lengthKey: variant.lengthKey, price: newPrice },
        expectedStatus: 200,
      },
    );
    expect(repriced.row?.price).toBe(newPrice);
    if (variant.price !== null) {
      const { body: restored } = await apiJson<{ row?: StockRow }>(
        request,
        'PATCH',
        `/admin/library-stock/${uid}`,
        {
          token: admin.accessToken,
          data: { shapeKey: variant.shapeKey, lengthKey: variant.lengthKey, price: variant.price },
          expectedStatus: 200,
        },
      );
      expect(restored.row?.price).toBe(variant.price);
    }
  });

  test('accessory stock: keeps a single available pool and one pricing model', async ({ request }) => {
    const admin = await registerAdmin(request);

    const { body: page } = await apiJson<{
      rows?: Array<{
        productUid: string;
        title: string;
        type: string;
        packs: Record<string, number>;
        unitPrice: number | null;
        packPrices: Record<string, number> | null;
        available: number;
        stockValue: number | null;
      }>;
      pagination?: Pagination;
    }>(request, 'GET', '/admin/accessory-stock', { token: admin.accessToken, expectedStatus: 200 });
    expect(page.pagination?.pageSize).toBe(15);
    const accessory = (page.rows ?? [])[0];
    expect(accessory).toBeTruthy();
    // Exactly one of the two pricing models, never both.
    expect(accessory!.unitPrice === null || accessory!.packPrices === null).toBe(true);

    for (const badBody of [
      {},
      { available: -1 },
      { unitPrice: -1 },
      { unitPrice: 1, packPrices: { x2: 2 } },
      { packPrices: [] },
    ]) {
      await apiJson(request, 'PATCH', `/admin/accessory-stock/${accessory!.productUid}`, {
        token: admin.accessToken,
        data: badBody,
        expectedStatus: 400,
      });
    }
    await apiJson(request, 'PATCH', '/admin/accessory-stock/ZZ-ZZ-999', {
      token: admin.accessToken,
      data: { available: 1 },
      expectedStatus: 404,
    });

    // Write the same pool back so the shared gift stock is untouched.
    const { body: rewritten } = await apiJson<{ row?: { productUid: string; available: number } }>(
      request,
      'PATCH',
      `/admin/accessory-stock/${accessory!.productUid}`,
      { token: admin.accessToken, data: { available: accessory!.available }, expectedStatus: 200 },
    );
    expect(rewritten.row?.productUid).toBe(accessory!.productUid);
    expect(rewritten.row?.available).toBe(accessory!.available);
  });

  test('private creations: are listed with their owners', async ({ request }) => {
    const admin = await registerAdmin(request);

    const { body: page } = await apiJson<StockPage>(
      request,
      'GET',
      `/admin/user-library-stock?q=${encodeURIComponent(E2E_PRODUCT_UIDS.USER_A)}`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    const variant = (page.rows ?? [])[0];
    expect(variant?.productUid).toBe(E2E_PRODUCT_UIDS.USER_A);
    // The private-library view is the only one that names the recipients.
    expect(Array.isArray(variant?.owners)).toBe(true);
    expect(variant!.owners!.length).toBeGreaterThan(0);

    // The public stock view must never surface a user-library product.
    const { body: publicView } = await apiJson<StockPage>(
      request,
      'GET',
      `/admin/library-stock?q=${encodeURIComponent(E2E_PRODUCT_UIDS.USER_A)}`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect(publicView.rows).toEqual([]);

    const { body: rewritten } = await apiJson<{ row?: StockRow }>(
      request,
      'PATCH',
      `/admin/user-library-stock/${E2E_PRODUCT_UIDS.USER_A}`,
      {
        token: admin.accessToken,
        data: { shapeKey: variant!.shapeKey, lengthKey: variant!.lengthKey, sizes: variant!.sizes },
        expectedStatus: 200,
      },
    );
    expect(rewritten.row?.sizes).toEqual(variant!.sizes);
    expect(Array.isArray(rewritten.row?.owners)).toBe(true);

    // The two stock endpoints are scoped to their own audience.
    await apiJson(request, 'PATCH', `/admin/user-library-stock/${E2E_PRODUCT_UIDS.A1}`, {
      token: admin.accessToken,
      data: { shapeKey: variant!.shapeKey, lengthKey: variant!.lengthKey, price: 10 },
      expectedStatus: 404,
    });
  });

  test('cart rules: are upserted, toggled and deleted', async ({ request }) => {
    const admin = await registerAdmin(request);
    const code = `e2e-admin-rule-${Date.now().toString(36)}`;

    const { body: before } = await apiJson<{
      rules?: Array<{ code: string; kind: string; enabled: boolean; priority: number; forbidVoucher: boolean }>;
    }>(request, 'GET', '/admin/cart-rules', { token: admin.accessToken, expectedStatus: 200 });
    const seeded = before.rules ?? [];
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.map((rule) => rule.kind)).toEqual(
      expect.arrayContaining(['gift_per_nail_set', 'nail_qty_percent_tiers', 'free_shipping_above']),
    );

    for (const badBody of [
      {},
      { code, kind: 'not_a_kind', params: {} },
      { code, kind: 'free_shipping_above' },
    ]) {
      await apiJson(request, 'POST', '/admin/cart-rules', {
        token: admin.accessToken,
        data: badBody,
        expectedStatus: 400,
      });
    }
    const { body: badParams } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/admin/cart-rules',
      {
        token: admin.accessToken,
        data: { code, kind: 'free_shipping_above', params: { thresholdsByCountry: { FR: 'free' } } },
        expectedStatus: 400,
      },
    );
    expect(badParams.error?.code).toBe('invalid_params');

    // A threshold nothing can reach keeps this rule inert for every other
    // spec sharing the database, even while it is briefly enabled.
    const { body: created } = await apiJson<{
      rule?: { code: string; kind: string; enabled: boolean; priority: number; forbidVoucher: boolean; params: unknown };
    }>(request, 'POST', '/admin/cart-rules', {
      token: admin.accessToken,
      data: {
        code,
        kind: 'free_shipping_above',
        params: { thresholdsByCountry: { FR: 9_999_999 } },
        enabled: false,
        priority: 99,
        forbidVoucher: false,
      },
      expectedStatus: 200,
    });
    expect(created.rule?.code).toBe(code);
    expect(created.rule?.enabled).toBe(false);
    expect(created.rule?.priority).toBe(99);

    await apiJson(request, 'PATCH', `/admin/cart-rules/${code}/enabled`, {
      token: admin.accessToken,
      data: { enabled: 'yes' },
      expectedStatus: 400,
    });
    await apiJson(request, 'PATCH', '/admin/cart-rules/no-such-rule/enabled', {
      token: admin.accessToken,
      data: { enabled: true },
      expectedStatus: 404,
    });
    await apiJson(request, 'PATCH', `/admin/cart-rules/${code}/enabled`, {
      token: admin.accessToken,
      data: { enabled: false },
      expectedStatus: 200,
    });

    const { body: listed } = await apiJson<{ rules?: Array<{ code: string; enabled: boolean }> }>(
      request,
      'GET',
      '/admin/cart-rules',
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect((listed.rules ?? []).find((rule) => rule.code === code)?.enabled).toBe(false);

    await apiJson(request, 'DELETE', `/admin/cart-rules/${code}`, {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    await apiJson(request, 'DELETE', `/admin/cart-rules/${code}`, {
      token: admin.accessToken,
      expectedStatus: 404,
    });
    const { body: after } = await apiJson<{ rules?: Array<{ code: string }> }>(
      request,
      'GET',
      '/admin/cart-rules',
      { token: admin.accessToken, expectedStatus: 200 },
    );
    // The seeded permanent rules are untouched by this round trip.
    expect((after.rules ?? []).map((rule) => rule.code).sort()).toEqual(
      seeded.map((rule) => rule.code).sort(),
    );
  });

  test('vouchers: are created, restricted to accounts and disabled', async ({ request }) => {
    const admin = await registerAdmin(request);
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;

    for (const badBody of [
      {},
      { quantity: 0, startsAt: today, endsAt: nextYear, offerType: 'percent', value: 10 },
      { quantity: 1, startsAt: 'soon', endsAt: nextYear, offerType: 'percent', value: 10 },
      { quantity: 1, startsAt: nextYear, endsAt: today, offerType: 'percent', value: 10 },
      { quantity: 1, startsAt: today, endsAt: nextYear, offerType: 'magic', value: 10 },
      { quantity: 1, startsAt: today, endsAt: nextYear, offerType: 'percent', value: 101 },
      { quantity: 1, startsAt: today, endsAt: nextYear, offerType: 'amount', value: 0 },
      { quantity: 1, startsAt: today, endsAt: nextYear, offerType: 'free_item_nth', value: 0 },
      { quantity: 1, startsAt: today, endsAt: nextYear, offerType: 'percent', value: 10, maxUsesPerUser: -1 },
      {
        quantity: 1,
        startsAt: today,
        endsAt: nextYear,
        offerType: 'percent',
        value: 10,
        minSubtotal: 50,
      },
      {
        quantity: 1,
        startsAt: today,
        endsAt: nextYear,
        offerType: 'amount',
        value: 5,
        minSubtotal: 0,
      },
    ]) {
      await apiJson(request, 'POST', '/admin/vouchers', {
        token: admin.accessToken,
        data: badBody,
        expectedStatus: 400,
      });
    }

    // An unknown restricted address is a 404, not a silently public voucher.
    await apiJson(request, 'POST', '/admin/vouchers', {
      token: admin.accessToken,
      data: {
        quantity: 1,
        startsAt: today,
        endsAt: nextYear,
        offerType: 'free_shipping',
        emails: [uniqueEmail('never-registered')],
      },
      expectedStatus: 404,
    });

    // No code supplied: the server mints one, same as the CLI.
    const { body: generated } = await apiJson<{ code?: string }>(request, 'POST', '/admin/vouchers', {
      token: admin.accessToken,
      data: { quantity: 5, startsAt: today, endsAt: nextYear, offerType: 'free_shipping' },
      expectedStatus: 201,
    });
    expect(generated.code).toBeTruthy();

    const code = `E2E-ADMIN-${Date.now().toString(36).toUpperCase()}`;
    const { body: created } = await apiJson<{ code?: string }>(request, 'POST', '/admin/vouchers', {
      token: admin.accessToken,
      data: {
        code,
        quantity: 3,
        startsAt: today,
        endsAt: nextYear,
        offerType: 'percent',
        value: 15,
        emails: [admin.email],
      },
      expectedStatus: 201,
    });
    expect(created.code).toBe(code);

    const capCode = `E2E-CAP-${Date.now().toString(36).toUpperCase()}`;
    await apiJson(request, 'POST', '/admin/vouchers', {
      token: admin.accessToken,
      data: {
        code: capCode,
        quantity: 10,
        maxUsesPerUser: 2,
        minSubtotal: 25,
        startsAt: today,
        endsAt: nextYear,
        offerType: 'amount',
        value: 5,
      },
      expectedStatus: 201,
    });

    // Codes are unique case-insensitively.
    await apiJson(request, 'POST', '/admin/vouchers', {
      token: admin.accessToken,
      data: {
        code: code.toLowerCase(),
        quantity: 1,
        startsAt: today,
        endsAt: nextYear,
        offerType: 'free_shipping',
      },
      expectedStatus: 409,
    });

    const { body: listed } = await apiJson<{
      vouchers?: Array<{
        code: string;
        enabled: boolean;
        quantity: number;
        allowedEmails: string[];
        redemptions: Array<{
          email: string | null;
          orderNumber: string;
          redeemedAt: string;
        }>;
        offer?: { type?: string; percent?: number };
        maxUsesPerUser?: number;
        minSubtotal?: number | null;
      }>;
    }>(request, 'GET', '/admin/vouchers', { token: admin.accessToken, expectedStatus: 200 });
    const voucher = (listed.vouchers ?? []).find((entry) => entry.code === code);
    expect(voucher?.enabled).toBe(true);
    expect(voucher?.quantity).toBe(3);
    expect(voucher?.offer?.type).toBe('percent');
    expect(voucher?.offer?.percent).toBe(15);
    expect(voucher?.maxUsesPerUser).toBe(1);
    expect(voucher?.minSubtotal).toBeNull();
    // Restricted vouchers report the addresses, never raw user ids.
    expect(voucher?.allowedEmails).toEqual([admin.email]);
    expect(voucher?.redemptions).toEqual([]);

    const capped = (listed.vouchers ?? []).find((entry) => entry.code === capCode);
    expect(capped?.maxUsesPerUser).toBe(2);
    expect(capped?.minSubtotal).toBe(25);
    expect(capped?.offer?.type).toBe('amount');

    await apiJson(request, 'PATCH', `/admin/vouchers/${code}/enabled`, {
      token: admin.accessToken,
      data: { enabled: 'no' },
      expectedStatus: 400,
    });
    await apiJson(request, 'PATCH', '/admin/vouchers/NO-SUCH-CODE/enabled', {
      token: admin.accessToken,
      data: { enabled: false },
      expectedStatus: 404,
    });
    await apiJson(request, 'PATCH', `/admin/vouchers/${code}/enabled`, {
      token: admin.accessToken,
      data: { enabled: false },
      expectedStatus: 200,
    });

    const { body: afterDisable } = await apiJson<{
      vouchers?: Array<{ code: string; enabled: boolean; quantity: number }>;
    }>(request, 'GET', '/admin/vouchers', { token: admin.accessToken, expectedStatus: 200 });
    const disabled = (afterDisable.vouchers ?? []).find((entry) => entry.code === code);
    expect(disabled?.enabled).toBe(false);
    // Disabling changes nothing else about the offer.
    expect(disabled?.quantity).toBe(3);
  });
});
