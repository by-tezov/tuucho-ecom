import type { PluginRegisterFn, SpyResolveState } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { adminSpyMailRouter } from './src/http/adminSpyMail.router.js';
import { fillSpyResolve } from './src/application/spyResolve.js';

const register: PluginRegisterFn = async (api) => {
  api.addFilter(CORE_OPENING_FILTERS.mailSpyResolve, (state: SpyResolveState) => fillSpyResolve(state));
  api.registerHttpMount({ scope: 'admin', path: '/', router: adminSpyMailRouter });
};

export { register };
export default register;
