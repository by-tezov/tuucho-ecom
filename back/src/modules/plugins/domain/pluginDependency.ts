/** A plugin id, optionally pinned to a semver range of that plugin. */
export type PluginDependency = string | { id: string; version?: string };

export function dependencyId(dep: PluginDependency): string {
  return typeof dep === 'string' ? dep : dep.id;
}

export function dependencyRange(dep: PluginDependency): string | undefined {
  return typeof dep === 'string' ? undefined : dep.version;
}

export function dependencyList(deps: PluginDependency[] | undefined): PluginDependency[] {
  return deps ?? [];
}
