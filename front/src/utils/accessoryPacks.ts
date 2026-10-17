import type { ProductById } from '../api/gallery';

function accessoryUnits(product: ProductById): number {
  return typeof product.available === 'number' ? product.available : 0;
}

export function packMultiplier(product: ProductById, packKey: string): number | undefined {
  if (!packKey || !product.packs) return undefined;
  const value = product.packs[packKey];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Max pack count for this line: floor(units / multiplier), or raw units for default accessories. */
export function packQtyMax(product: ProductById, packKey: string): number {
  const multiplier = packMultiplier(product, packKey);
  if (multiplier === undefined) return accessoryUnits(product);
  return Math.floor(accessoryUnits(product) / multiplier);
}

/** Pack price from an explicit map, or unit price × multiplier. */
export function resolvePackPrice(product: ProductById, packKey: string): number | undefined {
  const price = product.price;
  if (typeof price === 'number') {
    const multiplier = packMultiplier(product, packKey);
    return multiplier === undefined ? price : price * multiplier;
  }
  if (price && typeof price === 'object' && packKey && typeof price[packKey] === 'number') {
    return price[packKey];
  }
  return undefined;
}

export function accessoryLinePhoto(product: ProductById, packKey: string): string | null {
  const packPhoto = packKey ? product.photosByPack?.[packKey]?.[0] : undefined;
  return packPhoto ?? product.photo;
}

export function sellablePackKeys(product: ProductById): string[] {
  if (!product.packs) return [];
  return Object.keys(product.packs).filter((key) => packQtyMax(product, key) >= 1);
}

/** Same 1e-9 epsilon as gift accessory budget checks on the server. */
export function costFitsRemaining(cost: number, remaining: number): boolean {
  return cost - remaining <= 1e-9;
}

/** In-stock packs whose unit price still fits the remaining accessory budget. */
export function sellablePackKeysWithinBudget(product: ProductById, remaining: number): string[] {
  return sellablePackKeys(product).filter((key) => {
    const price = resolvePackPrice(product, key);
    return price !== undefined && costFitsRemaining(price, remaining);
  });
}

/** True when at least one in-stock unit/pack can be added under `remaining`. */
export function accessoryFitsBudget(product: ProductById, remaining: number): boolean {
  const packKeys = sellablePackKeys(product);
  if (packKeys.length > 0) return sellablePackKeysWithinBudget(product, remaining).length > 0;
  if (packQtyMax(product, '') < 1) return false;
  const price = resolvePackPrice(product, '');
  return price !== undefined && costFitsRemaining(price, remaining);
}

/** Stock max, also capped so one more unit would not exceed remaining budget.
 * `remaining` is after this line (gift `remainingAccessoryBudget`). */
export function accessoryBudgetQtyMax(
  product: ProductById,
  packKey: string,
  currentQuantity: number,
  remaining: number | null | undefined,
): number {
  const stockMax = packQtyMax(product, packKey);
  if (typeof remaining !== 'number') return stockMax;
  const unit = resolvePackPrice(product, packKey);
  if (unit == null || unit <= 0) return stockMax;
  const extra = Math.max(0, Math.floor((remaining + 1e-9) / unit));
  return Math.min(stockMax, currentQuantity + extra);
}

/** First sellable pack in `packs` key order; follow the cart pack when it is still sellable. */
export function defaultPackKey(product: ProductById, cartPackKey?: string, allowedKeys?: string[]): string {
  const sellable = allowedKeys ?? sellablePackKeys(product);
  if (cartPackKey && sellable.includes(cartPackKey)) return cartPackKey;
  return sellable[0] ?? '';
}

export function accessoryLineTotal(
  product: ProductById,
  packKey: string,
  quantity: number,
): number | undefined {
  const unit = resolvePackPrice(product, packKey);
  return unit === undefined ? undefined : unit * quantity;
}
