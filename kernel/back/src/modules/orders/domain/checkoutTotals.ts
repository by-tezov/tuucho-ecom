/**
 * How a checkout total is computed. The one statement of the rule.
 *
 * This used to live twice, inline, inside `priceAuthenticatedCheckout` and
 * `priceGuestCheckout`: the same arithmetic interleaved with the queries that
 * fetched its inputs, in two 450-line functions that were 250 lines identical.
 * A rule corrected in one and missed in the other was silent, and it decided
 * what a customer is charged.
 *
 * Nothing here reads a database, so the rule can be stated, read and tested on
 * its own. Callers gather the facts, in whatever way suits an account holder or
 * a guest, and hand them in.
 *
 * The order of operations is load-bearing and is the reason this is one place:
 *
 *   merchandise subtotal        customer-added lines only, rule gifts are free
 *   packet tier                 from nail quantity, smallest tier that fits
 *   shipping list fee           tier price for the delivery country
 *   cart rules                  may discount items and may waive shipping
 *   voucher                     applied to the subtotal *after* rule discounts
 *   loyalty                     applied last, to what is left
 */
import { roundMoney, shippingFeeForTier } from '../../commerce/domain/checkoutMoney.js';
import { packedNailQuantity } from './packetQuantity.js';
import { emptyCartRulesPricing, type CheckoutCartRulesState } from './checkoutQuote.js';

/** One priced line, reduced to what the totals actually depend on. */
export type PricedLine = {
  productId: string;
  productUid: string;
  productType: string;
  origin: 'user' | 'rule';
  ruleCode: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** How many nails a composed set holds. Absent on catalogue lines. */
  nailCount?: number;
};

/** A courier packet tier as stored, cheapest first. */
export type PacketTier = {
  packet_key: string;
  max_quantity: number;
  price: unknown;
  express_price: unknown;
};

/** Exactly the reasons this rule can refuse. Each is also a
 * `CheckoutFailureReason`, so a caller can return it unchanged. */
export type CheckoutTotalsFailure =
  'shipping_overflow' | 'voucher_forbidden_by_rule' | 'shipping_price_unavailable' | 'express_unavailable';

/** Everything decided before a voucher or loyalty can be priced. */
export type MerchandisePricing = {
  merchandiseSubtotal: number;
  totalQuantity: number;
  packetKey: string;
  shippingListFee: number;
  shippingFee: number;
  rulesItemDiscount: number;
  cartRules: CheckoutCartRulesState;
  /** The subtotal a voucher is measured against: merchandise less any
   * discount the cart rules already gave. A voucher never re-discounts what a
   * rule has already taken off. */
  voucherMerchandiseSubtotal: number;
};

export function priceMerchandiseAndShipping(input: {
  lines: PricedLine[];
  packetTiers: PacketTier[];
  countryCode: string;
  express: boolean;
}): { ok: true; pricing: MerchandisePricing } | { ok: false; reason: CheckoutTotalsFailure } {
  const merchandiseSubtotal = roundMoney(
    input.lines.filter((line) => line.origin !== 'rule').reduce((sum, line) => sum + line.lineTotal, 0),
  );

  // Packet size is never a customer choice. It is derived from customer-added
  // nail quantity (accessories count as zero), walking the courier's tiers
  // smallest-first and taking the first that fits. Exceeding every tier blocks
  // checkout outright: no auto-split, no silent largest-tier fallback.
  const totalQuantity = packedNailQuantity(
    input.lines.map((line) => ({
      origin: line.origin,
      product_type: line.productType,
      quantity: line.quantity,
    })),
  );
  const tier = input.packetTiers.find((candidate) => candidate.max_quantity >= totalQuantity);
  if (!tier) return { ok: false, reason: 'shipping_overflow' };

  const fee = shippingFeeForTier(tier.price, tier.express_price, input.express, input.countryCode);
  if (!fee.ok) return { ok: false, reason: fee.reason };

  const cartRules = emptyCartRulesPricing(fee.shippingListFee);

  return {
    ok: true,
    pricing: {
      merchandiseSubtotal,
      totalQuantity,
      packetKey: tier.packet_key,
      shippingListFee: fee.shippingListFee,
      shippingFee: cartRules.shippingFee,
      rulesItemDiscount: cartRules.rulesItemDiscount,
      cartRules,
      voucherMerchandiseSubtotal: merchandiseSubtotal,
    },
  };
}
