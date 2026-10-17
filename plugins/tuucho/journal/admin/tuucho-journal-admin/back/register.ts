import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import { adminApiLogRouter } from './src/http/adminApiLog.router.js';

const register: PluginRegisterFn = async (api) => {
  api.registerHttpMount({ scope: 'admin', path: '/', router: adminApiLogRouter });
};

export { register };
export default register;
