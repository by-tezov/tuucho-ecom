import type { CheckoutCartRulesState, CheckoutQuote, CheckoutVoucher } from '@tuucho/plugin-sdk';

export type { CheckoutCartRulesState, CheckoutQuote, CheckoutVoucher };

export function emptyCartRulesPricing(shippingListFee: number): CheckoutCartRulesState {
  return {
    gifts: [],
    nailQtyTier: null,
    freeShipping: null,
    forbidVoucher: false,
    rulesItemDiscount: 0,
    shippingListFee,
    shippingFee: shippingListFee,
    snapshot: {},
  };
}
