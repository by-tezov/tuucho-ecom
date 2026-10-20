import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS, type CoreOpeningEntry } from '@tuucho/plugin-sdk';

const register: PluginRegisterFn = async (api) => {
  api.addFilter(CORE_OPENING_FILTERS.signIn, (entries: CoreOpeningEntry[]) => [
    ...entries,
    {
      id: 'google',
      pluginId: api.pluginId,
      title: 'Google Sign-in',
      description: 'Google client id lives on this plugin Configure.',
    },
  ]);
};

export { register };
export default register;
