import type { CartItem } from '../api/cart';
import type { ProductById } from '../api/gallery';
import type { GalleryItem } from '../data/types';
import { accessoryLineTotal, packQtyMax } from './accessoryPacks';
import { availableQuantityFor } from './availability';
import { extraSetSubtotal, extraSetUnitCount } from './cartExtra';

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
  cartCount: number;
  subtotal: number;
  nailQty: number;
  nailSubtotal: number;
}

/** Header-drawer money and counts. Extra-set rows still being edited stay in
 * the cart and still count here; what `editing` blocks is checkout, not the
 * basket. */
export function cartDrawerTotals(items: CartItem[], extraSets: unknown[], lines: DrawerLine[]): DrawerTotals {
  const extraQty = extraSetUnitCount(extraSets);
  const extraSubtotal = extraSetSubtotal(extraSets);
  const nailLines = lines.filter(({ product, isGift }) => product.productType === 'nail' && !isGift);

  return {
    cartCount:
      items.filter((item) => item.origin !== 'rule').reduce((sum, item) => sum + item.quantity, 0) + extraQty,
    subtotal:
      lines.reduce(
        (sum, { quantity, product, item, isGift }) =>
          isGift ? sum : sum + (accessoryLineTotal(product, item.packKey ?? '', quantity) ?? 0),
        0,
      ) + extraSubtotal,
    nailQty: nailLines.reduce((sum, { quantity }) => sum + quantity, 0),
    nailSubtotal: nailLines.reduce((sum, { quantity, product }) => {
      const price = typeof product.price === 'number' ? product.price : 0;
      return sum + price * quantity;
    }, 0),
  };
}
