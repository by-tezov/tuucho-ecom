import type { Pool } from 'pg';
import { pool } from '../../../db/pool.js';
import { config } from '../../../config/env.js';
import { getRegisteredLanguage, isLanguage } from '../../../utils/language.js';
import { rememberBrandAssets } from './brandAssetsPeek.js';
import { CORE_VERSION, listPlugins, type InstalledPlugin } from './pluginStore.js';
import { pluginSurfaceEnabled } from './pluginSurface.js';
import {
  getProductAxes,
  getStoreIdentity,
  getStoreMenus,
  getThemeCustomization,
  type StoreMenuItem,
} from './storeSettings.js';
import { applyFilters } from './hooks.js';
import { buildCoreOpenings } from './coreOpenings.js';
import { ensurePluginsLoaded } from './loadPluginRuntime.js';

function publicPluginSettings(plugin: InstalledPlugin): Record<string, unknown> {
  const schema = plugin.manifest.settingsSchema ?? {};
  const settings = { ...plugin.settings };
  for (const [key, field] of Object.entries(schema)) {
    if (field.type === 'secret') delete settings[key];
  }
  return settings;
}

/** Filters see the full payload, including menus of disabled plugins, so a
 * filter can remap such a menu onto its own enabled plugin id. Pruning runs
 * after `applyFilters`; `core-catalog` menus always survive. Extracted from
 * `buildStorefrontBootstrap` so the ordering is unit-testable without a
 * database. */
export async function finalizeStorefrontBootstrap<
  P extends { menus: StoreMenuItem[]; brandAssets?: Record<string, string> },
>(payload: P, enabled: ReadonlySet<string>): Promise<P> {
  const filtered = await applyFilters('storefront.bootstrap', payload);
  const next = {
    ...filtered,
    menus: filtered.menus
      .filter((item) => item.pluginId === 'core-catalog' || enabled.has(item.pluginId))
      .sort((a, b) => a.order - b.order),
  };
  rememberBrandAssets(next.brandAssets);
  return next;
}

export async function buildStorefrontBootstrap(db: Pool = pool) {
  await ensurePluginsLoaded();
  const [plugins, identity, axes, theme, menus, openings] = await Promise.all([
    listPlugins(db),
    getStoreIdentity(db),
    getProductAxes(db),
    getThemeCustomization(db),
    getStoreMenus(db),
    buildCoreOpenings(),
  ]);
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const enabled = new Set(
    plugins.filter((plugin) => pluginSurfaceEnabled(plugin, byId)).map((plugin) => plugin.id),
  );

  const payload = {
    installed: true,
    coreVersion: CORE_VERSION,
    store: identity,
    taxMode: identity.taxMode,
    productAxes: axes,
    theme,
    i18n: {
      default: config.i18n.defaultLanguage,
      enabled: config.i18n.enabledLanguages.filter(isLanguage),
      languages: config.i18n.enabledLanguages
        .map((code) => getRegisteredLanguage(code))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .map((entry) => ({
          code: entry.code,
          nativeName: entry.nativeName,
          ogLocale: entry.ogLocale,
          ...(entry.dateLocale ? { dateLocale: entry.dateLocale } : {}),
          ...(entry.flagUrl ? { flagUrl: entry.flagUrl } : {}),
        })),
    },
    /** Static brand artwork overrides (key -> absolute image URL), empty until
     * a plugin sets entries through the `storefront.bootstrap` filter. Keys are
     * the front's BRAND_ASSET_KEYS (`kernel/front/src/plugins/BrandAssetsContext`). */
    brandAssets: {} as Record<string, string>,
    menus: [...menus].sort((a, b) => a.order - b.order),
    plugins: plugins.map((plugin) => ({
      id: plugin.id,
      enabled: pluginSurfaceEnabled(plugin, byId),
      kind: plugin.manifest.kind,
      required: Boolean(plugin.manifest.required),
      name: plugin.manifest.name,
      route: plugin.manifest.route,
      nav: plugin.manifest.nav,
      dependsOn: plugin.manifest.dependsOn ?? [],
      adminNav: plugin.manifest.adminNav ?? [],
      settings: publicPluginSettings(plugin),
    })),
    adminNav: plugins.flatMap((plugin) =>
      pluginSurfaceEnabled(plugin, byId)
        ? (plugin.manifest.adminNav ?? []).map((item) => ({
            ...item,
            pluginId: plugin.id,
            label: item.label ?? plugin.manifest.name,
          }))
        : [],
    ),
    openings,
    homeRequired: true,
  };
  return finalizeStorefrontBootstrap(payload, enabled);
}
