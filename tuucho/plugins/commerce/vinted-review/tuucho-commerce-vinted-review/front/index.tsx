import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

const AdminReviewsPage = lazy(() =>
  import('./AdminReviewsPage').then((m) => ({ default: m.AdminReviewsPage })),
);

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-commerce-vinted-review',
  adminRoutes: [{ path: 'reviews', element: <AdminReviewsPage /> }],
};

export default pluginFront;
