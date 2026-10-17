import type { PluginManifest } from '../domain/contracts.js';
import { dependencyId } from '../domain/pluginDependency.js';

export type PluginEnablement = {
  id: string;
  enabled: boolean;
  manifest: Pick<PluginManifest, 'dependsOn' | 'dependsOnMode'>;
};

/** True when the plugin is on and its dependsOn graph is satisfied.
 * `dependsOnMode: 'any'` (expedition cron) needs one enabled parent.
 * Default `all` needs every parent. Missing parents are ignored for `any`
 * and treated as unsatisfied for `all` only when listed. */
export function pluginSurfaceEnabled(
  plugin: PluginEnablement,
  byId: ReadonlyMap<string, PluginEnablement>,
  visiting: Set<string> = new Set(),
): boolean {
  if (!plugin.enabled) return false;
  if (visiting.has(plugin.id)) return true;
  visiting.add(plugin.id);
  const deps = plugin.manifest.dependsOn ?? [];
  if (deps.length === 0) return true;
  const mode = plugin.manifest.dependsOnMode === 'any' ? 'any' : 'all';
  const parentStates = deps.map((dep) => {
    const parent = byId.get(dependencyId(dep));
    if (!parent) return false;
    return pluginSurfaceEnabled(parent, byId, visiting);
  });
  return mode === 'any' ? parentStates.some(Boolean) : parentStates.every(Boolean);
}
