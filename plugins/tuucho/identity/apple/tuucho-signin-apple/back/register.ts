import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS, type CoreOpeningEntry } from '@tuucho/plugin-sdk';

const register: PluginRegisterFn = async (api) => {
  api.addFilter(CORE_OPENING_FILTERS.signIn, (entries: CoreOpeningEntry[]) => [
    ...entries,
    {
      id: 'apple',
      pluginId: api.pluginId,
      title: 'Apple Sign-in',
      description: 'Services ID, Team ID, Key ID, S2S audience, redirect URI, and AuthKey PEM live on this plugin Configure.',
    },
  ]);
};

export { register };
export default register;
