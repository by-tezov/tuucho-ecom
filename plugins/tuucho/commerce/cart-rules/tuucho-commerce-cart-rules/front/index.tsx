import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

const AdminCartRulesPage = lazy(() =>
  import('./AdminCartRulesPage').then((m) => ({ default: m.AdminCartRulesPage })),
);

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-commerce-cart-rules',
  adminRoutes: [{ path: 'cart-rules', element: <AdminCartRulesPage /> }],
};

export default pluginFront;
