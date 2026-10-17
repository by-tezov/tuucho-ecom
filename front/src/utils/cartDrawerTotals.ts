import type { CartComposition, CartItem } from '../api/cart';
import type { ProductById } from '../api/gallery';
import type { GalleryItem } from '../data/types';
import { accessoryLineTotal, packQtyMax } from './accessoryPacks';
import { availableQuantityFor } from './availability';

/** Stock can have shrunk since a line was added, so the drawer clamps the
 * same way CartLine does on the full cart page — its total must never quote
 * more than what is still purchasable. */
export function quantityForDrawerLine(
  item: CartItem,
  product: ProductById,
  gallerySets: Record<string, GalleryItem>,
  creditHeldStock: boolean,
): number {
  if (item.origin === 'rule' || item.locked || creditHeldStock) return item.quantity;
  if (product.productType === 'accessory') {
    return Math.min(item.quantity, packQtyMax(product, item.packKey ?? ''));
  }
  if (item.size === '') return item.quantity;
  const available = typeof product.available === 'object' ? product.available : undefined;
  const set = gallerySets[product.id];
  if (!available && !set) return item.quantity;
  return Math.min(
    item.quantity,
    availableQuantityFor(available ?? set?.available ?? {}, item.shapeKey, item.lengthKey, item.size),
  );
}

export interface DrawerLine {
  item: CartItem;
  product: ProductById;
  quantity: number;
  isGift: boolean;
}

export interface DrawerTotals {
  /** Badge count: paid catalogue lines plus one per composed set. */
  cartCount: number;
  subtotal: number;
  /** Catalogue nail sets. Qualifying composed sets are added by
   * previewNailQtyTier from the rule's minNails. */
  nailQty: number;
  nailSubtotal: number;
}

/** Header-drawer money and counts. A composition still being edited stays in
 * the cart and still counts here; what `editing` blocks is checkout, not the
 * basket. */
export function cartDrawerTotals(
  items: CartItem[],
  compositions: CartComposition[],
  lines: DrawerLine[],
): DrawerTotals {
  const compositionQty = compositions.reduce((sum, entry) => sum + entry.quantity, 0);
  const compositionSubtotal = compositions
    .filter((entry) => entry.available)
    .reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);
  const nailLines = lines.filter(({ product, isGift }) => product.productType === 'nail' && !isGift);

  return {
    cartCount:
      items.filter((item) => item.origin !== 'rule').reduce((sum, item) => sum + item.quantity, 0) +
      compositionQty,
    subtotal:
      lines.reduce(
        (sum, { quantity, product, item, isGift }) =>
          isGift ? sum : sum + (accessoryLineTotal(product, item.packKey ?? '', quantity) ?? 0),
        0,
      ) + compositionSubtotal,
    nailQty: nailLines.reduce((sum, { quantity }) => sum + quantity, 0),
    nailSubtotal: nailLines.reduce((sum, { quantity, product }) => {
      const price = typeof product.price === 'number' ? product.price : 0;
      return sum + price * quantity;
    }, 0),
  };
}
