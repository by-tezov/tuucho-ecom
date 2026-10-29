import type { AdminUiStrings } from '../assets/i18n/admin/types';
import type { Lang, Strings } from '../assets/i18n/types';
import { deepMerge } from './deepMerge';

export { deepMerge } from './deepMerge';

export type LocaleEnablement = Set<string> | 'all';

type CatalogModule = { catalog?: Record<string, unknown> };
type AdminCatalogModule = { adminCatalog?: Record<string, unknown> };

// Aliased globs (see `importAliases.ts`): the old relative chains escaped the
// repo for user plugins, so their catalogs never loaded. Bundled first, user
// last: later overlays win in `deepMerge`, so a user plugin can override
// bundled strings.
const catalogLoaders = {
  ...import.meta.glob('@plugins-bundled/**/front/catalog.ts'),
  ...import.meta.glob('@plugins-user/**/front/catalog.ts'),
} as Record<string, () => Promise<CatalogModule>>;

const adminCatalogLoaders = {
  ...import.meta.glob('@plugins-bundled/**/front/adminCatalog.ts'),
  ...import.meta.glob('@plugins-user/**/front/adminCatalog.ts'),
} as Record<string, () => Promise<AdminCatalogModule>>;

function pluginIdFromPath(path: string): string | null {
  // Leaf folder name is the plugin id; glob keys may be aliased or absolute.
  const match = path.match(/([^/]+)\/front\/[^/]+$/);
  return match?.[1] ?? null;
}

let catalogOverlayCache: Array<{ pluginId: string; catalog: Record<string, unknown> }> = [];
let adminCatalogOverlayCache: Array<{ pluginId: string; adminCatalog: Record<string, unknown> }> = [];
let catalogRevision = 0;
const catalogListeners = new Set<() => void>();
let catalogsLoad: Promise<void> | null = null;

function emitCatalogRevision(): void {
  catalogRevision += 1;
  for (const listener of catalogListeners) listener();
}

export function subscribeLocaleCatalogs(listener: () => void): () => void {
  catalogListeners.add(listener);
  return () => {
    catalogListeners.delete(listener);
  };
}

export function localeCatalogRevision(): number {
  return catalogRevision;
}

export async function ensureLocaleCatalogsLoaded(): Promise<void> {
  catalogsLoad ??= (async () => {
    const catalogSettled = await Promise.allSettled(
      Object.entries(catalogLoaders).map(async ([path, load]) => {
        try {
          const mod = await load();
          const pluginId = pluginIdFromPath(path);
          if (!pluginId || !mod.catalog) return null;
          return { pluginId, catalog: mod.catalog };
        } catch (error) {
          console.error(`[plugins] locale catalog failed (${path}); shop continues`, error);
          return null;
        }
      }),
    );
    const adminSettled = await Promise.allSettled(
      Object.entries(adminCatalogLoaders).map(async ([path, load]) => {
        try {
          const mod = await load();
          const pluginId = pluginIdFromPath(path);
          if (!pluginId || !mod.adminCatalog) return null;
          return { pluginId, adminCatalog: mod.adminCatalog };
        } catch (error) {
          console.error(`[plugins] admin locale catalog failed (${path}); shop continues`, error);
          return null;
        }
      }),
    );
    catalogOverlayCache = catalogSettled.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : [],
    );
    adminCatalogOverlayCache = adminSettled.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : [],
    );
    emitCatalogRevision();
  })();
  return catalogsLoad;
}

void ensureLocaleCatalogsLoaded();

function catalogOverlays(): Array<{ pluginId: string; catalog: Record<string, unknown> }> {
  return catalogOverlayCache;
}

function adminCatalogOverlays(): Array<{ pluginId: string; adminCatalog: Record<string, unknown> }> {
  return adminCatalogOverlayCache;
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

/** True when a locale pack for `lang` is on. Stock ships
 * `tuucho-kernel-locale-en|fr`; shops may unlock more codes with any enabled
 * `*-locale-<lang>` pack. Before bootstrap lists plugins (`enabled === 'all'`),
 * every product language is treated as available so cold paint is not empty
 * while catalogs settle. */
export function localeAvailable(lang: Lang, enabled: LocaleEnablement): boolean {
  if (enabled === 'all') return true;
  if (enabled.has(`tuucho-kernel-locale-${lang}`)) return true;
  for (const pluginId of enabled) {
    if (localePackLang(pluginId) === lang) return true;
  }
  return false;
}

/** @deprecated Prefer {@link localeAvailable}. */
export function frenchAvailable(enabled: LocaleEnablement): boolean {
  return localeAvailable('fr', enabled);
}

/** `tuucho-kernel-locale-<lang>` and `*-locale-<lang>` packs for the active language. */
export function localePackLang(pluginId: string): string | null {
  const match =
    /^tuucho-kernel-locale-([a-z]{2,3})$/.exec(pluginId) ?? /^.+-locale-([a-z]{2,3})$/.exec(pluginId);
  return match?.[1] ?? null;
}

/** Assemble storefront copy from locale packs only. Kernel and feature
 * plugins contribute keys via `t.*`; values come from `*-locale-<lang>`. */
export function assembleDictionary(lang: Lang, enabled: LocaleEnablement): Strings {
  let dict: Record<string, unknown> = {};
  for (const overlay of catalogOverlays()) {
    if (!allowed(overlay.pluginId, enabled)) continue;
    const packLang = localePackLang(overlay.pluginId);
    if (!packLang || packLang !== lang) continue;
    dict = deepMerge(dict, overlay.catalog);
  }
  return dict as unknown as Strings;
}

export function assembleAdminDictionary(lang: Lang, enabled: LocaleEnablement): AdminUiStrings {
  let dict: Record<string, unknown> = {};
  for (const overlay of adminCatalogOverlays()) {
    if (!allowed(overlay.pluginId, enabled)) continue;
    const packLang = localePackLang(overlay.pluginId);
    if (!packLang || packLang !== lang) continue;
    dict = deepMerge(dict, overlay.adminCatalog);
  }
  return dict as unknown as AdminUiStrings;
}
