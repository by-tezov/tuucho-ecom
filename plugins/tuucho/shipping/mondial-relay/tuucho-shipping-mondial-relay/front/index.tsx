import { lazy } from 'react';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';

const MondialRelayPickerPage = lazy(() =>
  import('./MondialRelayPickerPage').then((m) => ({ default: m.MondialRelayPickerPage })),
);

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-shipping-mondial-relay',
  customerRoutes: [{ path: 'account/addresses/mondial-relay', element: <MondialRelayPickerPage /> }],
};

export default pluginFront;
