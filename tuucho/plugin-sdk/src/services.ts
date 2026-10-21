const services = new Map<string, unknown>();

export function registerPluginService<T>(pluginId: string, api: T): void {
  services.set(pluginId, api);
}

export function peekPluginService<T>(pluginId: string): T | undefined {
  return services.get(pluginId) as T | undefined;
}

/** Throws when the plugin is not loaded. Prefer peek when the peer is optional. */
export function getPluginService<T>(pluginId: string): T {
  const api = peekPluginService<T>(pluginId);
  if (api === undefined) {
    throw new Error(`plugin_unavailable:${pluginId}`);
  }
  return api;
}

export function unregisterPluginService(pluginId: string): void {
  services.delete(pluginId);
}

export function resetPluginServices(): void {
  services.clear();
}

export function listedPluginServices(): string[] {
  return [...services.keys()].sort();
}
