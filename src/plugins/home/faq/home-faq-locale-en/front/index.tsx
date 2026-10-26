import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { catalog } from './catalog';

export const pluginFront: PluginFrontModule = {
  pluginId: 'home-faq-locale-en',
  locales: [{ lang: 'en', catalog }],
};

export default pluginFront;
