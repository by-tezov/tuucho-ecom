type GetSettings = (pluginId: string) => Record<string, unknown>;

let getter: GetSettings = () => ({});

export function setPluginSettingsAccess(get: GetSettings): void {
  getter = get;
}

export function getPluginSettings(pluginId: string): Record<string, unknown> {
  return getter(pluginId) ?? {};
}

export function resetPluginSettingsAccess(): void {
  getter = () => ({});
}
