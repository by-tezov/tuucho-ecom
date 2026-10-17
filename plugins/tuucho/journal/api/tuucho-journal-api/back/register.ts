import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import { appendEmailLog } from '@kernel/back/platform/http/emailLog';

const register: PluginRegisterFn = async (api) => {
  api.registerPluginService(api.pluginId, {
    append: appendEmailLog,
    query: async () => [],
  });
};

export { register };
export default register;
