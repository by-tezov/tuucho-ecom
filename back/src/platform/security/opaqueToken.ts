import { createHash, randomBytes } from 'node:crypto';

/** Generate a high-entropy token suitable for a single-use link or cookie. */
export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('hex');
}

/** Persist only this deterministic digest; the raw bearer token stays client-side. */
export function hashOpaqueToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
