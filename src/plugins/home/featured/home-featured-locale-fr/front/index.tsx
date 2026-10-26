import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { catalog } from './catalog';

export const pluginFront: PluginFrontModule = {
  pluginId: "home-featured-locale-fr",
  locales: [{ lang: 'fr', catalog: catalog }],
};

export default pluginFront;
