import type { PluginRegisterFn, SpyChannelDeclaration } from '@tuucho/plugin-sdk';
import { appendSpyChannel, CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { productRequestRouter } from './src/http/productRequest.router.js';
import { adminProductRequestsRouter } from './src/http/adminProductRequests.router.js';
import { operationProductRequestsRouter } from './src/http/operationProductRequests.router.js';
import * as productRequest from './src/application/productRequest.js';

const register: PluginRegisterFn = async (api) => {
  api.addFilter(CORE_OPENING_FILTERS.mailSpyChannels, (channels: SpyChannelDeclaration[]) =>
    appendSpyChannel(channels, {
      id: 'product_request',
      pluginId: api.pluginId,
      title: 'Product request',
      description: 'Staff copy when a sold-out size is requested.',
      filters: ['role', 'email', 'kind'],
    }),
  );
  api.registerPluginService(api.pluginId, { ...productRequest });
  api.registerHttpMount({ scope: 'public', path: '/contact', router: productRequestRouter });
  api.registerHttpMount({ scope: 'admin', path: '/', router: adminProductRequestsRouter });
  api.registerHttpMount({ scope: 'operation', path: '/', router: operationProductRequestsRouter });
};

export { register };
export default register;
