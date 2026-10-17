/** Expand courier JSON fields authored as scalar | country map | { default, …overrides }.
 * Reserved key `"default"` is never a country code. */

const ISO_COUNTRY = /^[A-Z]{2}$/;

function isIsoCountryCode(code: string): boolean {
  return ISO_COUNTRY.test(code);
}

function assertKnownCountryKeys(
  keys: string[],
  vocabCodes: ReadonlySet<string>,
  fieldLabel: string,
): void {
  for (const key of keys) {
    if (key === 'default') continue;
    if (!isIsoCountryCode(key)) {
      throw new Error(`${fieldLabel}: "${key}" is not a valid ISO country code.`);
    }
    if (!vocabCodes.has(key)) {
      throw new Error(`${fieldLabel}: "${key}" is not declared in data-countries.json.`);
    }
  }
}

/**
 * Split an authored object into default + per-country overrides.
 * Scalar input is treated as `{ default: scalar }` with no overrides.
 */
function splitDefaultMap<T>(
  raw: unknown,
  fieldLabel: string,
  isValue: (value: unknown) => value is T,
): { defaultValue: T | undefined; overrides: Record<string, T>; listedOnly: boolean } {
  if (isValue(raw)) {
    return { defaultValue: raw, overrides: {}, listedOnly: false };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${fieldLabel} must be a scalar or an object keyed by country / default.`);
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error(`${fieldLabel} object must not be empty.`);
  }
  let defaultValue: T | undefined;
  const overrides: Record<string, T> = {};
  let hasDefaultKey = false;
  for (const [key, value] of entries) {
    if (key === 'default') {
      hasDefaultKey = true;
      if (!isValue(value)) {
        throw new Error(`${fieldLabel}.default has an invalid value.`);
      }
      defaultValue = value;
      continue;
    }
    if (!isValue(value)) {
      throw new Error(`${fieldLabel}.${key} has an invalid value.`);
    }
    overrides[key] = value;
  }
  // Object without `default` → only listed countries; with `default` (or
  // scalar, handled above) → full universe coverage.
  const listedOnly = !hasDefaultKey && typeof raw === 'object';
  return { defaultValue, overrides, listedOnly };
}

/** Expand over `universe`. When listedOnly, only override keys appear. */
function expandOverUniverse<T>(
  raw: unknown,
  universe: string[],
  fieldLabel: string,
  isValue: (value: unknown) => value is T,
  vocabCodes: ReadonlySet<string>,
): Record<string, T> {
  const { defaultValue, overrides, listedOnly } = splitDefaultMap(raw, fieldLabel, isValue);
  assertKnownCountryKeys(Object.keys(overrides), vocabCodes, fieldLabel);

  if (listedOnly) {
    if (Object.keys(overrides).length === 0) {
      throw new Error(`${fieldLabel} must list at least one country when default is omitted.`);
    }
    return { ...overrides };
  }

  if (defaultValue === undefined) {
    throw new Error(`${fieldLabel}: internal error — expected a default value.`);
  }
  const result: Record<string, T> = {};
  for (const code of universe) {
    result[code] = overrides[code] !== undefined ? overrides[code]! : defaultValue;
  }
  // Explicit overrides outside universe are already rejected by vocab check;
  // overrides for codes in universe already applied.
  return result;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isDeliveryRange(value: unknown): value is { min: number; max: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { min, max } = value as { min?: unknown; max?: unknown };
  return isPositiveInteger(min) && isPositiveInteger(max) && max >= min;
}

export function isPositivePrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Expand `countries` field.
 * - boolean scalar → every vocab code with that enabled
 * - legacy string[] → those codes enabled
 * - object with booleans (+ optional default) → expand rule
 * - legacy `{ "FR": { "enabled": true } }` still accepted (normalized to boolean)
 */
export function expandCountries(
  raw: unknown,
  vocabCodes: string[],
  fieldLabel = 'countries',
): Record<string, boolean> {
  const vocabSet = new Set(vocabCodes);

  if (Array.isArray(raw)) {
    if (raw.length === 0) throw new Error(`${fieldLabel} must list at least one country.`);
    const result: Record<string, boolean> = {};
    for (const code of raw) {
      if (typeof code !== 'string' || !isIsoCountryCode(code)) {
        throw new Error(`${fieldLabel} array entries must be ISO country codes.`);
      }
      if (!vocabSet.has(code)) {
        throw new Error(`${fieldLabel}: "${code}" is not declared in data-countries.json.`);
      }
      result[code] = true;
    }
    return result;
  }

  // Normalize legacy `{ enabled: boolean }` entries to bare booleans before expand.
  let normalized: unknown = raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && 'enabled' in (value as object)) {
        out[key] = (value as { enabled?: unknown }).enabled !== false;
      } else {
        out[key] = value;
      }
    }
    normalized = out;
  }

  const universe =
    typeof normalized === 'boolean' ||
    (normalized &&
      typeof normalized === 'object' &&
      !Array.isArray(normalized) &&
      Object.prototype.hasOwnProperty.call(normalized, 'default'))
      ? vocabCodes
      : Object.keys((normalized as Record<string, unknown>) ?? {}).filter((k) => k !== 'default');

  // For listed-only object, expandOverUniverse uses overrides only; pass vocab as universe unused.
  return expandOverUniverse(normalized, universe, fieldLabel, isBoolean, vocabSet);
}

/** Compact a fully expanded boolean map for manager JSON write-back. */
export function compactBooleanMap(
  expanded: Record<string, boolean>,
  vocabCodes: string[],
): boolean | Record<string, boolean> {
  const values = Object.values(expanded);
  if (values.length === 0) return false;
  const allSame = values.every((v) => v === values[0]);
  if (allSame && Object.keys(expanded).length === vocabCodes.length) {
    return values[0]!;
  }
  // Prefer default = majority (or false if mixed) + overrides.
  const trueCount = values.filter(Boolean).length;
  const falseCount = values.length - trueCount;
  const defaultValue = falseCount >= trueCount ? false : true;
  const result: Record<string, boolean> = { default: defaultValue };
  for (const [code, enabled] of Object.entries(expanded)) {
    if (enabled !== defaultValue) result[code] = enabled;
  }
  // If every country is an override of a useless default and listed set is
  // small, write a plain map without default when not covering full vocab.
  if (Object.keys(expanded).length < vocabCodes.length) {
    return { ...expanded };
  }
  return result;
}

/** Compact a numeric (or range) map: scalar if uniform, else default+overrides. */
export function compactValueMap<T>(
  expanded: Record<string, T>,
  equal: (a: T, b: T) => boolean,
): T | Record<string, T> {
  const entries = Object.entries(expanded);
  if (entries.length === 0) {
    throw new Error('cannot compact an empty map');
  }
  const [, first] = entries[0]!;
  if (entries.every(([, v]) => equal(v, first))) return first;

  // Choose the most frequent value as default.
  const counts = new Map<string, { value: T; count: number }>();
  for (const [, value] of entries) {
    const key = JSON.stringify(value);
    const slot = counts.get(key);
    if (slot) slot.count += 1;
    else counts.set(key, { value, count: 1 });
  }
  let best = { value: first, count: 0 };
  for (const slot of counts.values()) {
    if (slot.count > best.count) best = slot;
  }
  const result: Record<string, T> = { default: best.value };
  for (const [code, value] of entries) {
    if (!equal(value, best.value)) result[code] = value;
  }
  return result;
}

/**
 * Expand price: scalar | map | { default, overrides }.
 * Scalar or `{ default }` fills every country in `universe`.
 * Listed-only maps may omit countries — those rows stay absent until
 * resolved at checkout / admin enable time (`packet_price_missing`).
 */
export function expandPriceOverCountries(
  raw: unknown,
  universe: string[],
  fieldLabel: string,
  vocabCodes: ReadonlySet<string>,
): number | Record<string, number> {
  if (isPositivePrice(raw)) return raw;

  const { defaultValue, overrides, listedOnly } = splitDefaultMap(raw, fieldLabel, isPositivePrice);
  assertKnownCountryKeys(Object.keys(overrides), vocabCodes, fieldLabel);

  if (listedOnly) {
    if (Object.keys(overrides).length === 0) {
      throw new Error(`${fieldLabel} must list at least one country when default is omitted.`);
    }
    const allUniverseCovered = universe.every((code) => isPositivePrice(overrides[code]));
    const values = Object.values(overrides);
    if (allUniverseCovered && values.every((v) => v === values[0])) {
      return values[0]!;
    }
    return { ...overrides };
  }

  if (defaultValue === undefined) {
    throw new Error(`${fieldLabel}: expected a default price.`);
  }
  const map: Record<string, number> = {};
  let allDefault = true;
  for (const code of universe) {
    const value: number = overrides[code] !== undefined ? overrides[code]! : defaultValue;
    map[code] = value;
    if (value !== defaultValue) allDefault = false;
  }
  if (allDefault) return defaultValue;
  return map;
}

/**
 * Expand deliveryTime over universe — must cover every country.
 * Accepts scalar `{min,max}` or map / default map of ranges.
 */
export function expandDeliveryTime(
  raw: unknown,
  universe: string[],
  fieldLabel: string,
  vocabCodes: ReadonlySet<string>,
): Record<string, { min: number; max: number }> {
  const expanded = expandOverUniverse(raw, universe, fieldLabel, isDeliveryRange, vocabCodes);
  for (const code of universe) {
    if (!expanded[code]) {
      throw new Error(`${fieldLabel}: missing range for ${code}.`);
    }
  }
  // If listed-only left gaps, expandOverUniverse wouldn't include them —
  // require full coverage:
  if (Object.keys(expanded).length < universe.length) {
    const missing = universe.filter((c) => !expanded[c]);
    throw new Error(`${fieldLabel} must cover every country (missing ${missing.join(', ')}).`);
  }
  return Object.fromEntries(universe.map((code) => [code, expanded[code]!]));
}

/**
 * Expand custodyTime when the key is present.
 * Listed-only → only those countries; others absent (caller sets null).
 * Scalar / default → every universe country.
 */
export function expandCustodyTime(
  raw: unknown,
  universe: string[],
  fieldLabel: string,
  vocabCodes: ReadonlySet<string>,
): Record<string, number> {
  return expandOverUniverse(raw, universe, fieldLabel, isPositiveInteger, vocabCodes);
}
