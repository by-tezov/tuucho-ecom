import type { PluginKind, PluginManifest } from '../domain/contracts.js';
import { discoverDiskPlugins } from './discoverPlugins.js';

/** Disk manifests are the catalogue. There is no second SHIPPED_PLUGINS list. */
export async function loadManifests(): Promise<PluginManifest[]> {
  return discoverDiskPlugins();
}

export async function manifestById(id: string): Promise<PluginManifest | undefined> {
  const all = await loadManifests();
  return all.find((plugin) => plugin.id === id);
}

export async function manifestsOfKind(kind: PluginKind): Promise<PluginManifest[]> {
  const all = await loadManifests();
  return all.filter((plugin) => plugin.kinds.includes(kind));
}
