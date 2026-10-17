import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

const AdminEmailLogPage = lazy(() =>
  import('./AdminEmailLogPage').then((m) => ({ default: m.AdminEmailLogPage })),
);

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-journal-email',
  adminRoutes: [{ path: 'email-log', element: <AdminEmailLogPage /> }],
};

export default pluginFront;
