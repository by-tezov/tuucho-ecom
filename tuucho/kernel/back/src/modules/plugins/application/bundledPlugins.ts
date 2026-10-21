import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CORE_VERSION } from '../../../config/appVersion.js';
import { repoRoot } from './discoverPlugins.js';

export type BundledPluginEntry = {
  id: string;
  version: string;
  defaultEnabled: boolean;
};

export type BundledPluginsManifest = {
  kernel: string;
  plugins: BundledPluginEntry[];
};

let cached: BundledPluginsManifest | null = null;

export async function loadBundledPluginsManifest(): Promise<BundledPluginsManifest> {
  if (cached) return cached;
  try {
    const text = await readFile(join(repoRoot(), 'tuucho/plugins/manifest.json'), 'utf8');
    const body = JSON.parse(text) as Partial<BundledPluginsManifest>;
    const plugins = Array.isArray(body.plugins)
      ? body.plugins.filter(
          (row): row is BundledPluginEntry =>
            Boolean(row && typeof row.id === 'string' && typeof row.version === 'string'),
        )
      : [];
    cached = {
      kernel: typeof body.kernel === 'string' ? body.kernel : CORE_VERSION,
      plugins,
    };
    return cached;
  } catch {
    cached = { kernel: CORE_VERSION, plugins: [] };
    return cached;
  }
}

export function resetBundledPluginsManifestCache(): void {
  cached = null;
}
