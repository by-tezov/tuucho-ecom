import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { PosePage } from './PosePage';
import { CapsulesPage } from './CapsulesPage';

export const pluginFront: PluginFrontModule = {
  pluginId: 'demo-page-guides',
  publicRoutes: [
    { path: 'pose', element: <PosePage /> },
    { path: 'capsules', element: <CapsulesPage /> },
  ],
};

export default pluginFront;
