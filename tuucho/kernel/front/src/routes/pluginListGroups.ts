import type { AdminPlugin } from '../api/admin/shopSetup';

const LOCALE_COMPLEMENT_RE = /^(.+)-locale-[a-z]{2,3}$/;

export type AdminPluginGroup = {
  parent: AdminPlugin;
  locales: AdminPlugin[];
};

export type PluginOriginFilter = 'tuucho' | 'user';
export type PluginStatusFilter = 'all' | 'enabled' | 'disabled';

export function localeComplementParentId(id: string): string | null {
  const match = id.match(LOCALE_COMPLEMENT_RE);
  const parent = match?.[1];
  // Standalone kernel packs (`*-kernel-locale-<code>`) have no feature parent.
  if (!parent || parent === 'tuucho' || parent === 'tuucho-kernel' || parent.endsWith('-kernel')) {
    return null;
  }
  return parent;
}

/** Package declares only the locale role. */
export function isLocaleOnlyPlugin(plugin: AdminPlugin): boolean {
  const kinds = plugin.manifest.kinds ?? [];
  return kinds.length === 1 && kinds[0] === 'locale';
}

/**
 * Locale-only pack managed on Admin → Core (not Plugins tabs).
 * Feature complements with a present parent stay on Plugins nested under that parent.
 * Orphan complements (parent missing) are treated as standalone language packs.
 */
export function isStandaloneLocalePack(plugin: AdminPlugin, presentIds?: Set<string>): boolean {
  if (!isLocaleOnlyPlugin(plugin)) return false;
  const parentId = localeComplementParentId(plugin.id);
  if (!parentId) return true;
  if (presentIds && !presentIds.has(parentId)) return true;
  return false;
}

/** @deprecated Prefer {@link isStandaloneLocalePack}. */
export function isKernelLocalePack(id: string): boolean {
  return /^(?:.+-)?kernel-locale-[a-z]{2,3}$/.test(id);
}

function comparePlugins(a: AdminPlugin, b: AdminPlugin): number {
  const byName = a.manifest.name.localeCompare(b.manifest.name, undefined, { sensitivity: 'base' });
  return byName || a.id.localeCompare(b.id);
}

export function pluginSearchBlob(plugin: AdminPlugin): string {
  return [
    plugin.manifest.name,
    plugin.id,
    ...(plugin.manifest.kinds ?? []),
    plugin.manifest.description,
    plugin.manifest.version,
    plugin.schemaVersion,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** One row per real plugin. Complements nest when their parent is present.
 * Standalone locale-only packs are omitted; they are managed on Admin → Core. */
export function groupAdminPlugins(plugins: AdminPlugin[]): AdminPluginGroup[] {
  const presentIds = new Set(plugins.map((plugin) => plugin.id));
  const listed = plugins.filter((plugin) => !isStandaloneLocalePack(plugin, presentIds));
  const byId = new Map(listed.map((plugin) => [plugin.id, plugin]));
  const nestedIds = new Set<string>();
  const localesByParent = new Map<string, AdminPlugin[]>();
  for (const plugin of listed) {
    const parentId = localeComplementParentId(plugin.id);
    if (!parentId || !byId.has(parentId)) continue;
    const list = localesByParent.get(parentId) ?? [];
    list.push(plugin);
    localesByParent.set(parentId, list);
    nestedIds.add(plugin.id);
  }
  return listed
    .filter((plugin) => !nestedIds.has(plugin.id))
    .map((parent) => ({
      parent,
      locales: [...(localesByParent.get(parent.id) ?? [])].sort(comparePlugins),
    }))
    .sort((a, b) => comparePlugins(a.parent, b.parent));
}

/** Tuucho tab: bundled `plugins/` packages, or a `tuucho-*` id.
 * User tab is everything else (`src/plugins/`). The id prefix still wins
 * when `bundled` is missing or false, so a newly scanned tuucho package is
 * not parked on User before the manifest catches up. */
export function pluginIsTuucho(plugin: AdminPlugin): boolean {
  return plugin.bundled === true || plugin.id.startsWith('tuucho-');
}

function groupMatchesStatus(group: AdminPluginGroup, status: PluginStatusFilter): boolean {
  if (status === 'all') return true;
  const wantEnabled = status === 'enabled';
  return group.parent.enabled === wantEnabled;
}

export function filterPluginGroups(
  groups: AdminPluginGroup[],
  search: string,
  origin: PluginOriginFilter = 'tuucho',
  status: PluginStatusFilter = 'all',
): AdminPluginGroup[] {
  const needle = search.trim().toLowerCase();
  return groups.filter((group) => {
    if (pluginIsTuucho(group.parent) !== (origin === 'tuucho')) return false;
    if (!groupMatchesStatus(group, status)) return false;
    if (!needle) return true;
    return (
      pluginSearchBlob(group.parent).includes(needle) ||
      group.locales.some((plugin) => pluginSearchBlob(plugin).includes(needle))
    );
  });
}

export function groupLocaleSearchHit(group: AdminPluginGroup, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return false;
  if (pluginSearchBlob(group.parent).includes(needle)) return false;
  return group.locales.some((plugin) => pluginSearchBlob(plugin).includes(needle));
}
