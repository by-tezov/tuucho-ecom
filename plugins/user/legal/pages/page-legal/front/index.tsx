import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { LegalNoticePage } from './LegalNoticePage';
import { PrivacyPage } from './PrivacyPage';
import { TermsPage } from './TermsPage';
import { SalesTermsPage } from './SalesTermsPage';

export const pluginFront: PluginFrontModule = {
  pluginId: 'page-legal',
  publicRoutes: [
    { path: 'legal', element: <LegalNoticePage /> },
    { path: 'privacy', element: <PrivacyPage /> },
    { path: 'terms', element: <TermsPage /> },
    { path: 'sales-terms', element: <SalesTermsPage /> },
  ],
};

export default pluginFront;
