import type pg from 'pg';
import * as cart from '../application/cart.js';
import type { CartItemRow, CartListEntry, CartRow } from '../application/cart.js';
// The shapes the front is typed against. Binding the presenters to them is
// what makes a payload change a compile error on this side rather than a
// surprise in the browser.
import type { CartItem, CartSize, CartSummary } from '../../../contract/cart.js';

export function toPublicCartItem(row: CartItemRow): CartItem {
  return {
    productId: row.product_id,
    shapeKey: row.shape_key,
    lengthKey: row.length_key,
    // The column is constrained to the size vocabulary (empty for
    // accessories); the row type is the driver's wider `string`.
    size: row.size as CartSize,
    packKey: row.pack_key,
    quantity: row.quantity,
    origin: row.origin,
    locked: row.locked,
    ...(row.comment ? { comment: row.comment } : {}),
  };
}

/** Wire timestamps are ISO-8601. The pool returns timestamptz as text, so
 * calling `.toISOString()` on the column would throw at runtime. */
function toIsoTimestamp(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function toPublicCart(
  row: CartListEntry | (CartRow & { item_count?: number; total?: number }),
): CartSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    isActive: row.is_active,
    itemCount: row.item_count ?? 0,
    total: Number(row.total ?? 0),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export async function publicCartFor(
  pool: pg.Pool,
  userId: string,
  cartId: string,
  fallback: CartRow,
): Promise<CartSummary> {
  const summary = await cart.getCartSummary(pool, userId, cartId);
  return toPublicCart(summary ?? { ...fallback, item_count: 0, total: 0 });
}

/** An accessory line has no shape, length or size; the empty string cannot
 * ride in a URL segment, so the routes carry this sentinel instead. */
const CART_EMPTY_VARIANT_SENTINEL = '-';

export function mapCartVariantParam(value: string): string {
  return value === CART_EMPTY_VARIANT_SENTINEL ? '' : value;
}
