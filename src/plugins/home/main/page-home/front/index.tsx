import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { HomePage } from './HomePage';

export const pluginFront: PluginFrontModule = {
  pluginId: 'page-home',
  publicRoutes: [{ path: 'home', element: <HomePage /> }],
};

export default pluginFront;
