import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';

const PRIVATE_PATHS = ['/admin', '/account', '/checkout', '/gallery?'];

const register: PluginRegisterFn = async (api) => {
  api.addFilter(
    CORE_OPENING_FILTERS.seoRobots,
    (rules: Array<{ userAgent?: string; directive: string; value: string }>) => [
      ...rules,
      ...PRIVATE_PATHS.map((value) => ({ directive: 'Disallow' as const, value })),
    ],
  );
};

export { register };
export default register;
