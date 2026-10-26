import type { ReactNode } from 'react';

export type PluginRouteCandidate = { pluginId: string; element: ReactNode };
export type GroupedPluginRoute = { path: string; candidates: PluginRouteCandidate[] };

/** Collapse every plugin route onto one entry per final path. Candidate order
 * follows module load order (bundled plugins first, user plugins last — see
 * the glob spread in PluginHost.tsx), so index in `candidates` is priority:
 * later shadows earlier. First-seen path order is preserved. */
export function groupPluginRoutes(
  modules: ReadonlyArray<{
    pluginId: string;
    routes: ReadonlyArray<{ path: string; element: ReactNode }> | undefined;
  }>,
  pathPrefix = '',
): GroupedPluginRoute[] {
  const byPath = new Map<string, PluginRouteCandidate[]>();
  for (const mod of modules) {
    for (const route of mod.routes ?? []) {
      const path = `${pathPrefix}${route.path}`;
      const candidates = byPath.get(path);
      if (candidates) {
        candidates.push({ pluginId: mod.pluginId, element: route.element });
      } else {
        byPath.set(path, [{ pluginId: mod.pluginId, element: route.element }]);
      }
    }
  }
  return [...byPath.entries()].map(([path, candidates]) => ({ path, candidates }));
}

/** Last enabled candidate wins: a user plugin shadows a bundled page on a
 * duplicate path, and disabling the user plugin falls back to the bundled
 * one. Null when every candidate's plugin is disabled. */
export function pickRouteCandidate(
  candidates: ReadonlyArray<PluginRouteCandidate>,
  enabled: ReadonlySet<string>,
): PluginRouteCandidate | null {
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (candidate && enabled.has(candidate.pluginId)) return candidate;
  }
  return null;
}
