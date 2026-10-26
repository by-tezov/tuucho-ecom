import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type UserPluginScanConfig = {
  roots: string[];
  enableOnScan: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPackRoot(dir: string): boolean {
  const tuucho = join(dir, 'tuucho');
  return (
    existsSync(join(tuucho, 'kernel')) &&
    existsSync(join(tuucho, 'plugin-sdk')) &&
    existsSync(join(tuucho, 'plugins'))
  );
}

/** Pack root: `tuucho/` with kernel, plugin-sdk, plugins. Config may still be missing (first install). */
export function findPackRoot(startDir: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = resolve(startDir);
  for (let i = 0; i < 16; i += 1) {
    if (isPackRoot(dir) && existsSync(join(dir, 'tuucho', 'factory-config'))) return dir;
    if (isPackRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Pack root not found. Clone root must contain tuucho/ (kernel, plugin-sdk, plugins).');
}

/** Shop root is the directory that contains both `tuucho/` and `tuucho-config/`. */
export function findShopRoot(startDir: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = resolve(startDir);
  for (let i = 0; i < 16; i += 1) {
    if (isPackRoot(dir) && existsSync(join(dir, 'tuucho-config'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'Shop root not found. Clone root must contain tuucho/ (kernel, plugin-sdk, plugins) and tuucho-config/. Run npm run config:migrate to copy factory-config.',
  );
}

export const shopRoot = findShopRoot();
export const tuuchoRoot = join(shopRoot, 'tuucho');
export const configRoot = join(shopRoot, 'tuucho-config');
export const bundledPluginsRoot = join(tuuchoRoot, 'plugins');

/** Root for generated/dev artifacts (reports, caches, log downloads, test
 * output). `OUTPUT_DIR` (flattened from JSON `paths.outputDir` when the
 * caller loads config) wins; a relative value resolves against the shop
 * root. Defaults to `<shopRoot>/output`. Scripts that never load JSON
 * config still land on the same default. */
export function outputRoot(): string {
  const raw = process.env.OUTPUT_DIR?.trim();
  return raw ? resolve(shopRoot, raw) : join(shopRoot, 'output');
}

export function readUserPluginScanConfig(root: string = shopRoot): UserPluginScanConfig {
  const live = join(root, 'tuucho-config', 'plugins.json');
  const example = join(root, 'tuucho-config', 'plugins.example.json');
  let path = live;
  if (!existsSync(live)) {
    if (!existsSync(example)) return { roots: [], enableOnScan: [] };
    path = example;
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!isObject(parsed)) return { roots: [], enableOnScan: [] };
  const roots = Array.isArray(parsed.roots)
    ? parsed.roots.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const enableOnScan = Array.isArray(parsed.enableOnScan)
    ? parsed.enableOnScan.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  return { roots, enableOnScan };
}

export function userPluginRoots(root: string = shopRoot): string[] {
  return readUserPluginScanConfig(root).roots.map((entry) => resolve(root, entry));
}
