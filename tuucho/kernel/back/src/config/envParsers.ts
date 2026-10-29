/**
 * Validators for raw environment strings.
 *
 * Every one of these throws rather than falling back to a placeholder: a
 * misconfigured deployment must fail at startup, not serve wrong behaviour.
 */
import { parseDurationMs } from '../utils/duration.js';
import {
  getRegisteredLanguageCodes,
  isLanguageCodeFormat,
  type Language,
} from '../utils/language.js';

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function requiredHttpOrigin(value: string | undefined, name: string): string {
  const raw = required(value, name);
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    if ((url.pathname && url.pathname !== '/') || url.search || url.hash) throw new Error();
    return url.origin;
  } catch {
    throw new Error(`Invalid HTTP(S) origin environment variable ${name}: "${raw}".`);
  }
}

function optionalPositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`Invalid positive integer environment variable: "${value}".`);
  }
  return number;
}

/** Same as optionalPositiveInteger but 0 is a valid, meaningful value (used
 * by RECENT_LOGINS_DISPLAY_COUNT to mean "hide the block entirely") rather
 * than an error. */
function optionalNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Invalid non-negative integer environment variable: "${value}".`);
  }
  return number;
}

function requiredPositiveInteger(value: string | undefined, name: string): number {
  const number = Number(required(value, name));
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`Invalid positive integer environment variable ${name}: "${value}".`);
  }
  return number;
}

function requiredIntegerInRange(value: string | undefined, name: string, min: number, max: number): number {
  const number = Number(required(value, name));
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`Invalid integer environment variable ${name}: "${value}" (expected ${min}–${max}).`);
  }
  return number;
}

/** Finite number rounded to cents. Used for euro ceilings and earn rates. */
function requiredNumberInRange(value: string | undefined, name: string, min: number, max: number): number {
  const number = Number(required(value, name));
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`Invalid number environment variable ${name}: "${value}" (expected ${min}–${max}).`);
  }
  return Math.round(number * 100) / 100;
}

/** Fails loudly at startup on a malformed duration, rather than the
 * silent-undefined that parseDurationMs itself returns (see utils/duration.ts) —
 * consistent with every other `required*` helper here. Distinct from
 * JWT_ACCESS_TOKEN_TTL, which is left as a raw string and handed straight to
 * jsonwebtoken's own `expiresIn`, which parses this same shorthand itself. */
function requiredDurationMs(value: string | undefined, name: string): number {
  const parsed = parseDurationMs(required(value, name));
  if (parsed === undefined) {
    throw new Error(
      `Invalid duration environment variable ${name}: "${value}" (expected e.g. "15m", "1h", "30d").`,
    );
  }
  return parsed;
}

/** One `RATE_*` env var packs both the window and the max count as
 * `<duration>:<count>` (e.g. "15m:5") instead of two separate env vars —
 * still two independently-set numbers per limiter, just one name to grep.
 * Fails loudly on either half, same as every other `required*` helper. */
function requiredRateLimit(value: string | undefined, name: string): { windowMs: number; limit: number } {
  const raw = required(value, name);
  const [windowRaw, limitRaw] = raw.split(':');
  const windowMs = windowRaw === undefined ? undefined : parseDurationMs(windowRaw);
  const limit = limitRaw === undefined ? NaN : Number(limitRaw);
  if (windowMs === undefined || !Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error(
      `Invalid rate-limit environment variable ${name}: "${value}" (expected "<duration>:<count>", e.g. "15m:5").`,
    );
  }
  return { windowMs, limit };
}

/** One env var packs two related integers as `<a>:<b>` (e.g. "5:15" for a
 * day/month pair, or "1:20" for a free/max failures pair) instead of two
 * separate env vars — still two independently-set numbers, just one name
 * to grep. Each half keeps its own range, same as two `requiredIntegerInRange`
 * calls would. */
function requiredIntegerPair(
  value: string | undefined,
  name: string,
  rangeA: readonly [number, number] = [1, Number.MAX_SAFE_INTEGER],
  rangeB: readonly [number, number] = [1, Number.MAX_SAFE_INTEGER],
): [number, number] {
  const raw = required(value, name);
  const sep = raw.indexOf(':');
  if (sep < 0) {
    throw new Error(`Invalid environment variable ${name}: "${value}" (expected "<a>:<b>").`);
  }
  const a = requiredIntegerInRange(raw.slice(0, sep), name, rangeA[0], rangeA[1]);
  const b = requiredIntegerInRange(raw.slice(sep + 1), name, rangeB[0], rangeB[1]);
  return [a, b];
}

/** Optional duration with the same notation/validation as every other
 * duration setting. Defaults are duration strings too, keeping env files
 * readable and avoiding a second raw-millisecond convention. */
function optionalDurationMs(value: string | undefined, fallback: string, name: string): number {
  const parsed = parseDurationMs(value?.trim() || fallback);
  if (parsed === undefined) {
    throw new Error(
      `Invalid duration environment variable ${name}: "${value}" (expected e.g. "1.5s", "15m", "1h").`,
    );
  }
  return parsed;
}

/** A duration that may be left unset: null when absent or empty. */
function durationMsOrNull(value: string | undefined, name: string): number | null {
  if (!value?.trim()) return null;
  const parsed = parseDurationMs(value.trim());
  if (parsed === undefined) {
    throw new Error(
      `Invalid duration environment variable ${name}: "${value}" (expected e.g. "15m", "1h", "14d").`,
    );
  }
  return parsed;
}

/** Parses size shorthands like "2m" / "512k" / "2048" (bytes) into a byte count. */
function requiredByteSize(value: string | undefined, name: string): number {
  const raw = required(value, name).trim().toLowerCase();
  const match = /^(\d+)(b|k|kb|m|mb)?$/.exec(raw);
  if (!match) {
    throw new Error(
      `Invalid byte-size environment variable ${name}: "${value}" (expected e.g. "2m", "512k", "2048").`,
    );
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? 'b';
  const factor = unit === 'm' || unit === 'mb' ? 1024 * 1024 : unit === 'k' || unit === 'kb' ? 1024 : 1;
  const bytes = amount * factor;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new Error(`Invalid byte-size environment variable ${name}: "${value}".`);
  }
  return bytes;
}

/** Blank-tolerant when mail is folder-routed (dev, or preprod with
 * ROUTE_EMAIL_FOLDER=true) — SMTP isn't configured on a fresh local checkout,
 * but real-send targets must have values or fail loudly at startup rather
 * than silently never sending mail. */
function optionalUnlessDeployed(
  value: string | undefined,
  name: string,
  smtpOptional: boolean,
): string | undefined {
  if (smtpOptional && (value ?? '').trim() === '') return undefined;
  return required(value, name);
}

function optionalPositiveIntegerUnlessDeployed(
  value: string | undefined,
  name: string,
  smtpOptional: boolean,
): number | undefined {
  if (smtpOptional && (value ?? '').trim() === '') return undefined;
  return requiredPositiveInteger(value, name);
}

/** Comma-separated list, trimmed, empty entries dropped — same convention
 * as kernel/front's VITE_ENABLED_LANGUAGES. A single value with no comma
 * still works fine (one-element list), so this is backward compatible with
 * every existing single-origin CORS_ORIGIN value. */
function requiredList(value: string | undefined, name: string): string[] {
  const list = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (list.length === 0) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return list;
}

/** A language code (`i18n.default`). Format is validated here; membership in
 * the plugin-sdk registry is asserted after plugins load. */
function optionalLanguage(value: string | undefined, fallback: Language, name: string): Language {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (!isLanguageCodeFormat(raw)) {
    throw new Error(
      `Invalid language environment variable ${name}: "${value}" (expected a 2–3 letter lowercase code).`,
    );
  }
  return raw;
}

/** A comma-separated language list (`i18n.enabled`). Format only at config
 * load; registry membership is asserted after plugins load. Unset falls back
 * to every currently registered language (builtins en/fr before plugins). */
function optionalLanguageList(value: string | undefined, name: string): Language[] {
  const raw = (value ?? '').trim();
  if (!raw) return getRegisteredLanguageCodes();
  const entries = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  for (const entry of entries) {
    if (!isLanguageCodeFormat(entry)) {
      throw new Error(
        `Invalid language environment variable ${name}: "${entry}" in "${value}" (expected 2–3 letter lowercase codes).`,
      );
    }
  }
  const unique = [...new Set(entries)];
  if (unique.length === 0) return getRegisteredLanguageCodes();
  return unique;
}

export {
  durationMsOrNull,
  optionalDurationMs,
  optionalLanguage,
  optionalLanguageList,
  optionalNonNegativeInteger,
  optionalPositiveInteger,
  optionalPositiveIntegerUnlessDeployed,
  optionalUnlessDeployed,
  required,
  requiredByteSize,
  requiredDurationMs,
  requiredHttpOrigin,
  requiredIntegerInRange,
  requiredList,
  requiredIntegerPair,
  requiredNumberInRange,
  requiredPositiveInteger,
  requiredRateLimit,
};
