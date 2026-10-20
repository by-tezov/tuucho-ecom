import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS, type CoreOpeningEntry } from '@tuucho/plugin-sdk';

const register: PluginRegisterFn = async (api) => {
  api.addFilter(CORE_OPENING_FILTERS.signIn, (entries: CoreOpeningEntry[]) => [
    ...entries,
    {
      id: 'facebook',
      pluginId: api.pluginId,
      title: 'Facebook Login',
      description: 'App id, secret, and OAuth return URL live on this plugin Configure.',
    },
  ]);
};

export { register };
export default register;
