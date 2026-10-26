import type { AdminPlugin } from '../api/admin/shopSetup';

const LOCALE_COMPLEMENT_RE = /^(.+)-locale-[a-z]{2}$/;
const KERNEL_LOCALE_PACK_RE = /^tuucho-kernel-locale-[a-z]{2}$/;

export type AdminPluginGroup = {
  parent: AdminPlugin;
  locales: AdminPlugin[];
};

export type PluginOriginFilter = 'tuucho' | 'user';
export type PluginStatusFilter = 'all' | 'enabled' | 'disabled';

export function localeComplementParentId(id: string): string | null {
  const match = id.match(LOCALE_COMPLEMENT_RE);
  const parent = match?.[1];
  // Standalone kernel packs live on Admin → Core, not nested under a fake parent.
  if (!parent || parent === 'tuucho' || parent === 'tuucho-kernel') return null;
  return parent;
}

export function isKernelLocalePack(id: string): boolean {
  return KERNEL_LOCALE_PACK_RE.test(id);
}

function comparePlugins(a: AdminPlugin, b: AdminPlugin): number {
  const byName = a.manifest.name.localeCompare(b.manifest.name, undefined, { sensitivity: 'base' });
  return byName || a.id.localeCompare(b.id);
}

export function pluginSearchBlob(plugin: AdminPlugin): string {
  return [
    plugin.manifest.name,
    plugin.id,
    plugin.manifest.kind,
    plugin.manifest.description,
    plugin.manifest.version,
    plugin.schemaVersion,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** One row per real plugin. `*-locale-*` packs nest when their parent is present.
 * Kernel language packs are omitted here; they are managed on Admin → Core. */
export function groupAdminPlugins(plugins: AdminPlugin[]): AdminPluginGroup[] {
  const listed = plugins.filter((plugin) => !isKernelLocalePack(plugin.id));
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
