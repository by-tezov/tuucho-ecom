import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

const AdminDocsPage = lazy(() => import('./AdminDocsPage').then((m) => ({ default: m.AdminDocsPage })));

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-docs-developer',
  adminRoutes: [
    { path: 'docs/:articleId', element: <AdminDocsPage /> },
    { path: 'docs', element: <AdminDocsPage /> },
  ],
};

export default pluginFront;
