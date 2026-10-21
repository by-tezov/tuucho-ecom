import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

const AdminSpyMailPage = lazy(() =>
  import('./AdminSpyMailPage').then((m) => ({ default: m.AdminSpyMailPage })),
);

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-mail-spy',
  adminRoutes: [{ path: 'spy-mail', element: <AdminSpyMailPage /> }],
};

export default pluginFront;
