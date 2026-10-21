/** Plugin ids that loaded for this process. Preferences and shop gates use this
 * so a disabled plugin's leftover preference rows do not apply. */
let enabledIds = new Set<string>();

export function setRuntimeEnabledPluginIds(ids: Iterable<string>): void {
  enabledIds = new Set(ids);
}

export function isRuntimePluginEnabled(pluginId: string): boolean {
  return enabledIds.has(pluginId);
}
