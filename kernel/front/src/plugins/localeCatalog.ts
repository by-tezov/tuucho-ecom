import type { AdminUiStrings } from '../assets/i18n/admin/types';
import type { Lang, Strings } from '../assets/i18n/types';
import { deepMerge } from './deepMerge';

export { deepMerge } from './deepMerge';

export type LocaleEnablement = Set<string> | 'all';

type CatalogModule = { catalog?: Record<string, unknown> };
type AdminCatalogModule = { adminCatalog?: Record<string, unknown> };

const catalogModules = {
  ...import.meta.glob('../../../../plugins/**/front/catalog.ts', { eager: true }),
} as Record<string, CatalogModule>;

const adminCatalogModules = {
  ...import.meta.glob('../../../../plugins/**/front/adminCatalog.ts', { eager: true }),
} as Record<string, AdminCatalogModule>;

function pluginIdFromPath(path: string): string | null {
  const match = path.match(/\/plugins\/(?:.*\/)?([^/]+)\/front\//);
  return match?.[1] ?? null;
}

function catalogOverlays(): Array<{ pluginId: string; catalog: Record<string, unknown> }> {
  const out: Array<{ pluginId: string; catalog: Record<string, unknown> }> = [];
  for (const [path, mod] of Object.entries(catalogModules)) {
    const pluginId = pluginIdFromPath(path);
    if (!pluginId || !mod.catalog) continue;
    out.push({ pluginId, catalog: mod.catalog });
  }
  return out;
}

function adminCatalogOverlays(): Array<{ pluginId: string; adminCatalog: Record<string, unknown> }> {
  const out: Array<{ pluginId: string; adminCatalog: Record<string, unknown> }> = [];
  for (const [path, mod] of Object.entries(adminCatalogModules)) {
    const pluginId = pluginIdFromPath(path);
    if (!pluginId || !mod.adminCatalog) continue;
    out.push({ pluginId, adminCatalog: mod.adminCatalog });
  }
  return out;
}

function allowed(pluginId: string, enabled: LocaleEnablement): boolean {
  return enabled === 'all' || enabled.has(pluginId);
}

/** Stable identity for which locale plugins are on. A raw `Set` is a new
 * object every call, so it must never be a React effect/memo dependency. */
export function localeEnablementKey(pluginStates: Array<{ id: string; enabled: boolean }>): string {
  if (!pluginStates.length) return 'all';
  return pluginStates
    .filter((plugin) => plugin.enabled)
    .map((plugin) => plugin.id)
    .sort()
    .join('\0');
}

export function localeEnablementFromKey(key: string): LocaleEnablement {
  if (key === 'all') return 'all';
  if (!key) return new Set();
  return new Set(key.split('\0'));
}

export function localeEnablement(pluginStates: Array<{ id: string; enabled: boolean }>): LocaleEnablement {
  return localeEnablementFromKey(localeEnablementKey(pluginStates));
}

export function frenchAvailable(enabled: LocaleEnablement): boolean {
  if (enabled === 'all') {
    return catalogOverlays().some((entry) => entry.pluginId === 'tuucho-locale-fr');
  }
  return enabled.has('tuucho-locale-fr');
}

function isLocaleFrPack(pluginId: string): boolean {
  return pluginId === 'tuucho-locale-fr' || pluginId.endsWith('-locale-fr');
}

export function assembleDictionary(base: Strings, lang: Lang, enabled: LocaleEnablement): Strings {
  let dict = base;
  for (const overlay of catalogOverlays()) {
    if (!allowed(overlay.pluginId, enabled)) continue;
    const localePack = isLocaleFrPack(overlay.pluginId);
    if (lang === 'fr' ? !localePack : localePack) continue;
    dict = deepMerge(dict, overlay.catalog);
  }
  return dict;
}

export function assembleAdminDictionary(
  base: AdminUiStrings,
  lang: Lang,
  enabled: LocaleEnablement,
): AdminUiStrings {
  if (lang !== 'fr') return base;
  let dict = base;
  for (const overlay of adminCatalogOverlays()) {
    if (!allowed(overlay.pluginId, enabled)) continue;
    dict = deepMerge(dict, overlay.adminCatalog);
  }
  return dict;
}
