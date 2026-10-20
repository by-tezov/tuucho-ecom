import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

export const pluginFront: PluginFrontModule = {
  pluginId: "tuucho-signin-apple-locale-fr",
  locales: [{ lang: 'fr' }],
};

export default pluginFront;
