import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { AccessibilityPage } from './AccessibilityPage';

export const pluginFront: PluginFrontModule = {
  pluginId: 'page-accessibility',
  publicRoutes: [{ path: 'accessibility', element: <AccessibilityPage /> }],
};

export default pluginFront;
