import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { CORE_FRONT_SLOTS } from '@kernel/front/plugins/frontSlots';
import { NewArrivals } from './NewArrivals';

export const pluginFront: PluginFrontModule = {
  pluginId: 'home-featured',
  slots: { [CORE_FRONT_SLOTS.homeFeatured]: <NewArrivals /> },
};

export default pluginFront;
