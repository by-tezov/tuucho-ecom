import { test, expect } from 'patchright/test';
import { apiJson, registerAdmin } from '../../support/api.js';
import { E2E_PRODUCT_UIDS } from '../../support/catalog.js';

test.describe('API gallery', () => {
  test('gallery feed, featured, and filter-options: each public route responds', async ({ request }) => {
    const feed = await apiJson<{ items?: Array<{ id: string; productUid: string; title: string }> }>(request, 'GET', '/gallery/feed?limit=60', {
      expectedStatus: 200,
    });
    expect(feed.body).toBeTruthy();
    const items = feed.body.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    const titles = items.map((item) => item.title);
    // The database's locale correctly treats punctuation as secondary for
    // user-facing alphabetical order. Plain String.localeCompare() does not
    // make that intent explicit and can incorrectly put "&" before words.
    const titleCollator = new Intl.Collator('fr', { sensitivity: 'base', ignorePunctuation: true });
    expect(titles).toEqual([...titles].sort(titleCollator.compare));

    const featured = await apiJson(request, 'GET', '/gallery/featured?limit=5', {
      expectedStatus: 200,
    });
    expect(Array.isArray(featured.body)).toBe(true);
    expect((featured.body as Array<{ id?: string; title?: string }>).length).toBeGreaterThan(0);
    expect((featured.body as Array<{ id?: string; title?: string }>).every((item) => item.id && item.title)).toBe(true);

    const filters = await apiJson(request, 'GET', '/gallery/filter-options', {
      expectedStatus: 200,
    });
    const filterBody = filters.body as { shape?: unknown[]; size?: unknown[]; priceRange?: { min?: number; max?: number } };
    expect(Array.isArray(filterBody.shape)).toBe(true);
    expect((filterBody.shape ?? []).length).toBeGreaterThan(0);
    expect(Array.isArray(filterBody.size)).toBe(true);
    expect(filterBody.priceRange?.max).toBeGreaterThan(filterBody.priceRange?.min ?? Number.POSITIVE_INFINITY);

    const first = items.find((item) => /^[A-Za-z]{2}-[A-Za-z]{2}-\d{3}$/.test(item.productUid));
    expect(first).toBeTruthy();
    const set = await apiJson(request, 'GET', `/gallery/set/${encodeURIComponent(first!.productUid)}`, {
      expectedStatus: 200,
    });
    expect((set.body as { id?: string; productUid?: string }).id).toBe(first!.id);
    expect((set.body as { productUid?: string }).productUid).toBe(first!.productUid);

    const hydrated = await apiJson(request, 'GET', `/gallery/products?ids=${encodeURIComponent(first!.id)}`, {
      expectedStatus: 200,
    });
    const products = Array.isArray(hydrated.body) ? hydrated.body : [];
    expect(products).toHaveLength(1);
    expect((products[0] as { id?: string }).id).toBe(first!.id);

    const rules = await apiJson(request, 'GET', '/gallery/cart-rules', { expectedStatus: 200 });
    const kinds = ((rules.body as { rules?: Array<{ kind: string }> }).rules ?? []).map((rule) => rule.kind);
    expect(kinds).toEqual(expect.arrayContaining([
      'gift_per_nail_set',
      'nail_qty_percent_tiers',
      'free_shipping_above',
    ]));
  });

  test('Boutique outOfStockEnabled: hides sold-out sets from gallery browsing', async ({ request }) => {
    const admin = await registerAdmin(request);
    const { body: filtersBefore } = await apiJson<{ outOfStockEnabled?: boolean }>(
      request,
      'GET',
      '/gallery/filter-options',
      { expectedStatus: 200 },
    );
    expect(filtersBefore.outOfStockEnabled).toBe(true);

    const { body: soldOutBefore } = await apiJson<{ items?: Array<{ id: string; productUid: string }> }>(
      request,
      'GET',
      '/gallery/feed?stock=out&limit=60',
      { expectedStatus: 200 },
    );
    const soldOut = soldOutBefore.items ?? [];

    await apiJson(request, 'PATCH', '/admin/preferences', {
      token: admin.accessToken,
      data: { outOfStockEnabled: false },
      expectedStatus: 200,
    });

    try {
      const { body: filtersAfter } = await apiJson<{ outOfStockEnabled?: boolean }>(
        request,
        'GET',
        '/gallery/filter-options',
        { expectedStatus: 200 },
      );
      expect(filtersAfter.outOfStockEnabled).toBe(false);

      const { body: coerced } = await apiJson<{ items?: Array<{ productUid: string }> }>(
        request,
        'GET',
        '/gallery/feed?stock=out&limit=60',
        { expectedStatus: 200 },
      );
      const coercedUids = (coerced.items ?? []).map((item) => item.productUid);
      expect(coercedUids).toContain(E2E_PRODUCT_UIDS.A1);
      for (const item of soldOut) {
        expect(coercedUids).not.toContain(item.productUid);
      }

      if (soldOut[0]) {
        await apiJson(request, 'GET', `/gallery/set/${encodeURIComponent(soldOut[0].productUid)}`, {
          expectedStatus: 404,
        });
        const hydrated = await apiJson<Array<{ id: string }>>(
          request,
          'GET',
          `/gallery/products?ids=${encodeURIComponent(soldOut[0].id)}`,
          { expectedStatus: 200 },
        );
        expect(hydrated.body.some((product) => product.id === soldOut[0]!.id)).toBe(true);

        const sitemap = await request.get('/sitemap-products.xml', {
          headers: { 'X-Lumen-Sitemap-Relay': '1' },
        });
        expect(sitemap.status()).toBe(200);
        expect(await sitemap.text()).not.toContain(
          `/creations/${soldOut[0].productUid.toLowerCase()}`,
        );
      }
    } finally {
      await apiJson(request, 'PATCH', '/admin/preferences', {
        token: admin.accessToken,
        data: { outOfStockEnabled: true },
        expectedStatus: 200,
      });
    }
  });

  test('Boutique size-request flag: gates product-request', async ({ request }) => {
    const admin = await registerAdmin(request);
    const { body: filtersBefore } = await apiJson<{
      outOfStockSizeRequestEnabled?: boolean;
    }>(request, 'GET', '/gallery/filter-options', { expectedStatus: 200 });
    expect(filtersBefore.outOfStockSizeRequestEnabled).toBe(true);

    await apiJson(request, 'PATCH', '/admin/preferences', {
      token: admin.accessToken,
      data: { outOfStockSizeRequestEnabled: false },
      expectedStatus: 200,
    });

    try {
      const { body: filtersInert } = await apiJson<{
        outOfStockSizeRequestEnabled?: boolean;
      }>(request, 'GET', '/gallery/filter-options', { expectedStatus: 200 });
      expect(filtersInert.outOfStockSizeRequestEnabled).toBe(false);

      const { status, body } = await apiJson<{ error?: { code?: string } }>(
        request,
        'POST',
        '/contact/product-request',
        {
          data: {
            productId: '00000000-0000-0000-0000-000000000001',
            shapeKey: 'amande',
            lengthKey: 'medium',
            size: 'M',
            email: 'sizes-inert@pamsurin.test',
          },
          expectedStatus: 403,
        },
      );
      expect(status).toBe(403);
      expect(body.error?.code).toBe('product_request_forbidden');
    } finally {
      await apiJson(request, 'PATCH', '/admin/preferences', {
        token: admin.accessToken,
        data: { outOfStockSizeRequestEnabled: true },
        expectedStatus: 200,
      });
    }
  });
});
