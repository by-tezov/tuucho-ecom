import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { CORE_FRONT_SLOTS } from '@kernel/front/plugins/frontSlots';
import { ContactFaq } from './ContactFaq';

export const pluginFront: PluginFrontModule = {
  pluginId: 'home-faq',
  slots: { [CORE_FRONT_SLOTS.homeFaq]: <ContactFaq /> },
};

export default pluginFront;
