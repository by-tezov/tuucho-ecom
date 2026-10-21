import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { AboutPage } from './AboutPage';

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-page-about',
  publicRoutes: [{ path: 'about', element: <AboutPage /> }],
};

export default pluginFront;
