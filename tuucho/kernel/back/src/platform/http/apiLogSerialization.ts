const SENSITIVE_KEY =
  /(?:pass(?:word)?|secret|token|authorization|cookie|otp|pin|access.?pin|card|payment.?method|payment.?intent|client.?secret|vault.?key|stripe|cvv|cvc|pan|account.?number)/i;
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'stripe-signature',
  'x-chat-access-token',
  'x-checkout-session',
  'x-gift-pin-token',
]);
/** Client addresses. Redacted only in the anonymous (production) mode. */
const NETWORK_HEADERS = new Set([
  'x-forwarded-for',
  'x-real-ip',
  'forwarded',
  'cf-connecting-ip',
  'true-client-ip',
]);
const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const INTL_PHONE_IN_TEXT = /\+\d[\d\s().-]{6,}\d/g;

/** `secrets` hides credentials everywhere. `anonymous` also hides personal
 * data so a production journal cannot identify a customer. */
export type LogRedaction = 'secrets' | 'anonymous';

/** Bounded memoization matters for large gallery payloads, where a small set
 * of nested keys is visited thousands of times. */
const MAX_CACHED_KEYS = 2048;
const sensitiveKeyCache = new Map<string, boolean>();

function isSensitiveKey(key: string): boolean {
  const cached = sensitiveKeyCache.get(key);
  if (cached !== undefined) return cached;
  const result = SENSITIVE_KEY.test(key);
  if (sensitiveKeyCache.size < MAX_CACHED_KEYS) sensitiveKeyCache.set(key, result);
  return result;
}

/** Personal identifiers. Exact normalized names, plus any key that carries
 * an email or a phone. Product titles and bare `name` stay visible. */
function isPiiKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (
    normalized === 'line1' ||
    normalized === 'line2' ||
    normalized === 'city' ||
    normalized === 'zip' ||
    normalized === 'ip' ||
    normalized === 'recipient' ||
    normalized === 'deliverynotes' ||
    normalized === 'postalcode' ||
    normalized === 'postcode' ||
    normalized === 'zipcode' ||
    normalized === 'firstname' ||
    normalized === 'lastname' ||
    normalized === 'recipientname' ||
    normalized === 'companyname' ||
    normalized === 'holdername' ||
    normalized === 'birthdate' ||
    normalized === 'dateofbirth' ||
    normalized === 'ipaddress'
  ) {
    return true;
  }
  return normalized.includes('email') || normalized.includes('phone') || normalized.includes('mobile');
}

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function anonymizeString(value: string): string {
  const trimmed = value.trim();
  // A user id is digits and hyphens. It must not be treated as a phone number.
  if (/^\+?[\d\s().-]{8,}$/.test(trimmed) && !UUID_TEXT.test(trimmed)) return '[REDACTED]';
  return value.replace(EMAIL_IN_TEXT, '[REDACTED]').replace(INTL_PHONE_IN_TEXT, '[REDACTED]');
}

export function redactForLog(value: unknown, key?: string, mode: LogRedaction = 'secrets'): unknown {
  if (key && (isSensitiveKey(key) || (mode === 'anonymous' && isPiiKey(key)))) return '[REDACTED]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return mode === 'anonymous' ? anonymizeString(value) : value;
  if (Buffer.isBuffer(value)) return { type: 'binary', bytes: value.byteLength };
  if (Array.isArray(value)) return value.map((item) => redactForLog(item, undefined, mode));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([name, item]) => [
        name,
        redactForLog(item, name, mode),
      ]),
    );
  }
  return String(value);
}

export function headersForLog(
  headers: Record<string, unknown>,
  mode: LogRedaction = 'secrets',
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      SENSITIVE_HEADERS.has(name.toLowerCase()) ||
      isSensitiveKey(name) ||
      (mode === 'anonymous' && NETWORK_HEADERS.has(name.toLowerCase()))
        ? '[REDACTED]'
        : redactForLog(value, undefined, mode),
    ]),
  );
}

export function responseBodyForLog(
  contentType: string | undefined,
  data: Buffer,
  truncated: boolean,
  mode: LogRedaction = 'secrets',
): unknown {
  const type = contentType?.toLowerCase() ?? '';
  if (!type.includes('json')) return { type: type || 'empty', bytes: data.byteLength, omitted: true };
  const raw = data.toString('utf8');
  try {
    return { value: redactForLog(JSON.parse(raw), undefined, mode), ...(truncated ? { truncated: true } : {}) };
  } catch {
    return {
      type: 'invalid_json',
      bytes: data.byteLength,
      ...(truncated ? { truncated: true } : {}),
    };
  }
}
