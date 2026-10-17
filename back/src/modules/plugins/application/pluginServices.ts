import { isPluginEffectivelyEnabled } from './pluginStore.js';

const services = new Map<string, unknown>();

/** Publish a public API other plugins may call. The id is the plugin id. */
export function registerPluginService<T>(pluginId: string, api: T): void {
  services.set(pluginId, api);
}

/** Read another plugin's public API. Undefined when that plugin is off,
 * missing, or has not registered. Never import the other plugin's files. */
export async function getPluginService<T>(pluginId: string): Promise<T | undefined> {
  if (!(await isPluginEffectivelyEnabled(pluginId))) return undefined;
  return services.get(pluginId) as T | undefined;
}

export function unregisterPluginService(pluginId: string): void {
  services.delete(pluginId);
}
