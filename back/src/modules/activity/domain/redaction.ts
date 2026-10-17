import { DETAIL_MAX_BYTES, REDACTED_KEY_PATTERN, TARGETS_CAP } from './catalogue.js';

const REDACTED = '[redacted]';

/** Deep-copy `value`, replace sensitive keys, and truncate when the JSON
 * string would exceed the journal detail ceiling. */
export function redactAndCapDetail(value: unknown): Record<string, unknown> {
  const redacted = redactValue(value);
  const asObject =
    redacted !== null && typeof redacted === 'object' && !Array.isArray(redacted)
      ? (redacted as Record<string, unknown>)
      : { value: redacted };

  let json = JSON.stringify(asObject);
  if (Buffer.byteLength(json, 'utf8') <= DETAIL_MAX_BYTES) return asObject;

  const truncated: Record<string, unknown> = {
    truncated: true,
    preview: json.slice(0, Math.max(0, DETAIL_MAX_BYTES - 80)),
  };
  json = JSON.stringify(truncated);
  if (Buffer.byteLength(json, 'utf8') <= DETAIL_MAX_BYTES) return truncated;
  return { truncated: true };
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEY_PATTERN.test(key) ? REDACTED : redactValue(child);
  }
  return out;
}

/** Bound product uids (or similar ids) stored on a bulk journal row. */
export function boundTargets(targets: readonly string[] | undefined | null): {
  targets: string[];
  targetsTruncated: boolean;
} {
  if (!targets || targets.length === 0) return { targets: [], targetsTruncated: false };
  if (targets.length <= TARGETS_CAP) return { targets: [...targets], targetsTruncated: false };
  return { targets: targets.slice(0, TARGETS_CAP), targetsTruncated: true };
}

/** Strip secret-looking argv fragments from a CLI summary. */
export function sanitizeSourceCommand(argv: readonly string[] | string | null | undefined): string | null {
  if (argv == null) return null;
  const parts = typeof argv === 'string' ? argv.split(/\s+/) : [...argv];
  const cleaned = parts
    .map((part) => {
      if (/^(--)?(token|password|secret|key|authorization)=/i.test(part)) return `${part.split('=')[0]}=[redacted]`;
      if (/^[A-Za-z0-9_-]*(token|password|secret|key)$/i.test(part) && part.length > 20) return '[redacted]';
      return part;
    })
    .filter((part) => part.length > 0);
  const joined = cleaned.join(' ').trim();
  if (!joined) return null;
  return joined.length > 500 ? `${joined.slice(0, 497)}...` : joined;
}
