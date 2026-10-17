import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';


export const pluginFront: PluginFrontModule = {
  pluginId: "tuucho-journal-admin-locale-fr",
  locales: [{ lang: 'fr' }],
};

export default pluginFront;
