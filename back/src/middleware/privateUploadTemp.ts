import { chmod, mkdtemp, readdir, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Request } from 'express';

const UPLOAD_TEMP_PREFIX = 'pamsurin-private-uploads-';
const UPLOAD_TEMP_STALE_MS = 24 * 60 * 60 * 1000;
const requestUploadDirs = new WeakMap<Request, string>();

/** Remove only old directories created with our mkdtemp prefix. A current
 * request is never old enough to match, so app processes can share tmp. */
const staleUploadCleanup = (async () => {
  const root = tmpdir();
  const entries = await readdir(root, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(UPLOAD_TEMP_PREFIX))
      .map(async (entry) => {
        const path = join(root, entry.name);
        const info = await stat(path).catch(() => undefined);
        if (info && Date.now() - info.mtimeMs >= UPLOAD_TEMP_STALE_MS) {
          await rm(path, { recursive: true, force: true }).catch(() => undefined);
        }
      }),
  );
})().catch(() => undefined);

export function uploadTempDirectory(req: Request): string | undefined {
  return requestUploadDirs.get(req);
}

export async function prepareUploadTempDir(req: Request): Promise<void> {
  await staleUploadCleanup;
  const directory = await mkdtemp(join(tmpdir(), UPLOAD_TEMP_PREFIX));
  // Register before chmod so cleanup can still remove a partially prepared dir.
  requestUploadDirs.set(req, directory);
  await chmod(directory, 0o700);
}

export function uploadedImageFiles(req: Request): Express.Multer.File[] {
  if (!Array.isArray(req.files)) return [];
  return req.files as Express.Multer.File[];
}

export async function secureUploadedTempFiles(req: Request): Promise<void> {
  await Promise.all(
    uploadedImageFiles(req).map(async (file) => {
      if (file.path) await chmod(file.path, 0o600);
    }),
  );
}

export async function removeUploadedTempFiles(req: Request): Promise<void> {
  await Promise.all(
    uploadedImageFiles(req).map(async (file) => {
      if (file.path) await unlink(file.path).catch(() => undefined);
    }),
  );
  const directory = requestUploadDirs.get(req);
  requestUploadDirs.delete(req);
  if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
}
