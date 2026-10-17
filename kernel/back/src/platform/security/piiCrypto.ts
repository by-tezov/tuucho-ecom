import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { config } from '../../config/env.js';

const VERSION_PREFIX = 'v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// Decoded once per configured value instead of on every encrypt/decrypt (an
// authenticated request decrypts several fields). Keyed by the raw setting so
// a changed configuration is still picked up.
let cachedKey: { raw: string; key: Buffer } | null = null;
let cachedPepper: { raw: string; pepper: Buffer } | null = null;

function encryptionKey(): Buffer {
  const raw = config.pii.encryptionKey;
  if (cachedKey?.raw === raw) return cachedKey.key;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must decode to exactly 32 bytes (base64).');
  }
  cachedKey = { raw, key };
  return key;
}

function lookupPepper(): Buffer {
  const raw = config.pii.lookupPepper;
  if (cachedPepper?.raw === raw) return cachedPepper.pepper;
  const pepper = Buffer.from(raw, 'base64');
  if (pepper.length < 16) {
    throw new Error('PII_LOOKUP_PEPPER must decode to at least 16 bytes (base64).');
  }
  cachedPepper = { raw, pepper };
  return pepper;
}

/** AES-256-GCM. Null/undefined pass through. Empty string is encrypted like any other value. */
export function encryptPii(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined) return null;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION_PREFIX + Buffer.concat([iv, ciphertext, tag]).toString('base64');
}

export function decryptPii(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined) return null;
  if (!stored.startsWith(VERSION_PREFIX)) {
    throw new Error('Unsupported or plaintext PII value (expected v1: ciphertext).');
  }
  const raw = Buffer.from(stored.slice(VERSION_PREFIX.length), 'base64');
  // An empty plaintext is a valid zero-byte ciphertext, so IV + tag is the minimum.
  if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Corrupt PII ciphertext.');
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(raw.length - AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH, raw.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('PII decryption failed (wrong key or tampered ciphertext).');
  }
}

/** Blind index for email equality / uniqueness. Same input → same hex. */
export function emailLookupHash(email: string): string {
  return createHmac('sha256', lookupPepper()).update(email.trim().toLowerCase()).digest('hex');
}

export function encryptJsonPii(value: unknown | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return encryptPii(JSON.stringify(value));
}

export function decryptJsonPii<T>(stored: string | null | undefined): T | null {
  const plain = decryptPii(stored);
  if (plain === null) return null;
  return JSON.parse(plain) as T;
}
