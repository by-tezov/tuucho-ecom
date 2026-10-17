import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Unpack a GitHub tag tar.gz into `dest` (repo root layout). Never the live tree. */
export async function extractTagTarGz(archive: Uint8Array, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const staging = await mkdtemp(join(tmpdir(), 'tuucho-tag-'));
  const archivePath = join(staging, 'archive.tar.gz');
  try {
    await writeFile(archivePath, archive);
    await execFileAsync('tar', ['-xzf', archivePath, '-C', dest, '--strip-components=1'], {
      maxBuffer: 32 * 1024 * 1024,
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
