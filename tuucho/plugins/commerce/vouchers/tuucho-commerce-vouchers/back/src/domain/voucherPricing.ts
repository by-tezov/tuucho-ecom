import type { VoucherDesiredState, VoucherRow } from './voucherTypes.js';

/** What a voucher is worth on one basket. Pure: no database, no clock. */
type VoucherItemType = 'nail' | 'accessory';

export interface VoucherPricingInput {
  subtotal: number;
  shippingFee: number;
  totalQuantity: number;
  itemUnitPrices: { unitPrice: number; quantity: number; productType: VoucherItemType }[];
}

const nailUnitPrices = ({ itemUnitPrices }: VoucherPricingInput) =>
  itemUnitPrices.filter((item) => item.productType !== 'accessory' && item.quantity > 0);

export interface AppliedVoucher {
  code: string;
  itemDiscount: number;
  shippingDiscount: number;
  discount: number;
  offer: VoucherDesiredState['offer'];
  /** Number of nail-set units covered by a free-item offer in this cart. */
  freeItemQuantity?: number;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function offerFromRow(row: VoucherRow): VoucherDesiredState['offer'] {
  if (row.offer_type === 'percent') return { type: 'percent', percent: Number(row.percent) };
  if (row.offer_type === 'amount') return { type: 'amount', amount: Number(row.amount) };
  if (row.offer_type === 'free_item') return { type: 'free_item', maxItemPrice: Number(row.max_item_price) };
  if (row.offer_type === 'free_item_nth') {
    return { type: 'free_item_nth', requiredItemQuantity: row.required_item_quantity! };
  }
  return { type: 'free_shipping' };
}

export function calculateVoucher(row: VoucherRow, input: VoucherPricingInput): AppliedVoucher | undefined {
  if (
    row.min_subtotal != null &&
    (row.offer_type === 'amount' || row.offer_type === 'free_shipping') &&
    input.subtotal < Number(row.min_subtotal)
  ) {
    return undefined;
  }
  let itemDiscount = 0;
  let shippingDiscount = 0;
  let freeItemQuantity: number | undefined;
  if (row.offer_type === 'percent') {
    // A percentage applies to the complete checkout, merchandise and
    // delivery alike — same total-price basis as `amount`, just expressed
    // as a rate instead of a fixed sum.
    const rate = Number(row.percent) / 100;
    itemDiscount = round2(input.subtotal * rate);
    shippingDiscount = round2(input.shippingFee * rate);
  } else if (row.offer_type === 'amount') {
    // A fixed amount is applied to the complete checkout, in its natural
    // order: merchandise first, then delivery.  Both portions are capped so
    // it can never make either value, or the final order, negative.
    let remainingAmount = Number(row.amount);
    itemDiscount = Math.min(input.subtotal, remainingAmount);
    remainingAmount -= itemDiscount;
    shippingDiscount = Math.min(input.shippingFee, remainingAmount);
  } else if (row.offer_type === 'free_shipping') shippingDiscount = input.shippingFee;
  else if (row.offer_type === 'free_item_nth') {
    const nails = nailUnitPrices(input);
    const nailQty = nails.reduce((sum, item) => sum + item.quantity, 0);
    const freeItems = Math.floor(nailQty / ((row.required_item_quantity ?? 0) + 1));
    if (freeItems <= 0) return undefined;
    freeItemQuantity = freeItems;
    let remaining = freeItems;
    for (const item of [...nails].sort((a, b) => a.unitPrice - b.unitPrice)) {
      const used = Math.min(remaining, item.quantity);
      itemDiscount += used * item.unitPrice;
      remaining -= used;
      if (remaining === 0) break;
    }
  } else if (row.offer_type === 'free_item') {
    const maxPrice = Number(row.max_item_price);
    const eligible = nailUnitPrices(input).filter((item) => item.unitPrice <= maxPrice);
    if (eligible.length === 0) return undefined;
    itemDiscount = Math.max(...eligible.map((item) => item.unitPrice));
    freeItemQuantity = 1;
  } else {
    return undefined;
  }
  itemDiscount = round2(Math.min(itemDiscount, input.subtotal));
  shippingDiscount = round2(Math.min(shippingDiscount, input.shippingFee));
  return {
    code: row.code,
    itemDiscount,
    shippingDiscount,
    discount: round2(itemDiscount + shippingDiscount),
    offer: offerFromRow(row),
    ...(freeItemQuantity ? { freeItemQuantity } : {}),
  };
}
