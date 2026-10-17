/**
 * What a cart rule is, and what it does to a price.
 *
 * Pure: given the enabled rules and the lines they apply to, this decides the
 * item discount, whether shipping is waived, and which gift lines a cart is
 * entitled to. It reads nothing and writes nothing.
 *
 * Kept apart from the storage of rules (`application/cartRules.ts`) so the rule
 * itself can be read and tested without a database. Rules decide money, and
 * they are applied before any voucher.
 */

export type CartRuleKind = 'gift_per_nail_set' | 'nail_qty_percent_tiers' | 'free_shipping_above';

/** Every kind, in the order the admin lists them. */
export const CART_RULE_KINDS: readonly CartRuleKind[] = [
  'gift_per_nail_set',
  'nail_qty_percent_tiers',
  'free_shipping_above',
];

/** The kinds that add a locked gift line. */
export function isGiftRuleKind(kind: CartRuleKind): boolean {
  return kind === 'gift_per_nail_set';
}

export interface CartRuleRow {
  id: string;
  code: string;
  kind: CartRuleKind;
  enabled: boolean;
  priority: number;
  forbid_voucher: boolean;
  params: unknown;
}

/** A gift per set unit. A catalogue nail set is always one unit. A composed
 * set is one unit when it holds at least `minNails` nails. */
export interface GiftPerNailSetParams {
  productUid: string;
  qtyPerNailSetUnit: number;
  minNails: number;
}

export interface NailQtyPercentTierParams {
  tiers: Array<{ minQty: number; percent: number }>;
  /** A composed set counts as one unit toward the tier from this many nails. */
  minNails: number;
}

export interface FreeShippingAboveParams {
  thresholdsByCountry: Record<string, number>;
}

export interface CartRuleUpsertInput {
  code: string;
  kind: CartRuleKind;
  enabled?: boolean;
  priority?: number;
  forbidVoucher?: boolean;
  params: unknown;
}

export interface CartRulesPricingState {
  gifts: Array<{ productId: string; productUid: string; quantity: number; locked: true; ruleCode: string }>;
  nailQtyTier: null | {
    code: string;
    enabled: true;
    nailQty: number;
    tiers: Array<{ minQty: number; percent: number }>;
    matched: { minQty: number; percent: number } | null;
    next: { minQty: number; percent: number; needQty: number } | null;
    discount: number;
  };
  freeShipping: null | {
    code: string;
    enabled: true;
    countryCode: string;
    threshold: number | null;
    applied: boolean;
    listFee: number;
    chargedFee: number;
  };
  forbidVoucher: boolean;
  rulesItemDiscount: number;
  shippingListFee: number;
  shippingFee: number;
  snapshot: object;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** 1 to 10: a composed set of fewer nails does not count as a set unit. */
function parseMinNails(value: unknown): number {
  if (!isPositiveInt(value) || value > 10) throw new Error('invalid_params');
  return value;
}

export function parseGiftPerNailSetParams(params: unknown): GiftPerNailSetParams {
  if (!isPlainObject(params)) throw new Error('invalid_params');
  const productUid = params.productUid;
  const qtyPerNailSetUnit = params.qtyPerNailSetUnit;
  if (typeof productUid !== 'string' || !productUid.trim()) throw new Error('invalid_params');
  if (!isPositiveInt(qtyPerNailSetUnit)) throw new Error('invalid_params');
  return {
    productUid: productUid.trim(),
    qtyPerNailSetUnit,
    minNails: parseMinNails(params.minNails),
  };
}

/** The gift product of a gift rule, or null for any other kind or malformed
 * params (a malformed rule grants nothing). */
export function giftRuleProductUid(rule: Pick<CartRuleRow, 'kind' | 'params'>): string | null {
  try {
    if (rule.kind === 'gift_per_nail_set') return parseGiftPerNailSetParams(rule.params).productUid;
  } catch {
    return null;
  }
  return null;
}

/** How many set units the composed sets contribute. Each one at or above
 * `minNails` counts as its quantity; a shorter one counts as zero. */
export function compositionSetUnits(
  compositions: Array<{ quantity: number; nailCount: number }>,
  minNails: number,
): number {
  return compositions.reduce(
    (sum, entry) => (entry.nailCount >= minNails ? sum + entry.quantity : sum),
    0,
  );
}

export interface GiftQuantity {
  productUid: string;
  quantity: number;
  /** The first rule (by priority) granting this product: the gift line is
   * filed under it. Two rules giving the same kit add up on one line. */
  ruleCode: string;
}

/**
 * Locked gift lines a cart is entitled to, one per gift product.
 * Catalogue nail sets each count as one unit. A composed set counts as one
 * unit when it holds at least the rule's `minNails` nails. Rules are read
 * enabled-only, by priority; malformed params grant nothing.
 */
export function desiredGiftQuantities(
  rules: Array<Pick<CartRuleRow, 'code' | 'kind' | 'enabled' | 'priority' | 'params'>>,
  cart: { setUnits: number; compositions: Array<{ quantity: number; nailCount: number }> },
): GiftQuantity[] {
  const byProduct = new Map<string, GiftQuantity>();
  const ordered = rules
    .filter((rule) => rule.enabled && isGiftRuleKind(rule.kind))
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));
  for (const rule of ordered) {
    let productUid: string;
    let quantity: number;
    try {
      const params = parseGiftPerNailSetParams(rule.params);
      productUid = params.productUid;
      const units = cart.setUnits + compositionSetUnits(cart.compositions, params.minNails);
      quantity = units * params.qtyPerNailSetUnit;
    } catch {
      continue;
    }
    if (quantity <= 0) continue;
    const key = productUid.toUpperCase();
    const current = byProduct.get(key);
    if (current) current.quantity += quantity;
    else byProduct.set(key, { productUid, quantity, ruleCode: rule.code });
  }
  return [...byProduct.values()];
}

export function parseNailQtyPercentTierParams(params: unknown): NailQtyPercentTierParams {
  if (!isPlainObject(params) || !Array.isArray(params.tiers) || params.tiers.length === 0) {
    throw new Error('invalid_params');
  }
  const tiers = params.tiers.map((tier) => {
    if (!isPlainObject(tier)) throw new Error('invalid_params');
    const minQty = tier.minQty;
    const percent = tier.percent;
    if (!isPositiveInt(minQty)) throw new Error('invalid_params');
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new Error('invalid_params');
    }
    return { minQty, percent };
  });
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const seen = new Set<number>();
  for (const tier of sorted) {
    if (seen.has(tier.minQty)) throw new Error('invalid_params');
    seen.add(tier.minQty);
  }
  return { tiers: sorted, minNails: parseMinNails(params.minNails) };
}

export function parseFreeShippingAboveParams(params: unknown): FreeShippingAboveParams {
  if (!isPlainObject(params) || !isPlainObject(params.thresholdsByCountry)) {
    throw new Error('invalid_params');
  }
  // Legacy courier-keyed maps are rejected on write so operators reseed
  // with country codes rather than silently mis-applying old keys.
  if (params.thresholdsByCourier !== undefined) {
    throw new Error('invalid_params');
  }
  const thresholdsByCountry: Record<string, number> = {};
  for (const [code, value] of Object.entries(params.thresholdsByCountry)) {
    const country = code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country) || !isNonNegNumber(value)) throw new Error('invalid_params');
    thresholdsByCountry[country] = value;
  }
  return { thresholdsByCountry };
}

export function validateAndNormalizeParams(kind: CartRuleKind, params: unknown): unknown {
  if (kind === 'gift_per_nail_set') return parseGiftPerNailSetParams(params);
  if (kind === 'nail_qty_percent_tiers') return parseNailQtyPercentTierParams(params);
  return parseFreeShippingAboveParams(params);
}

export function evaluateCartRules(input: {
  rules: CartRuleRow[];
  nailLines: Array<{ quantity: number; lineTotal: number }>;
  /** Composed sets. One at or above the tier's `minNails` counts as one unit
   * and its line total joins the discounted base. A shorter one does neither. */
  compositions?: Array<{ quantity: number; nailCount: number; lineTotal: number }>;
  merchandiseSubtotal: number;
  shippingListFee: number;
  countryCode: string;
  giftLines: Array<{ productId: string; productUid: string; quantity: number; ruleCode: string }>;
}): CartRulesPricingState {
  const enabled = input.rules
    .filter((rule) => rule.enabled)
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));

  const catalogueQty = input.nailLines.reduce((sum, line) => sum + line.quantity, 0);
  const catalogueSubtotal = round2(input.nailLines.reduce((sum, line) => sum + line.lineTotal, 0));
  const compositions = input.compositions ?? [];

  const gifts = input.giftLines.map((line) => ({
    productId: line.productId,
    productUid: line.productUid,
    quantity: line.quantity,
    locked: true as const,
    ruleCode: line.ruleCode,
  }));

  let nailQtyTier: CartRulesPricingState['nailQtyTier'] = null;
  let freeShipping: CartRulesPricingState['freeShipping'] = null;
  let forbidVoucher = false;
  let rulesItemDiscount = 0;
  let shippingFee = input.shippingListFee;

  const giftRuleByCode = new Map(enabled.filter((r) => isGiftRuleKind(r.kind)).map((r) => [r.code, r]));
  for (const gift of gifts) {
    if (gift.quantity > 0) {
      const rule = giftRuleByCode.get(gift.ruleCode);
      if (rule?.forbid_voucher) forbidVoucher = true;
    }
  }

  const tierRule = enabled.find((r) => r.kind === 'nail_qty_percent_tiers');
  let nailQty = catalogueQty;
  let nailSubtotal = catalogueSubtotal;
  if (tierRule) {
    let tiers: Array<{ minQty: number; percent: number }> = [];
    try {
      const parsed = parseNailQtyPercentTierParams(tierRule.params);
      tiers = parsed.tiers;
      const counted = compositions.filter((entry) => entry.nailCount >= parsed.minNails);
      nailQty = catalogueQty + counted.reduce((sum, entry) => sum + entry.quantity, 0);
      nailSubtotal = round2(catalogueSubtotal + counted.reduce((sum, entry) => sum + entry.lineTotal, 0));
    } catch {
      tiers = [];
    }
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
    const discount = matched ? round2(nailSubtotal * (matched.percent / 100)) : 0;
    nailQtyTier = {
      code: tierRule.code,
      enabled: true,
      nailQty,
      tiers,
      matched,
      next,
      discount,
    };
    rulesItemDiscount = discount;
    if (discount > 0 && tierRule.forbid_voucher) forbidVoucher = true;
  }

  const shipRule = enabled.find((r) => r.kind === 'free_shipping_above');
  if (shipRule) {
    const countryCode = input.countryCode.trim().toUpperCase();
    let threshold: number | null = null;
    try {
      const params = parseFreeShippingAboveParams(shipRule.params);
      const value = params.thresholdsByCountry[countryCode];
      threshold = value === undefined ? null : value;
    } catch {
      threshold = null;
    }
    // Franco vs paid items after volume remise — never the courier list fee,
    // and never a voucher (vouchers run after this in priceCheckout).
    const francoBase = round2(Math.max(0, input.merchandiseSubtotal - rulesItemDiscount));
    const applied = threshold !== null && francoBase >= threshold;
    shippingFee = applied ? 0 : input.shippingListFee;
    freeShipping = {
      code: shipRule.code,
      enabled: true,
      countryCode,
      threshold,
      applied,
      listFee: input.shippingListFee,
      chargedFee: shippingFee,
    };
    if (applied && shipRule.forbid_voucher) forbidVoucher = true;
  }

  const snapshot = {
    gifts: gifts.map((g) => ({
      code: g.ruleCode,
      kind: giftRuleByCode.get(g.ruleCode)?.kind ?? ('gift_per_nail_set' as const),
      effect: {
        productId: g.productId,
        productUid: g.productUid,
        quantity: g.quantity,
      },
    })),
    nailQtyTier: nailQtyTier
      ? {
          code: nailQtyTier.code,
          kind: 'nail_qty_percent_tiers' as const,
          effect: {
            nailQty: nailQtyTier.nailQty,
            matched: nailQtyTier.matched,
            discount: nailQtyTier.discount,
          },
        }
      : null,
    freeShipping: freeShipping
      ? {
          code: freeShipping.code,
          kind: 'free_shipping_above' as const,
          effect: {
            countryCode: freeShipping.countryCode,
            threshold: freeShipping.threshold,
            applied: freeShipping.applied,
            listFee: freeShipping.listFee,
            chargedFee: freeShipping.chargedFee,
          },
        }
      : null,
    forbidVoucher,
    rulesItemDiscount,
    shippingListFee: input.shippingListFee,
    shippingFee,
  };

  return {
    gifts,
    nailQtyTier,
    freeShipping,
    forbidVoucher,
    rulesItemDiscount,
    shippingListFee: input.shippingListFee,
    shippingFee,
    snapshot,
  };
}
