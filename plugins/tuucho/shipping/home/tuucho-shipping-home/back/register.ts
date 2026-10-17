import type { PluginRegisterFn } from '@tuucho/plugin-sdk';

const register: PluginRegisterFn = async (api) => {
  api.registerShippingMethod({
    id: api.pluginId,
    courierCodes: api.manifest.courierCodes ?? ['colissimo-home', 'chronopost-home', 'mondial-relay-home'],
  });
};

export { register };
export default register;
