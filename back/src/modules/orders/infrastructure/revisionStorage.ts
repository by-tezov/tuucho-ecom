import { decryptJsonPii, encryptPii } from '../../../platform/security/piiCrypto.js';

export function encryptRevisionDiff(diff: unknown): { enc: string } {
  return { enc: encryptPii(JSON.stringify(diff))! };
}

export function decryptRevisionDiff(stored: unknown): unknown {
  if (stored && typeof stored === 'object' && 'enc' in stored) {
    const encrypted = (stored as { enc: unknown }).enc;
    if (typeof encrypted === 'string') return decryptJsonPii(encrypted);
  }
  return stored;
}

export function encryptOrderSnapshot(snapshot: unknown): { enc: string } {
  return { enc: encryptPii(JSON.stringify(snapshot))! };
}
