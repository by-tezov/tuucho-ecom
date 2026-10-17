import type { OnboardingStrings } from '../../assets/i18n/types';
import type { PublicCartRule } from '../../api/gallery';
import { formatPrice } from '../../utils/formatPrice';

export type OnboardingSlideId = 'handmade' | 'deals' | 'loyalty' | 'custom';

export interface OnboardingVolumeTier {
  tiers: Array<{ minQty: number; percent: number }>;
  /** Demo fill 0–1 for the intro progress bar. */
  demoProgress: number;
}

export interface OnboardingFreeShipping {
  thresholdLabel: string;
  /** Demo fill 0–1 for the intro progress bar. */
  demoProgress: number;
}

export interface OnboardingSlide {
  id: OnboardingSlideId;
  title: string;
  headline: string;
  /** Plain body for handmade / loyalty / custom / generic deals fallback. */
  body?: string;
  volume?: OnboardingVolumeTier;
  freeShipping?: OnboardingFreeShipping;
  /** i18n bits needed only by the deals layout. */
  dealsCopy?: {
    subheadline: string;
    volumeTitle: string;
    volumeLead: string;
    volumeLadder: string;
    volumeHint: string;
    freeShippingTitle: string;
    freeShippingLead: string;
    freeShippingHint: string;
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function volumeTiersFromRules(rules: PublicCartRule[]): Array<{ minQty: number; percent: number }> {
  const tierRule = [...rules]
    .filter((rule) => rule.kind === 'nail_qty_percent_tiers')
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code))[0];
  if (!tierRule || !isPlainObject(tierRule.params) || !Array.isArray(tierRule.params.tiers)) {
    return [];
  }
  return tierRule.params.tiers
    .map((tier) => {
      if (!isPlainObject(tier)) return null;
      const minQty = tier.minQty;
      const percent = tier.percent;
      if (typeof minQty !== 'number' || typeof percent !== 'number') return null;
      return { minQty, percent };
    })
    .filter((tier): tier is { minQty: number; percent: number } => !!tier)
    .sort((a, b) => a.minQty - b.minQty);
}

/** Lowest free-shipping threshold across enabled courier (or legacy country) map entries. */
function lowestFreeShippingThreshold(rules: PublicCartRule[]): number | null {
  const shipRule = [...rules]
    .filter((rule) => rule.kind === 'free_shipping_above')
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code))[0];
  if (!shipRule || !isPlainObject(shipRule.params)) return null;

  const map =
    (isPlainObject(shipRule.params.thresholdsByCourier) && shipRule.params.thresholdsByCourier) ||
    (isPlainObject(shipRule.params.thresholdsByCountry) && shipRule.params.thresholdsByCountry) ||
    null;
  if (!map) return null;

  const amounts: number[] = [];
  for (const raw of Object.values(map)) {
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (Number.isFinite(value) && value > 0) amounts.push(value);
  }
  if (amounts.length === 0) return null;
  return Math.min(...amounts);
}

/** Build the visible slide list for the current shop flags and cart rules. */
export function buildOnboardingSlides(options: {
  copy: OnboardingStrings;
  cartRules: PublicCartRule[] | null;
}): OnboardingSlide[] {
  const { copy, cartRules } = options;
  const slides: OnboardingSlide[] = [
    {
      id: 'handmade',
      title: copy.handmade.title,
      headline: copy.handmade.headline,
      body: copy.handmade.body,
    },
  ];

  const tiers = cartRules ? volumeTiersFromRules(cartRules) : [];
  const threshold = cartRules ? lowestFreeShippingThreshold(cartRules) : null;
  const hasLiveDeals = tiers.length > 0 || threshold !== null;

  if (cartRules === null || hasLiveDeals) {
    const maxMin = tiers.length > 0 ? Math.max(...tiers.map((t) => t.minQty), 1) : 1;
    // Demo mid-ladder fill so the bar reads as a living progress cue.
    const volumeDemo = tiers.length > 0 ? Math.min(0.72, Math.max(0.35, 3 / maxMin)) : 0.55;
    const volumeLadder =
      tiers.length > 0 && typeof copy.deals.volumeTier === 'function'
        ? tiers.map((tier) => copy.deals.volumeTier(tier.minQty, tier.percent)).join(copy.deals.volumeJoin)
        : '';

    const freeShippingLead =
      threshold !== null && typeof copy.deals.freeShippingLead === 'function'
        ? copy.deals.freeShippingLead(formatPrice(threshold))
        : copy.deals.freeShippingHint;

    const dealsSlide: OnboardingSlide = {
      id: 'deals',
      title: copy.deals.title,
      headline: copy.deals.headline,
      dealsCopy: {
        subheadline: copy.deals.subheadline,
        volumeTitle: copy.deals.volumeTitle,
        volumeLead: copy.deals.volumeLead,
        volumeLadder,
        volumeHint: copy.deals.volumeHint,
        freeShippingTitle: copy.deals.freeShippingTitle,
        freeShippingLead,
        freeShippingHint: copy.deals.freeShippingHint,
      },
    };
    if (cartRules === null || !hasLiveDeals) {
      dealsSlide.body = copy.deals.genericBody;
    }
    // Volume card when tiers exist; keep a demo card if rules failed entirely.
    if (tiers.length > 0 || cartRules === null) {
      dealsSlide.volume = {
        tiers,
        demoProgress: volumeDemo,
      };
    }
    // Free-shipping is always part of this slide — live threshold when known.
    dealsSlide.freeShipping = {
      thresholdLabel: threshold !== null ? formatPrice(threshold) : '',
      demoProgress: 0.48,
    };
    slides.push(dealsSlide);
  }

  slides.push({
    id: 'loyalty',
    title: copy.loyalty.title,
    headline: copy.loyalty.headline,
    body: copy.loyalty.body,
  });

  slides.push({
    id: 'custom',
    title: copy.custom.title,
    headline: copy.custom.headline,
    body: copy.custom.body,
  });

  return slides;
}
