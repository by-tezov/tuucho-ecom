import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

const AdminVouchersPage = lazy(() =>
  import('./AdminVouchersPage').then((m) => ({ default: m.AdminVouchersPage })),
);

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-commerce-vouchers',
  adminRoutes: [{ path: 'vouchers', element: <AdminVouchersPage /> }],
};

export default pluginFront;
