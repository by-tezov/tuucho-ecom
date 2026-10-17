import type { Pool } from 'pg';
import { pool } from '../../../db/pool.js';
import { CORE_VERSION, listPlugins } from './pluginStore.js';
import { pluginSurfaceEnabled } from './pluginSurface.js';
import { getProductAxes, getStoreIdentity, getStoreMenus, getThemeCustomization } from './storeSettings.js';
import { applyFilters } from './hooks.js';
import { buildCoreOpenings } from './coreOpenings.js';

export async function buildStorefrontBootstrap(db: Pool = pool) {
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
  const visibleMenus = menus
    .filter((item) => item.pluginId === 'core-catalog' || enabled.has(item.pluginId))
    .sort((a, b) => a.order - b.order);

  const payload = {
    installed: true,
    coreVersion: CORE_VERSION,
    store: identity,
    taxMode: identity.taxMode,
    productAxes: axes,
    theme,
    menus: visibleMenus,
    plugins: plugins.map((plugin) => ({
      id: plugin.id,
      enabled: pluginSurfaceEnabled(plugin, byId),
      kind: plugin.manifest.kind,
      required: Boolean(plugin.manifest.required),
      name: plugin.manifest.name,
      route: plugin.manifest.route,
      nav: plugin.manifest.nav,
      dependsOn: plugin.manifest.dependsOn ?? [],
      settings: plugin.settings,
    })),
    openings,
    homeRequired: true,
  };
  return applyFilters('storefront.bootstrap', payload);
}
