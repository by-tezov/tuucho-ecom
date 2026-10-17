import { test, expect } from 'patchright/test';
import {
  apiJson,
  enableAllShopPaymentMethods,
  pickPurchasableVariant,
  registerUser,
  type PurchasableVariant,
} from '../../support/api.js';
import { E2E_PRODUCT_UIDS, E2E_TITLES } from '../../support/catalog.js';

type Cart = {
  id: string;
  name: string;
  kind: 'default' | 'wishlist' | 'rebuy' | 'custom' | 'unconnected';
  isActive: boolean;
  itemCount: number;
  total: number;
};
type CartList = { carts?: Cart[]; cartLimit?: number };
type CartItem = {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
  packKey: string;
  quantity: number;
  origin: 'user' | 'rule';
  locked: boolean;
};

async function addLine(
  request: Parameters<typeof apiJson>[0],
  token: string,
  variant: PurchasableVariant,
  overrides: { size?: string; quantity?: number } = {},
): Promise<void> {
  await apiJson(request, 'POST', '/account/cart', {
    token,
    data: {
      productId: variant.productId,
      shapeKey: variant.shapeKey,
      lengthKey: variant.lengthKey,
      size: overrides.size ?? variant.size,
      quantity: overrides.quantity ?? 1,
    },
    expectedStatus: 200,
  });
}

async function listItems(
  request: Parameters<typeof apiJson>[0],
  token: string,
): Promise<CartItem[]> {
  const { body } = await apiJson<{ items?: CartItem[] }>(request, 'GET', '/account/cart', {
    token,
    expectedStatus: 200,
  });
  return body.items ?? [];
}

/** The seeded `gift_per_nail_set` rule adds its own locked accessory line to
 * any cart holding a nail set, so customer-owned lines are the ones these
 * assertions are about. */
function userLines(items: CartItem[]): CartItem[] {
  return items.filter((item) => item.origin === 'user');
}

function giftLines(items: CartItem[]): CartItem[] {
  return items.filter((item) => item.origin === 'rule');
}

test.describe('API multi-cart', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });

  test('carts: are created, renamed, activated, merged and deleted', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const variant = await pickPurchasableVariant(request, { token: accessToken });

    // The implicit default cart appears on the first add-to-cart.
    await addLine(request, accessToken, variant);
    const { body: initial } = await apiJson<CartList>(request, 'GET', '/account/carts', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(initial.cartLimit).toBeGreaterThan(0);
    const defaultCart = (initial.carts ?? []).find((entry) => entry.kind === 'default');
    expect(defaultCart?.isActive).toBe(true);
    // One customer line plus the rule's own free gift line.
    expect(defaultCart?.itemCount).toBe(2);
    const seededLines = await listItems(request, accessToken);
    expect(userLines(seededLines)).toHaveLength(1);
    const gift = giftLines(seededLines)[0];
    expect(gift?.locked).toBe(true);
    // The summary total prices the lines from the live catalogue, and a gift
    // line is worth nothing.
    expect(defaultCart!.total).toBeGreaterThan(0);

    const { body: created } = await apiJson<{ cart?: Cart }>(request, 'POST', '/account/carts', {
      token: accessToken,
      data: { name: 'Cadeaux' },
      expectedStatus: 200,
    });
    expect(created.cart?.name).toBe('Cadeaux');
    expect(created.cart?.kind).toBe('custom');
    // activate defaults to true.
    expect(created.cart?.isActive).toBe(true);
    const giftCart = created.cart!;

    // Item routes always address the active cart, so this line lands in the
    // new one and not in the default cart's single line.
    await addLine(request, accessToken, variant, { quantity: 2 });
    expect(userLines(await listItems(request, accessToken))).toHaveLength(1);

    const { body: renamed } = await apiJson<{ cart?: Cart }>(
      request,
      'PATCH',
      `/account/carts/${giftCart.id}`,
      { token: accessToken, data: { name: 'Cadeaux 2026' }, expectedStatus: 200 },
    );
    expect(renamed.cart?.name).toBe('Cadeaux 2026');

    const { body: emptyName } = await apiJson<{ error?: { code?: string } }>(
      request,
      'PATCH',
      `/account/carts/${giftCart.id}`,
      { token: accessToken, data: { name: '   ' }, expectedStatus: 400 },
    );
    expect(emptyName.error?.code).toBe('invalid_request');

    await apiJson(request, 'PATCH', `/account/carts/${giftCart.id}`, {
      token: accessToken,
      data: { name: 'x'.repeat(51) },
      expectedStatus: 400,
    });

    // Activating the default cart flips the active flag back.
    const { body: activated } = await apiJson<{ cart?: Cart }>(
      request,
      'POST',
      `/account/carts/${defaultCart!.id}/activate`,
      { token: accessToken, expectedStatus: 200 },
    );
    expect(activated.cart?.id).toBe(defaultCart!.id);
    expect(activated.cart?.isActive).toBe(true);
    const { body: afterActivate } = await apiJson<CartList>(request, 'GET', '/account/carts', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((afterActivate.carts ?? []).filter((entry) => entry.isActive)).toHaveLength(1);

    // Merge is additive on the matching line and consumes the source.
    const { body: merged } = await apiJson<{ cart?: Cart }>(
      request,
      'POST',
      `/account/carts/${defaultCart!.id}/merge`,
      { token: accessToken, data: { sourceCartId: giftCart.id }, expectedStatus: 200 },
    );
    expect(merged.cart?.id).toBe(defaultCart!.id);
    expect(merged.cart?.isActive).toBe(true);
    const mergedItems = userLines(await listItems(request, accessToken));
    expect(mergedItems).toHaveLength(1);
    expect(mergedItems[0]?.quantity).toBe(3);
    const { body: afterMerge } = await apiJson<CartList>(request, 'GET', '/account/carts', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((afterMerge.carts ?? []).some((entry) => entry.id === giftCart.id)).toBe(false);

    await apiJson(request, 'POST', `/account/carts/${defaultCart!.id}/merge`, {
      token: accessToken,
      data: {},
      expectedStatus: 400,
    });
    await apiJson(request, 'POST', `/account/carts/${defaultCart!.id}/merge`, {
      token: accessToken,
      data: { sourceCartId: giftCart.id },
      expectedStatus: 404,
    });

    // A default cart is never actually deleted — its lines are cleared but
    // the row every add-to-cart assumes stays there.
    await apiJson(request, 'DELETE', `/account/carts/${defaultCart!.id}`, {
      token: accessToken,
      expectedStatus: 200,
    });
    const { body: afterDelete } = await apiJson<CartList>(request, 'GET', '/account/carts', {
      token: accessToken,
      expectedStatus: 200,
    });
    const survivor = (afterDelete.carts ?? []).find((entry) => entry.id === defaultCart!.id);
    expect(survivor).toBeTruthy();
    expect(survivor?.itemCount).toBe(0);
    expect(await listItems(request, accessToken)).toHaveLength(0);
  });

  test('another customer: cannot address a cart that is not theirs', async ({ request }) => {
    const owner = await registerUser(request);
    const intruder = await registerUser(request);
    const { body: created } = await apiJson<{ cart?: Cart }>(request, 'POST', '/account/carts', {
      token: owner.accessToken,
      data: { name: 'Privé' },
      expectedStatus: 200,
    });
    const cartId = created.cart!.id;

    await apiJson(request, 'PATCH', `/account/carts/${cartId}`, {
      token: intruder.accessToken,
      data: { name: 'Volé' },
      expectedStatus: 404,
    });
    await apiJson(request, 'POST', `/account/carts/${cartId}/activate`, {
      token: intruder.accessToken,
      expectedStatus: 404,
    });
    await apiJson(request, 'DELETE', `/account/carts/${cartId}`, {
      token: intruder.accessToken,
      expectedStatus: 404,
    });
  });

  test('the per-account cart allowance: is enforced above the system carts', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const { body: initial } = await apiJson<CartList>(request, 'GET', '/account/carts', {
      token: accessToken,
      expectedStatus: 200,
    });
    const limit = initial.cartLimit ?? 10;

    for (let index = 0; index < limit; index += 1) {
      await apiJson(request, 'POST', '/account/carts', {
        token: accessToken,
        data: { name: `Panier ${index + 1}`, activate: false },
        expectedStatus: 200,
      });
    }
    const { body: refused } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/account/carts',
      { token: accessToken, data: { name: 'Un de trop' }, expectedStatus: 409 },
    );
    expect(refused.error?.code).toBe('cart_limit_exceeded');
  });

  test('cart lines: are moved, re-quantified, re-selected and removed', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const variant = await pickPurchasableVariant(request, { token: accessToken });
    await addLine(request, accessToken, variant, { quantity: 2 });

    // A quantity-only PATCH is an absolute set, not an increment.
    const { body: quantified } = await apiJson<{ item?: CartItem }>(
      request,
      'PATCH',
      `/account/cart/${variant.productId}/${encodeURIComponent(variant.shapeKey)}/${encodeURIComponent(variant.lengthKey)}/${variant.size}`,
      { token: accessToken, data: { quantity: 5 }, expectedStatus: 200 },
    );
    expect(quantified.item?.quantity).toBe(5);
    expect(quantified.item?.origin).toBe('user');
    expect(quantified.item?.locked).toBe(false);

    await apiJson(
      request,
      'PATCH',
      `/account/cart/${variant.productId}/${encodeURIComponent(variant.shapeKey)}/${encodeURIComponent(variant.lengthKey)}/${variant.size}`,
      { token: accessToken, data: { quantity: 0 }, expectedStatus: 400 },
    );

    // Moving the line onto another size is a move, not a second line.
    const otherSize = ['XS', 'S', 'M', 'L'].find((size) => size !== variant.size)!;
    const { body: moved } = await apiJson<{ item?: CartItem }>(
      request,
      'PATCH',
      `/account/cart/${variant.productId}/${encodeURIComponent(variant.shapeKey)}/${encodeURIComponent(variant.lengthKey)}/${variant.size}`,
      { token: accessToken, data: { size: otherSize }, expectedStatus: 200 },
    );
    expect(moved.item?.size).toBe(otherSize);
    expect(moved.item?.quantity).toBe(5);
    expect(userLines(await listItems(request, accessToken))).toHaveLength(1);

    // The old coordinates no longer identify a line.
    await apiJson(
      request,
      'PATCH',
      `/account/cart/${variant.productId}/${encodeURIComponent(variant.shapeKey)}/${encodeURIComponent(variant.lengthKey)}/${variant.size}`,
      { token: accessToken, data: { quantity: 1 }, expectedStatus: 404 },
    );

    // A shape the set does not offer is refused rather than creating a line
    // that could never be fulfilled.
    await apiJson(
      request,
      'PATCH',
      `/account/cart/${variant.productId}/${encodeURIComponent(variant.shapeKey)}/${encodeURIComponent(variant.lengthKey)}/${otherSize}`,
      { token: accessToken, data: { shapeKey: 'not-a-shape' }, expectedStatus: 400 },
    );

    // Merging a moved line back onto an existing one adds the quantities.
    await addLine(request, accessToken, variant, { quantity: 1 });
    expect(userLines(await listItems(request, accessToken))).toHaveLength(2);
    const { body: remerged } = await apiJson<{ item?: CartItem }>(
      request,
      'PATCH',
      `/account/cart/${variant.productId}/${encodeURIComponent(variant.shapeKey)}/${encodeURIComponent(variant.lengthKey)}/${otherSize}`,
      { token: accessToken, data: { size: variant.size }, expectedStatus: 200 },
    );
    expect(remerged.item?.quantity).toBe(6);
    expect(userLines(await listItems(request, accessToken))).toHaveLength(1);

    const { body: deleted } = await apiJson<{ deleted?: boolean }>(
      request,
      'DELETE',
      `/account/cart/${variant.productId}/${encodeURIComponent(variant.shapeKey)}/${encodeURIComponent(variant.lengthKey)}/${variant.size}`,
      { token: accessToken, expectedStatus: 200 },
    );
    expect(deleted.deleted).toBe(true);
    // Removing the last nail set takes the rule's gift line with it.
    expect(await listItems(request, accessToken)).toHaveLength(0);

    // Deleting a line that is already gone reports it instead of failing.
    const { body: again } = await apiJson<{ deleted?: boolean }>(
      request,
      'DELETE',
      `/account/cart/${variant.productId}/${encodeURIComponent(variant.shapeKey)}/${encodeURIComponent(variant.lengthKey)}/${variant.size}`,
      { token: accessToken, expectedStatus: 200 },
    );
    expect(again.deleted).toBe(false);
  });

  test('cart lines: expand into catalogue data in one call', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const variant = await pickPurchasableVariant(request, { token: accessToken });
    await addLine(request, accessToken, variant);

    const { body: plain } = await apiJson<{ items?: CartItem[]; products?: unknown[] }>(
      request,
      'GET',
      '/account/cart',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(userLines(plain.items ?? [])).toHaveLength(1);
    // Additive by design: without the parameter the payload is unchanged.
    expect(plain.products).toBeUndefined();

    const { body: expanded } = await apiJson<{
      items?: CartItem[];
      products?: Array<{ id: string; productUid?: string }>;
    }>(request, 'GET', '/account/cart?expand=products', { token: accessToken, expectedStatus: 200 });
    expect(expanded.items?.length).toBe(plain.items?.length);
    // One catalogue entry per referenced product, gift line included.
    expect(expanded.products?.length).toBe(
      new Set((expanded.items ?? []).map((item) => item.productId)).size,
    );
    expect((expanded.products ?? []).some((product) => product.id === variant.productId)).toBe(true);
    expect((expanded.products ?? []).some((product) => product.productUid === E2E_PRODUCT_UIDS.A1)).toBe(
      true,
    );
  });

  test('move-to-wishlist: parks lines in the lazily created wish list', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const variant = await pickPurchasableVariant(request, { token: accessToken });
    const second = await pickPurchasableVariant(request, {
      token: accessToken,
      title: E2E_TITLES[E2E_PRODUCT_UIDS.A2],
    });
    await addLine(request, accessToken, variant, { quantity: 2 });
    await addLine(request, accessToken, second);

    const { body: moved } = await apiJson<{ moved?: CartItem[]; wishlist?: Cart }>(
      request,
      'POST',
      '/account/cart/move-to-wishlist',
      {
        token: accessToken,
        data: {
          items: [
            {
              productId: variant.productId,
              shapeKey: variant.shapeKey,
              lengthKey: variant.lengthKey,
              size: variant.size,
            },
          ],
        },
        expectedStatus: 200,
      },
    );
    expect(moved.moved).toHaveLength(1);
    expect(moved.moved?.[0]?.productId).toBe(variant.productId);
    expect(moved.wishlist?.kind).toBe('wishlist');
    expect(moved.wishlist?.name).toBe('Wish List');
    // The wish list is never made active — the customer keeps shopping in
    // the cart they were in.
    expect(moved.wishlist?.isActive).toBe(false);
    expect(moved.wishlist?.itemCount).toBe(1);

    const remaining = userLines(await listItems(request, accessToken));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.productId).toBe(second.productId);

    // Moving from the Wish List itself is rejected.
    await apiJson(request, 'POST', `/account/carts/${moved.wishlist!.id}/activate`, {
      token: accessToken,
      expectedStatus: 200,
    });
    await apiJson(request, 'POST', '/account/cart/move-to-wishlist', {
      token: accessToken,
      data: {
        items: [
          {
            productId: variant.productId,
            shapeKey: variant.shapeKey,
            lengthKey: variant.lengthKey,
            size: variant.size,
          },
        ],
      },
      expectedStatus: [400, 404, 409],
    });

    await apiJson(request, 'POST', '/account/cart/move-to-wishlist', {
      token: accessToken,
      data: { items: [] },
      expectedStatus: 400,
    });
  });
});
