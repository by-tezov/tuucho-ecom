import { isPlainObject } from './typeGuards';

/** Opaque plugin extra-set rows on the cart (custom sets, and the like). */
export function extraSetsFromUnknown(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function extraSetQuantity(value: unknown): number {
  return isPlainObject(value) && typeof value.quantity === 'number' && Number.isFinite(value.quantity)
    ? value.quantity
    : 0;
}

export function extraSetUnitCount(sets: readonly unknown[]): number {
  return sets.reduce<number>((sum, entry) => sum + extraSetQuantity(entry), 0);
}

export function extraSetLocked(sets: readonly unknown[]): boolean {
  return sets.some((entry) => isPlainObject(entry) && entry.editing === true);
}

export function extraSetSubtotal(sets: readonly unknown[]): number {
  return sets.reduce<number>((sum, entry) => {
    if (!isPlainObject(entry) || entry.available === false) return sum;
    const unit = typeof entry.unitPrice === 'number' ? entry.unitPrice : 0;
    return sum + unit * extraSetQuantity(entry);
  }, 0);
}

export function extraSetPreviewUnits(
  sets: readonly unknown[],
): Array<{ quantity: number; nailCount: number; lineTotal: number; available: boolean }> {
  return sets.map((entry) => {
    if (!isPlainObject(entry)) {
      return { quantity: 0, nailCount: 0, lineTotal: 0, available: false };
    }
    const children = Array.isArray(entry.nails)
      ? entry.nails
      : Array.isArray(entry.children)
        ? entry.children
        : [];
    const quantity = extraSetQuantity(entry);
    const unitPrice = typeof entry.unitPrice === 'number' ? entry.unitPrice : 0;
    return {
      quantity,
      nailCount: children.length,
      lineTotal: unitPrice * quantity,
      available: entry.available !== false,
    };
  });
}

/** Paid catalogue set quantity: every user line counts, sized or not (the
 * kernel's CART_SET_UNITS_SQL has no size condition either). Extra-set qty is
 * added by the caller from `extraSetUnitCount`. */
export function paidCatalogueSetQuantity(
  items: ReadonlyArray<{ origin?: string; size: string; quantity: number }>,
): number {
  return items
    .filter((item) => item.origin !== 'rule')
    .reduce((sum, item) => sum + item.quantity, 0);
}
