import type { PluginRegisterFn, SpyResolveState } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { fillSpyResolve } from './src/application/spyResolve.js';
import { spyRulesRouter } from './src/http/spyRules.router.js';

const register: PluginRegisterFn = async (api) => {
  api.addFilter(CORE_OPENING_FILTERS.mailSpyResolve, (state: SpyResolveState) => fillSpyResolve(state));
  api.registerHttpMount({ scope: 'admin', path: '/', router: spyRulesRouter });
};

export { register };
export default register;
