import type { PluginRegisterFn } from '@tuucho/plugin-sdk';

const register: PluginRegisterFn = async (api) => {
  api.addFilter('storefront.theme.slots', (slots: string[]) => [...slots, 'header', 'burger', 'bottomBar', 'footer']);
};

export { register };
export default register;
