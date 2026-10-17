import type { CartItem, Size } from '../api/cart';
import type { GiftItem } from '../api/gift';

/** A gift cart's items in the same shape as any other cart line, so every
 * cart surface can render the two without branching. */
export function giftItemsToCart(items: GiftItem[]): CartItem[] {
  return items.map((item) => ({
    productId: item.productId,
    shapeKey: item.shapeKey,
    lengthKey: item.lengthKey,
    size: (item.size as Size) || '',
    packKey: item.packKey ?? '',
    quantity: item.quantity,
    origin: 'user',
    locked: false,
  }));
}

/** Line identity: a product plus its exact variant. A different shape,
 * length or size is a different line, never an overwrite. */
export function sameLine(
  item: CartItem,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  size: Size | '',
): boolean {
  return (
    item.productId === productId &&
    item.shapeKey === shapeKey &&
    item.lengthKey === lengthKey &&
    item.size === size
  );
}
