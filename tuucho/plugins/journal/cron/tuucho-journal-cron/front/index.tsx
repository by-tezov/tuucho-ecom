import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

const AdminCronLogsPage = lazy(() =>
  import('./AdminCronLogsPage').then((m) => ({ default: m.AdminCronLogsPage })),
);

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-journal-cron',
  adminRoutes: [{ path: 'crons', element: <AdminCronLogsPage /> }],
};

export default pluginFront;
