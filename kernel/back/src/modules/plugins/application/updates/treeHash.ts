import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SKIP_DIR_NAMES = new Set(['node_modules', '.git', 'dist', 'coverage', '.tuucho-updates']);

export type PathHash = { path: string; sha256: string };

async function walkFiles(root: string, relative: string, out: PathHash[]): Promise<void> {
  const dir = relative ? join(root, relative) : root;
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  names.sort((left, right) => left.localeCompare(right));
  for (const name of names) {
    if (name.startsWith('.') || SKIP_DIR_NAMES.has(name)) continue;
    const rel = relative ? `${relative}/${name}` : name;
    const full = join(root, rel);
    const info = await stat(full);
    if (info.isDirectory()) {
      await walkFiles(root, rel, out);
      continue;
    }
    if (!info.isFile()) continue;
    const sha256 = createHash('sha256').update(await readFile(full)).digest('hex');
    out.push({ path: rel.replaceAll('\\', '/'), sha256 });
  }
}

export async function hashTree(root: string): Promise<PathHash[]> {
  const out: PathHash[] = [];
  await walkFiles(root, '', out);
  return out;
}

export function treeFingerprint(entries: PathHash[]): string {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(entry.path);
    hash.update('\0');
    hash.update(entry.sha256);
    hash.update('\n');
  }
  return hash.digest('hex');
}

export function diffTreeHashes(expected: PathHash[], actual: PathHash[]): string[] {
  const want = new Map(expected.map((entry) => [entry.path, entry.sha256]));
  const got = new Map(actual.map((entry) => [entry.path, entry.sha256]));
  const dirty: string[] = [];
  for (const [path, sha] of want) {
    if (got.get(path) !== sha) dirty.push(path);
  }
  for (const path of got.keys()) {
    if (!want.has(path)) dirty.push(path);
  }
  return [...new Set(dirty)].sort();
}
