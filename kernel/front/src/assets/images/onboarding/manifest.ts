import onboardingHandmade from './handmade.jpg';
import onboardingCustom from './custom.jpg';
import onboardingLoyalty from './loyalty.jpg';
import onboardingDeals from './deals.jpg';

/** Onboarding-only artwork — kept out of the shared image manifest so the
 * entry chunk (prerendered pages) does not pull these into its module graph. */
export const onboardingImages = {
  handmade: onboardingHandmade,
  custom: onboardingCustom,
  loyalty: onboardingLoyalty,
  deals: onboardingDeals,
} as const;
