import { USER_PLUGIN_TREE } from '../pluginInstallPath.js';
import type { ShopReleaseManifest } from '../../domain/releaseManifest.js';

export type UpdateScope = 'all' | 'kernel' | 'plugins' | 'plugin';

export type ApplyRequest = {
  scope: UpdateScope;
  pluginId?: string;
};

const KERNEL_PATHS = ['kernel', 'plugin-sdk', 'release.json', 'package.json'] as const;

export const OFFICIAL_SNAPSHOT_PATHS = [
  'kernel',
  'plugin-sdk',
  'plugins/tuucho',
  'release.json',
  'package.json',
  'shop-release.json',
];

export function assertNotUserTree(path: string): void {
  const posix = path.replaceAll('\\', '/');
  if (posix === USER_PLUGIN_TREE || posix.startsWith(`${USER_PLUGIN_TREE}/`)) {
    throw new Error('Tuucho Apply never writes plugins/user/.');
  }
}

export function officialCopyPaths(scope: UpdateScope, manifest: ShopReleaseManifest, pluginId?: string): string[] {
  if (scope === 'plugin') {
    if (!pluginId) throw new Error('plugin scope needs pluginId.');
    const row = manifest.plugins.find((entry) => entry.id === pluginId);
    if (!row) throw new Error(`Plugin ${pluginId} is not in this tag's release.json.`);
    assertNotUserTree(row.installPath);
    return [row.installPath];
  }
  if (scope === 'plugins') {
    assertNotUserTree('plugins/tuucho');
    return ['plugins/tuucho'];
  }
  if (scope === 'kernel') return [...KERNEL_PATHS];
  assertNotUserTree('plugins/tuucho');
  return [...KERNEL_PATHS, 'plugins/tuucho'];
}

export function scopeWritesKernel(scope: UpdateScope): boolean {
  return scope === 'all' || scope === 'kernel';
}

export function scopeWritesTuuchoPlugins(scope: UpdateScope): boolean {
  return scope === 'all' || scope === 'plugins' || scope === 'plugin';
}
