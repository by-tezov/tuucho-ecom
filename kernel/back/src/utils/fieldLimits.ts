import { config } from '../config/env.js';
import { isNonEmptyString, isValidEmail } from './validate.js';

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/; // eslint-disable-line no-control-regex -- intentional reject of C0 controls
/** Optional leading `+`, then digits / spaces / `()-.`. Digit count is
 * checked separately (E.164: 8–15). */
const PHONE_RE = /^\+?[\d\s().-]+$/;
const PHONE_DIGIT_MIN = 8;
const PHONE_DIGIT_MAX = 15;
const POSTAL_RE = /^[A-Za-z0-9][A-Za-z0-9\s-]{0,}$/;
const VOUCHER_RE = /^[A-Za-z0-9_-]+$/;

/** Gift share-card message. Length includes spaces, tabs, and line breaks. */
export const GIFT_COMMENT_MAX_LENGTH = 500;
/** Giver and receiver names on a gift offer and its printed card. */
export const GIFT_NAME_MAX_LENGTH = 80;
/** Printed lines on the 5 x 3 inch card (preview and PDF). */
export const GIFT_COMMENT_MAX_LINES = 6;
/** Customer note on a cart card, copied onto the order line and invoice.
 * Mirrors the `*_comment_length` checks in migration 1791100000000. */
export const LINE_COMMENT_MAX_LENGTH = 500;

function hasControlChars(value: string): boolean {
  return CONTROL_CHARS_RE.test(value);
}

/** Trim, reject empty / over-max / control characters. */
function trimmedBounded(value: unknown, maximumLength: number): string | undefined {
  if (!isNonEmptyString(value)) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maximumLength || hasControlChars(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function boundedEmail(value: unknown): string | undefined {
  // Trim before validating: mobile autocomplete often appends a space.
  if (typeof value !== 'string') return undefined;
  const email = value.trim().toLowerCase();
  if (!isValidEmail(email)) return undefined;
  if (email.length > config.fieldLimits.emailMax) return undefined;
  return email;
}

export function boundedPassword(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > config.passwordMaxLength) return undefined;
  return value;
}

export function boundedPhone(value: unknown): string | undefined {
  const trimmed = trimmedBounded(value, config.fieldLimits.phoneMax);
  if (!trimmed || !PHONE_RE.test(trimmed)) return undefined;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < PHONE_DIGIT_MIN || digits.length > PHONE_DIGIT_MAX) return undefined;
  return trimmed;
}

/** Empty string / null-ish → null (clear); invalid → undefined (reject). */
export function phoneOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  if (value.trim().length === 0) return null;
  return boundedPhone(value);
}

export function boundedPostalCode(value: unknown): string | undefined {
  const trimmed = trimmedBounded(value, config.fieldLimits.postalCodeMax);
  if (!trimmed || !POSTAL_RE.test(trimmed)) return undefined;
  return trimmed;
}

export function boundedVoucherCode(value: unknown): string | undefined {
  const trimmed = trimmedBounded(value, config.fieldLimits.voucherCodeMax);
  if (!trimmed || !VOUCHER_RE.test(trimmed)) return undefined;
  return trimmed;
}

export function boundedGoogleIdToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  // GIS ID tokens are JWTs — much longer than magic-link tokens (FIELD_TOKEN_MAX).
  if (trimmed.length === 0 || trimmed.length > 8192 || hasControlChars(trimmed)) return undefined;
  return trimmed;
}

/** Sign in with Apple identity token (JWT). */
export function boundedAppleIdentityToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 8192 || hasControlChars(trimmed)) return undefined;
  return trimmed;
}

/** Client raw nonce for Sign in with Apple (front sends SHA-256 hex to Apple). */
export function boundedAppleNonce(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  // UUID / random bytes as hex or base64url; keep under FIELD_TOKEN_MAX.
  if (trimmed.length < 16 || trimmed.length > config.fieldLimits.tokenMax || hasControlChars(trimmed)) {
    return undefined;
  }
  return trimmed;
}

/** Facebook JS SDK short-lived user access token. */
export function boundedFacebookAccessToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 4096 || hasControlChars(trimmed)) return undefined;
  return trimmed;
}

export function boundedToken(value: unknown): string | undefined {
  return trimmedBounded(value, config.fieldLimits.tokenMax);
}

/** Six-digit email-confirmation OTP (digits only; spaces stripped). */
export function boundedOtpCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const digits = value.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(digits)) return undefined;
  return digits;
}

export function boundedPrintable(value: unknown, maximumLength: number): string | undefined {
  return trimmedBounded(value, maximumLength);
}

function printableLineCount(value: string): number {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n').length;
}

/** Gift card message: keep spaces, tabs, and line breaks as typed. Rejects
 * other C0 controls and a value with no non-whitespace character. */
export function boundedMultilinePrintable(
  value: unknown,
  maximumLength: number,
  maximumLines?: number,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > maximumLength) return undefined;
  // Allow tab / LF / CR; reject the rest of C0 and DEL.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) return undefined; // eslint-disable-line no-control-regex -- gift messages keep \t \n \r only
  if (!/\S/.test(value)) return undefined;
  if (maximumLines != null && printableLineCount(value) > maximumLines) return undefined;
  return value;
}

/** Cart card note: null / absent / blank → null (no note); over-long or
 * control characters → undefined (reject). Line breaks are kept. */
export function lineCommentOrNull(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return boundedMultilinePrintable(trimmed, LINE_COMMENT_MAX_LENGTH);
}

export function isPositiveIntegerAtMost(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}
