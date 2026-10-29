import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { listPlugins } from '@kernel/back/modules/plugins/application/pluginStore';
import { pluginSurfaceEnabled } from '@kernel/back/modules/plugins/application/pluginSurface';
import { config } from '@kernel/back/config/env';

const register: PluginRegisterFn = async (api) => {
  api.addFilter(CORE_OPENING_FILTERS.seoSitemap, async (entries: Array<{ loc?: string; source?: string }>) => {
    const plugins = await listPlugins();
    const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
    const extra = plugins.flatMap((plugin) => {
      // Sitemap by storefront route (any kinds that expose one), not page-only.
      if (!plugin.manifest.route) return [];
      if (!pluginSurfaceEnabled(plugin, byId)) return [];
      const origin = config.frontendBaseUrl.replace(/\/+$/, '');
      const path = plugin.manifest.route.startsWith('/') ? plugin.manifest.route : `/${plugin.manifest.route}`;
      return [{ loc: `${origin}${path}`, source: plugin.id }];
    });
    return [...entries, ...extra];
  });
};

export { register };
export default register;
