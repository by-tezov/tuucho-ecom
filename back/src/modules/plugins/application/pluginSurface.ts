import type { PluginManifest } from '../domain/contracts.js';
import { dependencyId } from '../domain/pluginDependency.js';

export type PluginEnablement = {
  id: string;
  enabled: boolean;
  manifest: Pick<PluginManifest, 'dependsOn'>;
};

/** True when the plugin is on and every `dependsOn` ancestor is on.
 * Complements (journal-admin, expedition cron) disappear when their
 * API/shipping parent is disabled. */
export function pluginSurfaceEnabled(
  plugin: PluginEnablement,
  byId: ReadonlyMap<string, PluginEnablement>,
  visiting: Set<string> = new Set(),
): boolean {
  if (!plugin.enabled) return false;
  if (visiting.has(plugin.id)) return true;
  visiting.add(plugin.id);
  for (const dep of plugin.manifest.dependsOn ?? []) {
    const parent = byId.get(dependencyId(dep));
    if (!parent) continue;
    if (!pluginSurfaceEnabled(parent, byId, visiting)) return false;
  }
  return true;
}
