/** Packet tier list price: one amount for every served country, or a map
 * keyed by ISO country code. Same shape for optional expressPrice. */
export type CourierPriceValue = number | Record<string, number>;

export function isPositivePrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Accepts a JSON number or a non-empty object of country → positive number. */
export function parseCourierPriceValue(value: unknown): CourierPriceValue | undefined {
  if (isPositivePrice(value)) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return undefined;
  const map: Record<string, number> = {};
  for (const [code, raw] of entries) {
    if (!/^[A-Z]{2}$/.test(code) || !isPositivePrice(raw)) return undefined;
    map[code] = raw;
  }
  return map;
}

export function resolveCourierPrice(price: CourierPriceValue, countryCode: string): number | null {
  if (typeof price === 'number') return price;
  const value = price[countryCode];
  return isPositivePrice(value) ? value : null;
}

export function resolveOptionalCourierPrice(
  price: CourierPriceValue | null,
  countryCode: string,
): number | null {
  if (price === null) return null;
  return resolveCourierPrice(price, countryCode);
}

/** Normalize for equality checks (sorted country keys). */
function normalizeCourierPrice(price: CourierPriceValue): CourierPriceValue {
  if (typeof price === 'number') return price;
  const sorted = Object.keys(price)
    .sort()
    .reduce<Record<string, number>>((acc, code) => {
      acc[code] = price[code]!;
      return acc;
    }, {});
  return sorted;
}

export function courierPricesEqual(a: CourierPriceValue, b: CourierPriceValue): boolean {
  const na = normalizeCourierPrice(a);
  const nb = normalizeCourierPrice(b);
  if (typeof na === 'number' || typeof nb === 'number') return na === nb;
  const keysA = Object.keys(na);
  const keysB = Object.keys(nb);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((code) => na[code] === nb[code]);
}

/** pg jsonb may arrive as number, object, or (rarely) a stringified number. */
export function readCourierPriceJson(raw: unknown): CourierPriceValue {
  if (typeof raw === 'string') {
    try {
      return readCourierPriceJson(JSON.parse(raw));
    } catch {
      const n = Number(raw);
      if (isPositivePrice(n)) return n;
      throw new Error('invalid courier price jsonb');
    }
  }
  const parsed = parseCourierPriceValue(raw);
  if (parsed === undefined) throw new Error('invalid courier price jsonb');
  return parsed;
}

export function readOptionalCourierPriceJson(raw: unknown): CourierPriceValue | null {
  if (raw === null || raw === undefined) return null;
  return readCourierPriceJson(raw);
}
