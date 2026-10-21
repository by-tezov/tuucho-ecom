export interface OnboardingSlideCopy {
  title: string;
  headline: string;
  body: string;
}

export interface OnboardingDealsCopy {
  title: string;
  headline: string;
  /** Short line under the headline on the deals photo slide. */
  subheadline: string;
  volumeTitle: string;
  volumeLead: string;
  /** One tier, e.g. "2 sets −5%". */
  volumeTier: (qty: number, percent: number) => string;
  /** Joiner between tiers, e.g. " · ". */
  volumeJoin: string;
  volumeHint: string;
  freeShippingTitle: string;
  freeShippingLead: (amount: string) => string;
  freeShippingHint: string;
  /** When cart-rules fetch fails or no live deals. */
  genericBody: string;
}

/** Post-splash shop introduction slides. */
export interface OnboardingStrings {
  closeAria: string;
  prevAria: string;
  nextLabel: string;
  doneLabel: string;
  stepAria: (current: number, total: number) => string;
  handmade: OnboardingSlideCopy;
  deals: OnboardingDealsCopy;
  loyalty: OnboardingSlideCopy;
  custom: OnboardingSlideCopy;
}
