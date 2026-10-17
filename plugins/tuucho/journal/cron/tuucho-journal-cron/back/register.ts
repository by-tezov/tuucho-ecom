import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import { adminCronLogsRouter } from './src/http/adminCronLogs.router.js';

const register: PluginRegisterFn = async (api) => {
  api.registerHttpMount({ scope: 'admin', path: '/', router: adminCronLogsRouter });
};

export { register };
export default register;
