import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';

function compactTimestamp(date = new Date()): string {
  const part = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${part(date.getUTCMonth() + 1)}${part(date.getUTCDate())}` +
    `${part(date.getUTCHours())}${part(date.getUTCMinutes())}${part(date.getUTCSeconds())}`
  );
}

function randomHex8(): string {
  return randomBytes(4).toString('hex');
}

/** Keep a readable original basename for UI / email; strip paths. */
export function sanitizeOriginalImageName(raw: string | undefined): string {
  const base = basename((raw ?? '').trim() || 'image.jpg') || 'image.jpg';
  const cleaned = base
    .replace(/[^\w.\- ()\u00C0-\u024F]+/gi, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  return cleaned || 'image.jpg';
}

/** Contact form files: `{yyyyMMddHHmmss}-{8hex}.jpg`. */
export function contactImageFileName(): string {
  return `${compactTimestamp()}-${randomHex8()}.jpg`;
}

/** Chat files: `{yyyyMMddHHmmss}-{publicId}-{8hex}.jpg`. */
export function chatImageFileName(publicId: string): string {
  return `${compactTimestamp()}-${publicId.toUpperCase()}-${randomHex8()}.jpg`;
}
