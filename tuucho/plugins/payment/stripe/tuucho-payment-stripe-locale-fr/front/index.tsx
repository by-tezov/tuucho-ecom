import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';


export const pluginFront: PluginFrontModule = {
  pluginId: "tuucho-payment-stripe-locale-fr",
  locales: [{ lang: 'fr' }],
};

export default pluginFront;
