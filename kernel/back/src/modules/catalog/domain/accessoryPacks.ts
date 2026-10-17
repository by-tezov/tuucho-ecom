export type AccessoryType = 'default' | 'byQuantity';

const PACK_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export class AccessoryPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessoryPackError';
  }
}

export function parseAccessoryType(value: unknown): AccessoryType {
  if (value === undefined || value === null || value === '' || value === 'default') return 'default';
  if (value === 'byQuantity') return 'byQuantity';
  throw new AccessoryPackError(`Unknown accessory type ${JSON.stringify(value)}.`);
}

/** Manager may still have the string `"true"` from an older write. */
export function parseInCartCarousel(value: unknown): boolean {
  return value === true || value === 'true';
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort();
}

function sameKeySet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((key, i) => key === b[i]);
}

export function jsonRecordEqual(left: Record<string, number>, right: Record<string, number>): boolean {
  const keys = sortedKeys(left);
  if (!sameKeySet(keys, Object.keys(right))) return false;
  return keys.every((key) => left[key] === right[key]);
}

export function parsePacksObject(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AccessoryPackError('accessory packs must be an object.');
  }
  const packs: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!PACK_KEY_RE.test(key) || key === 'max') {
      throw new AccessoryPackError(`Invalid accessory pack key ${JSON.stringify(key)}.`);
    }
    if (!isPositiveInt(raw)) {
      throw new AccessoryPackError(`Pack "${key}" multiplier must be a positive integer.`);
    }
    packs[key] = raw;
  }
  return packs;
}

export function parsePackPricesObject(value: unknown, packKeys: string[]): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AccessoryPackError('accessory pack prices must be an object.');
  }
  const prices: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isNonNegativeFinite(raw)) {
      throw new AccessoryPackError(`Pack price "${key}" must be a finite number >= 0.`);
    }
    prices[key] = raw;
  }
  if (!sameKeySet(Object.keys(prices), packKeys)) {
    throw new AccessoryPackError(
      `Pack price keys (${sortedKeys(prices).join(', ') || '(none)'}) must match pack keys (${[...packKeys].sort().join(', ') || '(none)'}).`,
    );
  }
  return prices;
}

/** Manager `available` + `price` for an accessory. Default: scalar stock and
 * scalar price. byQuantity: `{ max, <pack>: units }` and either a unit price
 * or a pack-price map. */
export function parseAccessorySource(input: { type?: unknown; available?: unknown; price?: unknown }): {
  accessoryType: AccessoryType;
  max: number;
  packs: Record<string, number>;
  packPrices: Record<string, number>;
  unitPrice: number | undefined;
} {
  const accessoryType = parseAccessoryType(input.type);
  if (accessoryType === 'default') {
    if (input.available !== undefined && typeof input.available === 'object') {
      throw new AccessoryPackError('default accessories require scalar "available".');
    }
    if (input.price !== undefined && typeof input.price === 'object') {
      throw new AccessoryPackError('default accessories require scalar "price".');
    }
    const max =
      typeof input.available === 'number' && Number.isInteger(input.available) && input.available > 0
        ? input.available
        : 0;
    const unitPrice =
      typeof input.price === 'number' && Number.isFinite(input.price) && input.price >= 0
        ? input.price
        : undefined;
    return { accessoryType, max, packs: {}, packPrices: {}, unitPrice };
  }

  const available = input.available;
  if (!available || typeof available !== 'object' || Array.isArray(available)) {
    throw new AccessoryPackError('byQuantity "available" must be an object with "max" and pack multipliers.');
  }
  const raw = available as Record<string, unknown>;
  if (!isPositiveInt(raw.max)) {
    throw new AccessoryPackError('byQuantity "available.max" must be a positive integer.');
  }
  const packs: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'max') continue;
    if (!PACK_KEY_RE.test(key)) {
      throw new AccessoryPackError(`Invalid byQuantity pack key ${JSON.stringify(key)}.`);
    }
    if (!isPositiveInt(value)) {
      throw new AccessoryPackError(`byQuantity pack "${key}" multiplier must be a positive integer.`);
    }
    packs[key] = value;
  }
  if (Object.keys(packs).length === 0) {
    throw new AccessoryPackError('byQuantity "available" must declare at least one pack key besides "max".');
  }

  const price = input.price;
  let unitPrice: number | undefined;
  let packPrices: Record<string, number> = {};
  if (typeof price === 'number') {
    if (!isNonNegativeFinite(price)) {
      throw new AccessoryPackError('byQuantity scalar "price" must be a finite number >= 0.');
    }
    unitPrice = price;
  } else if (price && typeof price === 'object' && !Array.isArray(price)) {
    packPrices = parsePackPricesObject(price, Object.keys(packs));
  } else if (price !== undefined) {
    throw new AccessoryPackError(
      'byQuantity "price" must be a number (per unit) or an object keyed by pack.',
    );
  }

  return { accessoryType, max: raw.max, packs, packPrices, unitPrice };
}

export function packMultiplier(packs: Record<string, number>, packKey: string): number | undefined {
  if (!packKey || !Object.hasOwn(packs, packKey)) return undefined;
  const value = packs[packKey];
  return isPositiveInt(value) ? value : undefined;
}

export function stockUnitsForLine(
  accessoryType: AccessoryType,
  packs: Record<string, number>,
  packKey: string,
  quantity: number,
): number | undefined {
  if (accessoryType !== 'byQuantity') return quantity;
  const multiplier = packMultiplier(packs, packKey);
  if (multiplier === undefined) return undefined;
  return quantity * multiplier;
}

export function resolvePackPrice(
  unitPrice: number | undefined,
  packPrices: Record<string, number>,
  packs: Record<string, number>,
  packKey: string,
): number | undefined {
  if (packKey && Object.hasOwn(packPrices, packKey)) {
    const explicit = packPrices[packKey];
    return isNonNegativeFinite(explicit) ? explicit : undefined;
  }
  const multiplier = packMultiplier(packs, packKey);
  if (multiplier === undefined || unitPrice === undefined) return undefined;
  return unitPrice * multiplier;
}

export function dbPacks(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const packs: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) packs[key] = raw;
  }
  return packs;
}

export function dbPackPrices(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const prices: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) prices[key] = raw;
  }
  return prices;
}

export function publicPrice(
  accessoryType: AccessoryType,
  unitPrice: number | undefined,
  packPrices: Record<string, number>,
): number | Record<string, number> | undefined {
  if (accessoryType !== 'byQuantity') return unitPrice;
  if (Object.keys(packPrices).length > 0) return packPrices;
  if (unitPrice === undefined) return undefined;
  return unitPrice;
}

export function sourceAvailable(
  accessoryType: AccessoryType,
  max: number,
  packs: Record<string, number>,
): number | Record<string, number> {
  if (accessoryType !== 'byQuantity') return max;
  return { max, ...packs };
}

export function sourcePrice(
  accessoryType: AccessoryType,
  unitPrice: number | undefined,
  packPrices: Record<string, number>,
): number | Record<string, number> | undefined {
  if (accessoryType !== 'byQuantity') return unitPrice;
  if (Object.keys(packPrices).length > 0) return packPrices;
  return unitPrice;
}
