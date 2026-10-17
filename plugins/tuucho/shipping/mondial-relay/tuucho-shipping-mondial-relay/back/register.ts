import type { PluginRegisterFn } from '@tuucho/plugin-sdk';

const register: PluginRegisterFn = async (api) => {
  api.registerShippingMethod({
    id: api.pluginId,
    courierCodes: api.manifest.courierCodes ?? ['mondial-relay-point'],
  });
};

export { register };
export default register;
