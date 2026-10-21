import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { CORE_FRONT_SLOTS } from '@kernel/front/plugins/frontSlots';
import { FooterIdentity } from './FooterIdentity';

export const pluginFront: PluginFrontModule = {
  pluginId: 'footer-identity',
  slots: { [CORE_FRONT_SLOTS.footerIdentity]: <FooterIdentity /> },
};

export default pluginFront;
