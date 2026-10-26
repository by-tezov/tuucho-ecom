import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { catalog } from './catalog';

export const pluginFront: PluginFrontModule = {
  pluginId: 'page-legal-locale-en',
  locales: [{ lang: 'en', catalog }],
};

export default pluginFront;
