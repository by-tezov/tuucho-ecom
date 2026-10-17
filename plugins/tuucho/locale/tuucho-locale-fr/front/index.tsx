import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { catalog } from './catalog';
import { adminCatalog } from './adminCatalog';

export const pluginFront: PluginFrontModule = {
  pluginId: "tuucho-locale-fr",
  locales: [{ lang: 'fr', catalog: catalog, adminCatalog: adminCatalog }],
};

export default pluginFront;
