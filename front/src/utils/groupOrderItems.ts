import type { OrderItem } from '../api/orders';

export interface OrderShapeGroup {
  key: string;
  productUid: string;
  title: string;
  /** Shown on gift/rule lines only (e.g. tip pot); not for paid user items. */
  desc: string | null;
  shapeKey: string;
  shapeLabel: string;
  lengthKey: string;
  /** Frozen length label, shown next to shapeLabel in the order line. */
  lengthLabel: string;
  /** Accessory pack key ('' for nails and non-pack accessories). */
  packKey: string;
  /** Resolved pack label (e.g. "x2"); '' when the line has no pack. */
  packLabel: string;
  photo: string | null;
  unitPrice: number;
  variants: OrderItem[];
}

/** One card per product ref + shape + length + pack; size lines are
 * variants. Length/pack are part of the key so two lengths of one shape, or
 * two packs of the same accessory (e.g. "x2" and "x4"), stay separate
 * cards. Orphan lines without productId never merge. Accessories (empty
 * shape/length/size) stay one card per product+pack. Paid/user lines first,
 * rule gifts last — same order as the cart page / drawer offers block. */
export function groupOrderItemsByShape(items: OrderItem[]): OrderShapeGroup[] {
  const groups: OrderShapeGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const item of items) {
    const key = item.productId
      ? `${item.productId}::${item.shapeKey}::${item.lengthKey}::${item.packKey}`
      : `${item.id}::${item.shapeKey}::${item.lengthKey}::${item.packKey}`;
    const existing = indexByKey.get(key);
    if (existing === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({
        key,
        productUid: item.productUid,
        title: item.title,
        desc: item.desc,
        shapeKey: item.shapeKey,
        shapeLabel: item.shapeLabel,
        lengthKey: item.lengthKey,
        lengthLabel: item.lengthLabel,
        packKey: item.packKey,
        packLabel: item.packLabel,
        photo: item.photo,
        unitPrice: item.unitPrice,
        variants: [item],
      });
    } else {
      const group = groups[existing];
      if (group) group.variants.push(item);
    }
  }

  const isGiftGroup = (group: OrderShapeGroup) =>
    group.variants.every((item) => item.origin === 'rule' || item.locked);
  return [...groups.filter((group) => !isGiftGroup(group)), ...groups.filter((group) => isGiftGroup(group))];
}
