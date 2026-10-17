import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

const GiftCreatePage = lazy(() => import('./GiftCreatePage').then((m) => ({ default: m.GiftCreatePage })));
const GiftGiverPage = lazy(() => import('./GiftGiverPage').then((m) => ({ default: m.GiftGiverPage })));
const GiftReceiverApp = lazy(() => import('./GiftReceiverApp').then((m) => ({ default: m.GiftReceiverApp })));
const GiftReceiverCartPage = lazy(() =>
  import('./GiftReceiverCartPage').then((m) => ({ default: m.GiftReceiverCartPage })),
);
const AdminGiftPage = lazy(() => import('./AdminGiftPage').then((m) => ({ default: m.AdminGiftPage })));

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-commerce-gift',
  cartSurface: <GiftReceiverCartPage />,
  publicRoutes: [{ path: 'gift', element: <GiftCreatePage /> }],
  customerRoutes: [
    { path: 'gift/giver/:token/cart', element: <GiftGiverPage /> },
    { path: 'gift/giver/:token', element: <GiftGiverPage /> },
    { path: 'gift/:token', element: <GiftReceiverApp /> },
  ],
  adminRoutes: [{ path: 'gift', element: <AdminGiftPage /> }],
};

export default pluginFront;
