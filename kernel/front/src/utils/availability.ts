/** Quantity in stock for one shape+length+size of a gallery item. A shape,
 * length or size missing from `available` means 0 in stock, no exceptions —
 * matching catalog source's data-static.json "available" key exactly
 * (missing entry = not available), same rule kernel/back's
 * availability.service.ts (getAvailableQuantity) enforces server-side. A
 * variant that's never been annotated with any stock at all is 0 in stock
 * too, not unlimited. */
export function availableQuantityFor<T extends string>(
  available: Record<string, Record<string, Partial<Record<T, number>>>>,
  shapeKey: string,
  lengthKey: string,
  size: T,
): number {
  return available[shapeKey]?.[lengthKey]?.[size] ?? 0;
}

/** Public remaining already excludes live holds. A cart that owns a hold
 * (gift promise) adds this line's quantity back so reserved units stay
 * selectable on that cart. */
export function quantityAvailableToLine(
  publicAvailable: number,
  lineQuantity: number,
  creditLineHold: boolean,
): number {
  if (!creditLineHold) return publicAvailable;
  return publicAvailable + lineQuantity;
}

/** Sizes actually purchasable (quantity > 0) for one shape+length of a
 * gallery item. */
export function availableSizesFor<T extends string>(
  available: Record<string, Record<string, Partial<Record<T, number>>>>,
  shapeKey: string,
  lengthKey: string,
  sizes: readonly T[],
): T[] {
  return sizes.filter((size) => availableQuantityFor(available, shapeKey, lengthKey, size) > 0);
}

/** Selects an in-stock size, first retaining an explicit valid choice (for
 * example a cart/modal selection), then applying the caller's default
 * priority. Returns undefined only when every size is out of stock. */
export function preferredAvailableSize<T extends string>(
  available: Record<string, Record<string, Partial<Record<T, number>>>>,
  shapeKey: string,
  lengthKey: string,
  priority: readonly T[],
  preferred: readonly (T | undefined)[] = [],
): T | undefined {
  return [...preferred, ...priority].find(
    (size): size is T => size !== undefined && availableQuantityFor(available, shapeKey, lengthKey, size) > 0,
  );
}
