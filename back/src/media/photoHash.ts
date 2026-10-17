import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config/env.js';

/** SHA-256 hex of modal (or any) photo bytes — same algorithm as
 * pamsurin-manager's prepare-library syncModalPhotoHashes. */
export function hashPhotoBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** True when the order snapshot already carries a non-empty modal hash.
 * List/read presenters trust this without re-reading disk; import/checkout
 * paths still call `modalPhotoMatches` when they need live verification. */
export function hasStoredModalHash(expectedHash: string | null | undefined): boolean {
  return Boolean(expectedHash && expectedHash.length > 0);
}

/** Re-reads the modal file under MEDIA_DIR and compares to the stored hash.
 * Missing file or empty expected hash → false. Use on import/checkout
 * verification only; customer order list/detail presenters trust the stored
 * hash via `hasStoredModalHash`. */
export async function modalPhotoMatches(modalRelativePath: string, expectedHash: string): Promise<boolean> {
  if (!expectedHash || !modalRelativePath) return false;
  try {
    return (await currentFileHash(join(config.mediaDir, modalRelativePath.replace(/^\/+/, '')))) === expectedHash;
  } catch {
    return false;
  }
}

/** Hash of a file, recomputed only when its size or mtime changed: the admin
 * order screen verifies every line's modal photo on each render (and after
 * each admin action), which re-read and re-hashed the same files every time.
 * A `stat` still runs per call, so a replaced photo is noticed at once.
 * Bounded; the oldest entry goes first. */
const HASH_CACHE_MAX = 2000;
const hashCache = new Map<string, { size: number; mtimeMs: number; hash: string }>();

async function currentFileHash(absolutePath: string): Promise<string> {
  const info = await stat(absolutePath);
  const cached = hashCache.get(absolutePath);
  if (cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) return cached.hash;
  const hash = hashPhotoBuffer(await readFile(absolutePath));
  hashCache.delete(absolutePath);
  hashCache.set(absolutePath, { size: info.size, mtimeMs: info.mtimeMs, hash });
  if (hashCache.size > HASH_CACHE_MAX) {
    const oldest = hashCache.keys().next().value;
    if (oldest !== undefined) hashCache.delete(oldest);
  }
  return hash;
}
