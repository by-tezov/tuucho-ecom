import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { config } from '@kernel/back/config/env';

const EXTRA_PATHS = ['/pose', '/capsules'];

const register: PluginRegisterFn = async (api) => {
  api.addFilter(CORE_OPENING_FILTERS.seoSitemap, (entries: Array<{ loc?: string; source?: string }>) => {
    const origin = config.frontendBaseUrl.replace(/\/+$/, '');
    return [
      ...entries,
      ...EXTRA_PATHS.map((path) => ({ loc: `${origin}${path}`, source: api.pluginId })),
    ];
  });
};

export { register };
export default register;
