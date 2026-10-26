import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-docs-developer-locale-en',
  locales: [{ lang: 'en' }],
};

export default pluginFront;
