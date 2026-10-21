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

/** Shop root is the directory that contains both `tuucho/` and `tuucho-config/`. */
export function findShopRoot(startDir: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = resolve(startDir);
  for (let i = 0; i < 16; i += 1) {
    const tuucho = join(dir, 'tuucho');
    const config = join(dir, 'tuucho-config');
    if (
      existsSync(join(tuucho, 'kernel')) &&
      existsSync(join(tuucho, 'plugin-sdk')) &&
      existsSync(join(tuucho, 'plugins')) &&
      existsSync(config)
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'Shop root not found. Clone root must contain tuucho/ (kernel, plugin-sdk, plugins) and tuucho-config/.',
  );
}

export const shopRoot = findShopRoot();
export const tuuchoRoot = join(shopRoot, 'tuucho');
export const configRoot = join(shopRoot, 'tuucho-config');
export const bundledPluginsRoot = join(tuuchoRoot, 'plugins');

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
