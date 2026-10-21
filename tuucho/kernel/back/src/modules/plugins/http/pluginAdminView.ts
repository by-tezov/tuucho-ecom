import { pluginConfigFilesView } from '../application/pluginConfigFiles.js';
import { secretKeysPresent, type InstalledPlugin } from '../application/pluginStore.js';

export function withPluginView(plugin: InstalledPlugin) {
  return {
    ...plugin,
    rates: [] as Array<{ code: string; name: string; packets: unknown[] }>,
    secretKeys: secretKeysPresent(plugin.id),
    configFiles: pluginConfigFilesView(plugin.manifest, plugin.configFilesHash),
  };
}
