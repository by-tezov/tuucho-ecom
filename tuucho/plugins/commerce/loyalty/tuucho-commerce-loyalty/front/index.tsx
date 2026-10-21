import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { CORE_FRONT_SLOTS } from '@kernel/front/plugins/frontSlots';
import { RequireAuth } from '@kernel/front/components/auth/RequireAuth';
import { AdminDashboardCard } from './AdminDashboardCard';

const AccountLoyaltyPage = lazy(() =>
  import('./AccountLoyaltyPage').then((m) => ({ default: m.AccountLoyaltyPage })),
);
const AdminLoyaltyPage = lazy(() => import('./AdminLoyaltyPage').then((m) => ({ default: m.AdminLoyaltyPage })));

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-commerce-loyalty',
  customerRoutes: [
    {
      path: 'account/loyalty',
      element: (
        <RequireAuth>
          <AccountLoyaltyPage />
        </RequireAuth>
      ),
    },
  ],
  adminRoutes: [{ path: 'loyalty', element: <AdminLoyaltyPage /> }],
  slots: { [CORE_FRONT_SLOTS.adminDashboard]: <AdminDashboardCard /> },
};

export default pluginFront;
