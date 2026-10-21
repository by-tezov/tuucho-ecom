import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

const AdminApiLogPage = lazy(() =>
  import('./AdminApiLogPage').then((m) => ({ default: m.AdminApiLogPage })),
);

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-journal-admin',
  adminRoutes: [{ path: 'api-log', element: <AdminApiLogPage /> }],
};

export default pluginFront;
