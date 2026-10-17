/** Cart and cart-list API. */
import { authHeaders, requestJson as request } from './client';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in pamsurin-back). Do not redeclare them here. */
import type {
  CartComposition,
  CartGiftMeta,
  CartItem,
  CartKind,
  CartSummary,
  CompositionFinger,
  GuestImportSelection,
  Size,
} from './contract/cart';

export type {
  CartComposition,
  CartGiftMeta,
  CartItem,
  CartKind,
  CartSummary,
  CompositionFinger,
  GuestImportSelection,
  Size,
};

export type CompositionWriteNail = {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  finger: CompositionFinger;
  /** Variation option of a single nail with variations; `''`/absent otherwise. */
  variationKey?: string;
};

export type CompositionWriteBody = {
  size: Size;
  quantity: number;
  nails: CompositionWriteNail[];
  /** Customer note; only guest import carries it (the account cart sets it
   * through setCartCompositionComment). */
  comment?: string;
};

export type GuestImportComposition = CompositionWriteBody;

export { ApiError } from './errors';
export function listCart(
  accessToken: string,
): Promise<{ success: true; items: CartItem[]; compositions: CartComposition[] }> {
  return request('/account/cart', { headers: authHeaders(accessToken) });
}
export function listCarts(
  accessToken: string,
): Promise<{ success: true; carts: CartSummary[]; cartLimit?: number }> {
  return request('/account/carts', { headers: authHeaders(accessToken) });
}

export function createCart(
  accessToken: string,
  opts?: { name?: string; activate?: boolean },
): Promise<{ success: true; cart: CartSummary }> {
  return request('/account/carts', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(opts ?? {}),
  });
}

export function renameCart(
  accessToken: string,
  cartId: string,
  name: string,
): Promise<{ success: true; cart: CartSummary }> {
  return request(`/account/carts/${encodeURIComponent(cartId)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ name }),
  });
}

export function activateCart(
  accessToken: string,
  cartId: string,
): Promise<{ success: true; cart: CartSummary }> {
  return request(`/account/carts/${encodeURIComponent(cartId)}/activate`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

/** Merges `sourceCartId` into `targetCartId` (additive quantities), deletes the
 * source, and activates the target. */
export function mergeCarts(
  accessToken: string,
  targetCartId: string,
  sourceCartId: string,
): Promise<{ success: true; cart: CartSummary }> {
  return request(`/account/carts/${encodeURIComponent(targetCartId)}/merge`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ sourceCartId }),
  });
}

export function deleteCart(accessToken: string, cartId: string): Promise<{ success: true }> {
  return request(`/account/carts/${encodeURIComponent(cartId)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export function rebuyIntoCart(
  accessToken: string,
  orderId: string,
  mode: 'new' | 'merge',
  targetCartId?: string,
): Promise<{ success: true; cartId: string; snapshotToken: string; items: CartItem[] }> {
  return request('/account/carts/rebuy', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ orderId, mode, targetCartId }),
  });
}

/** `unconnected` parks the lines in the account's single Unconnected cart
 * without activating it — used when the customer closes the merge dialog. */
export function importGuestCart(
  accessToken: string,
  opts: {
    mode: 'new' | 'merge' | 'unconnected';
    targetCartId?: string;
    items: CartItem[];
    compositions?: GuestImportComposition[];
    selection?: GuestImportSelection;
    name?: string;
  },
): Promise<{ success: true; cart: CartSummary }> {
  return request('/account/carts/import-guest', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(opts),
  });
}

export function createCartComposition(
  accessToken: string,
  body: CompositionWriteBody,
): Promise<{ success: true; composition: CartComposition }> {
  return request('/account/cart/compositions', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function updateCartComposition(
  accessToken: string,
  id: string,
  body: CompositionWriteBody & { clearEditing?: boolean | undefined },
): Promise<{ success: true; composition: CartComposition }> {
  return request(`/account/cart/compositions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function deleteCartComposition(accessToken: string, id: string): Promise<{ success: true }> {
  return request(`/account/cart/compositions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export function startCartCompositionEdit(
  accessToken: string,
  id: string,
): Promise<{ success: true; composition: CartComposition }> {
  return request(`/account/cart/compositions/${encodeURIComponent(id)}/edit`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function cancelCartCompositionEdit(
  accessToken: string,
  id: string,
): Promise<{ success: true; composition: CartComposition }> {
  return request(`/account/cart/compositions/${encodeURIComponent(id)}/cancel-edit`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function moveCartCompositionToWishlist(accessToken: string, id: string): Promise<{ success: true }> {
  return request(`/account/cart/compositions/${encodeURIComponent(id)}/move-to-wishlist`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

/** Note on one cart card: every size line of this product+shape+length in
 * the active cart. Blank or null clears it. */
export function setCartCardComment(
  accessToken: string,
  card: { productId: string; shapeKey: string; lengthKey: string },
  comment: string | null,
): Promise<{ success: true; comment: string | null }> {
  return request('/account/cart/comment', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ ...card, comment }),
  });
}

export function setCartCompositionComment(
  accessToken: string,
  id: string,
  comment: string | null,
): Promise<{ success: true; comment: string | null }> {
  return request(`/account/cart/compositions/${encodeURIComponent(id)}/comment`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ comment }),
  });
}

/** Upsert — a new line, or on an existing line for this exact
 * (productId, shapeKey, lengthKey, size), adds `quantity` on top of what's
 * already there (repeat-click "add to cart" behavior). A different shape,
 * length or size for the same product is a separate line. Accessories omit
 * shape/length/size (server forces all three to ''). */
export function addToCart(
  accessToken: string,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  size: Size | '',
  quantity = 1,
  packKey = '',
): Promise<{ success: true }> {
  const body: Record<string, unknown> = { productId, quantity };
  if (shapeKey !== '' || size !== '') {
    body.shapeKey = shapeKey;
    body.lengthKey = lengthKey;
    body.size = size;
  }
  if (packKey !== '') body.packKey = packKey;
  return request('/account/cart', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

/** Empty shape/length/size become `-` in the path (accessories); see
 * pamsurin-back account.routes.ts `CART_EMPTY_VARIANT_SENTINEL`. */
function encodeCartVariantParam(value: string): string {
  return value === '' ? '-' : encodeURIComponent(value);
}

function cartLineUrl(
  base: string,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  size: Size | '',
): string {
  return `${base}/${encodeURIComponent(productId)}/${encodeCartVariantParam(shapeKey)}/${encodeCartVariantParam(lengthKey)}/${encodeCartVariantParam(size)}`;
}

/** `shapeKey`/`lengthKey`/`size` identify the line to edit — a product can
 * have several now. A `{quantity}`-only patch is an absolute set (not
 * additive), backing the cart page's quantity stepper. A patch carrying a
 * new `shapeKey`, `lengthKey` and/or `size` moves this line's quantity onto
 * that new selection, merging with an existing line there if one already
 * exists. */
export function updateCartItem(
  accessToken: string,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  size: Size | '',
  patch: Partial<{ shapeKey: string; lengthKey: string; size: Size; quantity: number; packKey: string }>,
): Promise<{ success: true; item: CartItem }> {
  return request(cartLineUrl('/account/cart', productId, shapeKey, lengthKey, size), {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(patch),
  });
}

export function removeFromCart(
  accessToken: string,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  size: Size | '',
): Promise<{ success: true; deleted: boolean }> {
  return request(cartLineUrl('/account/cart', productId, shapeKey, lengthKey, size), {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export function moveCartItemsToWishlist(
  accessToken: string,
  items: Pick<CartItem, 'productId' | 'shapeKey' | 'lengthKey' | 'size'>[],
): Promise<{ success: true; moved: CartItem[]; wishlist: CartSummary }> {
  return request('/account/cart/move-to-wishlist', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ items }),
  });
}
