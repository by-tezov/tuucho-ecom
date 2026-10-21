import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-mail-spy-locale-fr',
  locales: [{ lang: 'fr' }],
};

export default pluginFront;
