import { peekPluginService, registerPluginService, unregisterPluginService } from '@tuucho/plugin-sdk';
import { isPluginEffectivelyEnabled } from './pluginStore.js';

export { registerPluginService, unregisterPluginService };

/** Read another plugin's public API. Undefined when that plugin is off,
 * missing, or has not registered. Never import the other plugin's files. */
export async function getPluginService<T>(pluginId: string): Promise<T | undefined> {
  if (!(await isPluginEffectivelyEnabled(pluginId))) return undefined;
  return peekPluginService<T>(pluginId);
}

export function peekEnabledPluginService<T>(pluginId: string): T | undefined {
  return peekPluginService<T>(pluginId);
}
