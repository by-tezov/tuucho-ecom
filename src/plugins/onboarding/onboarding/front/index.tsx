import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { CORE_FRONT_SLOTS } from '@kernel/front/plugins/frontSlots';
import { OnboardingController } from './OnboardingController';
import { OnboardingReplaySettings } from './OnboardingReplaySettings';

export const pluginFront: PluginFrontModule = {
  pluginId: 'onboarding',
  slots: {
    [CORE_FRONT_SLOTS.homeOnboarding]: <OnboardingController />,
    [CORE_FRONT_SLOTS.accountProfileEnd]: <OnboardingReplaySettings />,
  },
  slotOrder: { [CORE_FRONT_SLOTS.accountProfileEnd]: 0 },
};

export default pluginFront;
