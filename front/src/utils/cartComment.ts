import type { CartItem } from '../api/cart';

/** Mirrors back-end `LINE_COMMENT_MAX_LENGTH`. */
export const CART_COMMENT_MAX = 500;

type CardKey = Pick<CartItem, 'productId' | 'shapeKey' | 'lengthKey'>;

function sameCard(item: CardKey, card: CardKey): boolean {
  return (
    item.productId === card.productId && item.shapeKey === card.shapeKey && item.lengthKey === card.lengthKey
  );
}

/** A cart card groups the size lines of one product+shape+length and owns one
 * note. Every line should carry it, but a size a guest adds later may not yet:
 * the first note found in the card is the card's note. */
export function cardComment(items: readonly CartItem[], card: CardKey): string {
  return items.find((item) => sameCard(item, card) && item.comment)?.comment ?? '';
}

/** Writes `comment` onto every line of the card ('' removes it). */
export function withCardComment<T extends CartItem>(
  items: readonly T[],
  card: CardKey,
  comment: string,
): T[] {
  return items.map((item) => {
    if (!sameCard(item, card) || item.origin === 'rule' || item.locked) return item;
    const { comment: _previous, ...rest } = item;
    return (comment ? { ...rest, comment } : rest) as T;
  });
}
