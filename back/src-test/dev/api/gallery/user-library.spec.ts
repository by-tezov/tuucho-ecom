import { test, expect } from 'patchright/test';
import { apiJson, loginUser } from '../../support/api.js';
import {
  E2E_PRODUCT_UIDS,
  E2E_USER_LIBRARY_USERS,
} from '../../support/catalog.js';
import { testPassword } from '../../support/env.js';

type GalleryItem = {
  id: string;
  productUid: string;
  title: string;
  shape: Record<string, string>;
  lengthsByShape: Record<string, Record<string, string>>;
  available: Record<string, Record<string, Record<string, number>>>;
};

function items(body: unknown): GalleryItem[] {
  return ((body as { items?: GalleryItem[] }).items ?? []);
}

test.describe('API gallery user library', () => {
  test('personal creations: are visible only to their recipient and stay cart-authorized', async ({ request }) => {
    const tokenA = await loginUser(request, E2E_USER_LIBRARY_USERS.A.email, testPassword);
    const tokenB = await loginUser(request, E2E_USER_LIBRARY_USERS.B.email, testPassword);

    const { body: anonymousBody } = await apiJson(request, 'GET', '/gallery/feed?limit=60', {
      expectedStatus: 200,
    });
    const anonymousUids = items(anonymousBody).map((item) => item.productUid);
    expect(anonymousUids).not.toContain(E2E_PRODUCT_UIDS.USER_A);
    expect(anonymousUids).not.toContain(E2E_PRODUCT_UIDS.USER_B);

    const { body: recipientBody } = await apiJson(
      request,
      'GET',
      '/gallery/feed?limit=60&userLibraryOnly=true',
      { token: tokenA, expectedStatus: 200 },
    );
    const personal = items(recipientBody);
    expect(personal).toHaveLength(1);
    expect(personal[0]?.productUid).toBe(E2E_PRODUCT_UIDS.USER_A);

    const { body: onlyMineBody } = await apiJson(request, 'GET', '/gallery/feed?limit=60&userLibraryOnly=true', {
      token: tokenA,
      expectedStatus: 200,
    });
    expect(items(onlyMineBody).map((item) => item.productUid)).toEqual([E2E_PRODUCT_UIDS.USER_A]);

    const { body: otherBody } = await apiJson(
      request,
      'GET',
      '/gallery/feed?limit=60',
      { token: tokenB, expectedStatus: 200 },
    );
    expect(items(otherBody).map((item) => item.productUid)).not.toContain(E2E_PRODUCT_UIDS.USER_A);

    const item = personal[0]!;
    const shapeKey = Object.keys(item.shape)[0]!;
    const lengthKey = Object.keys(item.lengthsByShape[shapeKey] ?? {})[0]!;
    const sizes = item.available[shapeKey]?.[lengthKey] ?? {};
    const size = (['M', 'S', 'L', 'XS'] as const).find((candidate) => (sizes[candidate] ?? 0) > 0);
    expect(size).toBeTruthy();

    // The feed filter is a privacy boundary, but crafted cart calls must be
    // rejected independently for a product owned by another customer.
    await apiJson(request, 'POST', '/account/cart', {
      token: tokenB,
      data: { productId: item.id, shapeKey, lengthKey, size, quantity: 1 },
      expectedStatus: 404,
    });
    await apiJson(request, 'POST', '/account/cart', {
      token: tokenA,
      data: { productId: item.id, shapeKey, lengthKey, size, quantity: 1 },
      expectedStatus: 200,
    });
    const { body: cart } = await apiJson(request, 'GET', '/account/cart', {
      token: tokenA,
      expectedStatus: 200,
    });
    expect(((cart as { items?: Array<{ productId: string }> }).items ?? [])
      .some((line) => line.productId === item.id)).toBe(true);
  });
});
