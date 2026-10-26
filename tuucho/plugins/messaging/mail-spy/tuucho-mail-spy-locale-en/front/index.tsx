import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { adminCatalog } from './adminCatalog';

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-mail-spy-locale-en',
  locales: [{ lang: 'en', adminCatalog }],
};

export default pluginFront;
