import { USER_PLUGIN_TREE } from '../pluginInstallPath.js';
import type { ShopReleaseManifest } from '../../domain/releaseManifest.js';

export type UpdateScope = 'all' | 'kernel' | 'plugins' | 'plugin';

export type ApplyRequest = {
  scope: UpdateScope;
  pluginId?: string;
};

const KERNEL_PATHS = ['tuucho/kernel', 'tuucho/plugin-sdk', 'release.json', 'package.json'] as const;

export const OFFICIAL_SNAPSHOT_PATHS = [
  'tuucho/kernel',
  'tuucho/plugin-sdk',
  'tuucho/plugins',
  'release.json',
  'package.json',
  'shop-release.json',
];

export function assertNotUserTree(path: string): void {
  const posix = path.replaceAll('\\', '/');
  if (posix === 'tuucho-config' || posix.startsWith('tuucho-config/')) {
    throw new Error('Tuucho Apply never writes tuucho-config/.');
  }
  if (posix === USER_PLUGIN_TREE || posix.startsWith(`${USER_PLUGIN_TREE}/`)) {
    throw new Error('Tuucho Apply never writes src/plugins/.');
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
    assertNotUserTree('tuucho/plugins');
    return ['tuucho/plugins'];
  }
  if (scope === 'kernel') return [...KERNEL_PATHS];
  assertNotUserTree('tuucho/plugins');
  return [...KERNEL_PATHS, 'tuucho/plugins'];
}

export function scopeWritesKernel(scope: UpdateScope): boolean {
  return scope === 'all' || scope === 'kernel';
}

export function scopeWritesTuuchoPlugins(scope: UpdateScope): boolean {
  return scope === 'all' || scope === 'plugins' || scope === 'plugin';
}
