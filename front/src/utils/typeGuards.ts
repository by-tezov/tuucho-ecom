/**
 * Tiny runtime type-guards for validating data coming back out of
 * localStorage/sessionStorage before trusting it.
 *
 * That data is exactly as untrusted as a network response: it was written by
 * a possibly-older version of this same app, so its shape can drift out from
 * under whatever the current code expects the moment a stored interface
 * changes. A naive `{ ...defaults, ...JSON.parse(raw) }` merge only catches a
 * *missing* field — a field present but wrongly typed (a string where a
 * number now belongs, a stale enum value, a nested object that lost a
 * property) sails straight through and fails much later, far from the
 * parsing code, wherever it first gets used the new way.
 *
 * The fix is to validate the actual shape at the one place data crosses that
 * trust boundary, and fall back to an empty/default value on any mismatch —
 * the same "discard rather than guess" policy every storage module here
 * already applies to a corrupt JSON blob or a failed decrypt, just extended
 * to cover a *parseable but incompatible* one too. No version number to
 * remember to bump: a validator that matches the current interface rejects
 * every shape that doesn't satisfy it, past or future, by construction.
 */

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isArrayOf<T>(value: unknown, item: (entry: unknown) => entry is T): value is T[] {
  return Array.isArray(value) && value.every(item);
}

/** A `Record<string, T>` — every own value must satisfy `item`. */
export function isRecordOf<T>(
  value: unknown,
  item: (entry: unknown) => entry is T,
): value is Record<string, T> {
  return isPlainObject(value) && Object.values(value).every(item);
}

/** Loosest possible check for an array of API-shaped objects (Address,
 * PaymentMethod, ...) whose full shape isn't worth re-validating field by
 * field here — the API itself is the source of truth for those, and a saved
 * one always gets re-fetched from it. This only guards against outright
 * garbage (a stale shape that is no longer even an object, or lost its id)
 * making it into React state and crashing whatever first assumes `.id`. */
export function isArrayOfObjectsWithId(value: unknown): value is Array<{ id: string }> {
  return isArrayOf(value, (entry): entry is { id: string } => isPlainObject(entry) && isString(entry.id));
}
