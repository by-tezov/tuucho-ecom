import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { pluginPackageDir } from './discoverPlugins.js';
import { manifestById } from './catalog.js';
import { isPluginEffectivelyEnabled } from './pluginStore.js';
import { ensurePluginsLoaded } from './loadPluginRuntime.js';

/** Load a file from an enabled plugin package. Undefined when that plugin
 * is off. Kernel code uses this instead of statically importing plugin src. */
export async function importEnabledPlugin<T = Record<string, unknown>>(
  pluginId: string,
  backRel: string,
): Promise<T | undefined> {
  await ensurePluginsLoaded();
  if (!(await isPluginEffectivelyEnabled(pluginId))) return undefined;
  const manifest = await manifestById(pluginId);
  if (!manifest) return undefined;
  const href = pathToFileURL(join(pluginPackageDir(manifest), 'back', backRel)).href;
  return import(href) as Promise<T>;
}
