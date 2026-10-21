import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { CORE_FRONT_SLOTS } from '@kernel/front/plugins/frontSlots';
import { AdminDashboardCard } from './AdminDashboardCard';

const AdminProductRequestsPage = lazy(() =>
  import('./AdminProductRequestsPage').then((m) => ({ default: m.AdminProductRequestsPage })),
);

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-commerce-product-requests',
  adminRoutes: [{ path: 'product-requests', element: <AdminProductRequestsPage /> }],
  slots: { [CORE_FRONT_SLOTS.adminDashboardAttention]: <AdminDashboardCard /> },
};

export default pluginFront;
