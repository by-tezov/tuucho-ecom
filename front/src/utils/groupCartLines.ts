import type { CartItem } from '../api/cart';
import type { GalleryItem } from '../data/types';
import type { ProductById } from '../api/gallery';

export interface CartShapeGroup {
  key: string;
  set: GalleryItem;
  shapeKey: string;
  shapeLabel: string;
  lengthKey: string;
  lengthLabel: string;
  variants: CartItem[];
}

/** One display card per gallery set + shape + length; size lines are
 * variants. Length is part of the key so two lengths of one shape stay
 * separate cards, but no length label is rendered yet. Accessory lines
 * (empty shapeKey) are not grouped here — render them separately from
 * ProductById hydration. */
export function groupCartLinesByShape(lines: { item: CartItem; set: GalleryItem }[]): CartShapeGroup[] {
  const groups: CartShapeGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const { item, set } of lines) {
    const key = `${set.id}::${item.shapeKey}::${item.lengthKey}`;
    const existing = indexByKey.get(key);
    if (existing === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({
        key,
        set,
        shapeKey: item.shapeKey,
        shapeLabel: set.shape[item.shapeKey] ?? item.shapeKey,
        lengthKey: item.lengthKey,
        lengthLabel: set.lengthsByShape[item.shapeKey]?.[item.lengthKey] ?? item.lengthKey,
        variants: [item],
      });
    } else {
      const group = groups[existing];
      if (group) group.variants.push(item);
    }
  }
  // Cart order otherwise follows whatever order the lines arrived in
  // (add order / DB order) — alphabetical by product title reads as a
  // stable, predictable list instead.
  return groups.sort((a, b) => a.set.title.localeCompare(b.set.title));
}

export interface DrawerProductGroup {
  key: string;
  product: ProductById;
  shapeKey: string;
  shapeLabel: string;
  lengthKey: string;
  variants: { item: CartItem; quantity: number }[];
}

/** Drawer grouping over hydrated products (nails + accessories). Accessories
 * keep a single empty-shape group with no size chip needed. Nails stay
 * above accessories (title order within each type) so the two kinds are
 * never interleaved. */
export function groupDrawerLinesByProduct(
  lines: { item: CartItem; product: ProductById; quantity: number }[],
): DrawerProductGroup[] {
  const groups: DrawerProductGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const line of lines) {
    const key = `${line.product.id}::${line.item.shapeKey}::${line.item.lengthKey}`;
    const existing = indexByKey.get(key);
    const shapeLabel = line.product.productType === 'accessory' ? '' : line.item.shapeKey;
    if (existing === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({
        key,
        product: line.product,
        shapeKey: line.item.shapeKey,
        shapeLabel,
        lengthKey: line.item.lengthKey,
        variants: [{ item: line.item, quantity: line.quantity }],
      });
    } else {
      const group = groups[existing];
      if (group) group.variants.push({ item: line.item, quantity: line.quantity });
    }
  }
  return groups.sort((a, b) => {
    const typeRank = (type: ProductById['productType']) => (type === 'accessory' ? 1 : 0);
    const byType = typeRank(a.product.productType) - typeRank(b.product.productType);
    if (byType !== 0) return byType;
    return a.product.title.localeCompare(b.product.title);
  });
}
