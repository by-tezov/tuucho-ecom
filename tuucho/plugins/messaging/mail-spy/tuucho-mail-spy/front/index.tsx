import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { SpyRulesPanel } from './SpyRulesPanel';

export const pluginFront: PluginFrontModule = {
  pluginId: 'tuucho-mail-spy',
  configure: <SpyRulesPanel />,
  configureTab: 'Rules',
};

export default pluginFront;
