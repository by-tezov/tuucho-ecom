import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { assertNotUserTree } from './scopedPaths.js';

const SKIP = new Set(['node_modules', '.git', 'dist', 'coverage']);

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Copy repo-relative paths from a tag staging tree onto the live shop.
 * Official updates pass `allowUserTree: false` (the default). */
export async function copyScopedPaths(
  fromRoot: string,
  toRoot: string,
  relativePaths: string[],
  options: { allowUserTree?: boolean } = {},
): Promise<string[]> {
  const copied: string[] = [];
  const liveRoot = resolve(toRoot);
  for (const relative of relativePaths) {
    const posix = relative.replaceAll('\\', '/').replace(/^\/+/, '');
    if (!options.allowUserTree) assertNotUserTree(posix);
    const from = join(fromRoot, ...posix.split('/'));
    const to = join(toRoot, ...posix.split('/'));
    if (!(await pathExists(from))) continue;
    const resolvedTo = resolve(to);
    if (resolvedTo !== liveRoot && !resolvedTo.startsWith(`${liveRoot}/`)) {
      throw new Error(`Copy destination escapes the shop: ${posix}`);
    }
    await mkdir(dirname(to), { recursive: true });
    await rm(to, { recursive: true, force: true });
    await cp(from, to, {
      recursive: true,
      filter: (source) => {
        const name = source.split(/[\\/]/).pop() ?? '';
        return !SKIP.has(name);
      },
    });
    copied.push(posix);
  }
  return copied;
}
