/** Client-side mirror of kernel/back cartRules.service evaluateCartRules —
 * preview only; checkout priceCheckout remains authoritative. */

export type CartRuleKind = 'gift_per_nail_set' | 'nail_qty_percent_tiers' | 'free_shipping_above';

export interface PublicCartRule {
  code: string;
  kind: CartRuleKind;
  priority: number;
  forbidVoucher: boolean;
  params: unknown;
  giftProductId?: string;
}

export interface GiftLinePreview {
  productId: string;
  quantity: number;
}

export interface NailQtyTierPreview {
  code: string;
  nailQty: number;
  tiers: Array<{ minQty: number; percent: number }>;
  matched: { minQty: number; percent: number } | null;
  next: { minQty: number; percent: number; needQty: number } | null;
  discount: number;
}

export interface FreeShippingPreview {
  code: string;
  countryCode: string;
  threshold: number | null;
  /** Merchandise toward franco: paid items minus volume remise (not shipping, not voucher). */
  current: number;
  /** Remaining euros to the country threshold; 0 when applied or no threshold. */
  need: number;
  applied: boolean;
  listFee: number;
  chargedFee: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** A positive integer param, else 0 (which then grants nothing). */
function positiveInt(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

/** 1 to 10, else 0. A composed set below this count is not a set unit. */
function minNailsParam(value: unknown): number {
  const nails = positiveInt(value);
  return nails >= 1 && nails <= 10 ? nails : 0;
}

function extraSetUnits(
  extraSets: ReadonlyArray<{ quantity: number; nailCount: number }>,
  minNails: number,
): number {
  if (minNails <= 0) return 0;
  return extraSets.reduce((sum, entry) => (entry.nailCount >= minNails ? sum + entry.quantity : sum), 0);
}

/** Preview the locked gifts the API will create after a guest cart is merged
 * into an account (mirrors the API's desiredGiftQuantities). A catalogue nail
 * set is one unit. A composed set is one unit when it holds at least
 * `minNails` nails. The browser never persists these lines: the server still
 * recreates them from its current rules and stock-aware cart state. */
export function previewGiftLines(
  rules: PublicCartRule[],
  cart: { setUnits: number; extraSets: ReadonlyArray<{ quantity: number; nailCount: number }> },
): GiftLinePreview[] {
  const quantitiesByProductId = new Map<string, number>();
  for (const { kind, giftProductId, params } of rules) {
    if (kind !== 'gift_per_nail_set' || !giftProductId || !isPlainObject(params)) continue;
    const minNails = minNailsParam(params.minNails);
    const perUnit = positiveInt(params.qtyPerNailSetUnit);
    const units = cart.setUnits + extraSetUnits(cart.extraSets, minNails);
    const quantity = units * perUnit;
    if (quantity > 0)
      quantitiesByProductId.set(giftProductId, (quantitiesByProductId.get(giftProductId) ?? 0) + quantity);
  }
  return [...quantitiesByProductId].map(([productId, quantity]) => ({ productId, quantity }));
}

export function previewNailQtyTier(
  rules: PublicCartRule[],
  catalogueQty: number,
  catalogueSubtotal: number,
  extraSets: ReadonlyArray<{ quantity: number; nailCount: number; lineTotal: number }> = [],
): NailQtyTierPreview | null {
  const tierRule = [...rules]
    .filter((r) => r.kind === 'nail_qty_percent_tiers')
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code))[0];
  if (!tierRule || !isPlainObject(tierRule.params) || !Array.isArray(tierRule.params.tiers)) {
    return null;
  }
  const tiers = tierRule.params.tiers
    .map((tier) => {
      if (!isPlainObject(tier)) return null;
      const minQty = tier.minQty;
      const percent = tier.percent;
      if (typeof minQty !== 'number' || typeof percent !== 'number') return null;
      return { minQty, percent };
    })
    .filter((tier): tier is { minQty: number; percent: number } => !!tier)
    .sort((a, b) => a.minQty - b.minQty);
  const minNails = minNailsParam(tierRule.params.minNails);
  if (tiers.length === 0 || minNails === 0) return null;

  const counted = extraSets.filter((entry) => entry.nailCount >= minNails);
  const nailQty = catalogueQty + counted.reduce((sum, entry) => sum + entry.quantity, 0);
  const nailSubtotal = round2(catalogueSubtotal + counted.reduce((sum, entry) => sum + entry.lineTotal, 0));

  let matched: { minQty: number; percent: number } | null = null;
  for (const tier of tiers) {
    if (nailQty >= tier.minQty) matched = tier;
  }
  let next: { minQty: number; percent: number; needQty: number } | null = null;
  for (const tier of tiers) {
    if (nailQty < tier.minQty) {
      next = { minQty: tier.minQty, percent: tier.percent, needQty: tier.minQty - nailQty };
      break;
    }
  }
  return {
    code: tierRule.code,
    nailQty,
    tiers,
    matched,
    next,
    discount: matched ? round2(nailSubtotal * (matched.percent / 100)) : 0,
  };
}

/** `merchandiseSubtotal` is paid items after volume remise — never the courier fee. */
export function previewFreeShipping(
  rules: PublicCartRule[],
  countryCode: string | null | undefined,
  merchandiseSubtotal: number,
  listFee: number | undefined,
): FreeShippingPreview | null {
  const country = countryCode?.trim().toUpperCase() ?? '';
  if (!country || listFee === undefined) return null;
  const shipRule = [...rules]
    .filter((r) => r.kind === 'free_shipping_above')
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code))[0];
  if (!shipRule || !isPlainObject(shipRule.params) || !isPlainObject(shipRule.params.thresholdsByCountry)) {
    return null;
  }
  const raw = shipRule.params.thresholdsByCountry[country];
  const threshold = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  const current = round2(Math.max(0, merchandiseSubtotal));
  const applied = threshold !== null && current >= threshold;
  const need = threshold !== null && !applied ? round2(threshold - current) : 0;
  return {
    code: shipRule.code,
    countryCode: country,
    threshold,
    current,
    need,
    applied,
    listFee,
    chargedFee: applied ? 0 : listFee,
  };
}
