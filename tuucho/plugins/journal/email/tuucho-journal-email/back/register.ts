import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import { adminEmailLogRouter } from './src/http/adminEmailLog.router.js';

const register: PluginRegisterFn = async (api) => {
  api.registerHttpMount({ scope: 'admin', path: '/', router: adminEmailLogRouter });
};

export { register };
export default register;
