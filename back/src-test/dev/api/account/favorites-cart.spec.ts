import { test, expect } from 'patchright/test';
import { apiJson, pickPurchasableVariant, registerUser } from '../../support/api.js';

test.describe('API favorites and cart', () => {
  test('gallery feed: a favorite and a cart line can both be added', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const { body: feed } = await apiJson<{ items?: Array<Record<string, unknown>> }>(request, 'GET', '/gallery/feed?limit=6', {
      expectedStatus: 200,
    });

    const items = feed.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    const item = items[0]!;
    const id = String(item.id);
    const shapeObj = (item.shape ?? {}) as Record<string, string>;
    const shapeKey = Object.keys(shapeObj)[0];
    expect(shapeKey).toBeTruthy();

    const lengthsByShape = (item.lengthsByShape ?? {}) as Record<string, Record<string, string>>;
    const lengthKey = Object.keys(lengthsByShape[shapeKey!] ?? {})[0];
    expect(lengthKey).toBeTruthy();

    const available = (item.available ?? {}) as Record<string, Record<string, Record<string, number>>>;
    const sizeEntry = available[shapeKey!]?.[lengthKey!] ?? {};
    const size =
      (['M', 'S', 'L', 'XS'] as const).find((s) => (sizeEntry[s] ?? 0) > 0) ??
      (Object.keys(sizeEntry)[0] as 'XS' | 'S' | 'M' | 'L' | undefined) ??
      'M';

    await apiJson(request, 'POST', '/account/favorites', {
      token: accessToken,
      data: { productId: id, shapeKey, lengthKey },
      expectedStatus: 200,
    });

    const { body: favs } = await apiJson<{ favorites?: unknown[] }>(request, 'GET', '/account/favorites', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((favs.favorites ?? []).length).toBeGreaterThan(0);

    await apiJson(request, 'POST', '/account/cart', {
      token: accessToken,
      data: { productId: id, shapeKey, lengthKey, size, quantity: 1 },
      expectedStatus: 200,
    });

    const { body: cart } = await apiJson<{ items?: unknown[] }>(request, 'GET', '/account/cart', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((cart.items ?? []).length).toBeGreaterThan(0);
  });

  test('a favorite: records the active shape, then is removed by product', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const variant = await pickPurchasableVariant(request, { token: accessToken });

    for (const badBody of [
      {},
      { productId: variant.productId },
      { shapeKey: variant.shapeKey },
      { productId: variant.productId, shapeKey: 'not-a-shape' },
    ]) {
      await apiJson(request, 'POST', '/account/favorites', {
        token: accessToken,
        data: badBody,
        expectedStatus: [400, 404],
      });
    }

    // lengthKey is optional — it resolves to the shape's own first length.
    await apiJson(request, 'POST', '/account/favorites', {
      token: accessToken,
      data: { productId: variant.productId, shapeKey: variant.shapeKey },
      expectedStatus: 200,
    });
    const { body: created } = await apiJson<{
      favorites?: Array<{ productId: string; shapeKey: string; lengthKey: string }>;
    }>(request, 'GET', '/account/favorites', { token: accessToken, expectedStatus: 200 });
    expect(created.favorites).toHaveLength(1);
    expect(created.favorites?.[0]?.productId).toBe(variant.productId);
    expect(created.favorites?.[0]?.lengthKey).toBeTruthy();

    // Re-posting an already-favorited set is an upsert of the active shape,
    // never a second row — the gallery card calls it on every tab switch.
    await apiJson(request, 'POST', '/account/favorites', {
      token: accessToken,
      data: {
        productId: variant.productId,
        shapeKey: variant.shapeKey,
        lengthKey: variant.lengthKey,
      },
      expectedStatus: 200,
    });
    const { body: upserted } = await apiJson<{
      favorites?: Array<{ productId: string; shapeKey: string; lengthKey: string }>;
    }>(request, 'GET', '/account/favorites', { token: accessToken, expectedStatus: 200 });
    expect(upserted.favorites).toHaveLength(1);
    expect(upserted.favorites?.[0]?.shapeKey).toBe(variant.shapeKey);
    expect(upserted.favorites?.[0]?.lengthKey).toBe(variant.lengthKey);

    const { body: deleted } = await apiJson<{ deleted?: boolean }>(
      request,
      'DELETE',
      `/account/favorites/${variant.productId}`,
      { token: accessToken, expectedStatus: 200 },
    );
    expect(deleted.deleted).toBe(true);
    const { body: empty } = await apiJson<{ favorites?: unknown[] }>(
      request,
      'GET',
      '/account/favorites',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(empty.favorites).toEqual([]);

    // Removing something that was never favorited reports it rather than
    // failing — the heart is a toggle, not a transaction.
    const { body: again } = await apiJson<{ deleted?: boolean }>(
      request,
      'DELETE',
      `/account/favorites/${variant.productId}`,
      { token: accessToken, expectedStatus: 200 },
    );
    expect(again.deleted).toBe(false);

    await apiJson(request, 'GET', '/account/favorites', { expectedStatus: 401 });
  });
});
