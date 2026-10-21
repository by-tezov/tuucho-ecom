import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { ContactPage } from './ContactPage';

const AdminChatsPage = lazy(() => import('./AdminChatsPage').then((m) => ({ default: m.AdminChatsPage })));
const AdminUnconnectedContactsPage = lazy(() =>
  import('./AdminUnconnectedContactsPage').then((m) => ({ default: m.AdminUnconnectedContactsPage })),
);
const AdminContactConfigure = lazy(() =>
  import('./AdminContactConfigure').then((m) => ({ default: m.AdminContactConfigure })),
);

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-contact',
  publicRoutes: [{ path: 'contact', element: <ContactPage /> }],
  adminRoutes: [
    { path: 'chats', element: <AdminChatsPage /> },
    { path: 'unconnected-contacts', element: <AdminUnconnectedContactsPage /> },
  ],
  configure: <AdminContactConfigure />,
};

export default pluginFront;
