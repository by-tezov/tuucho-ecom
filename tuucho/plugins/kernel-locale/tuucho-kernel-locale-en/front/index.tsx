import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { catalog } from './catalog';
import { adminCatalog } from './adminCatalog';

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-kernel-locale-en',
  locales: [{ lang: 'en', catalog, adminCatalog }],
};

export default pluginFront;
