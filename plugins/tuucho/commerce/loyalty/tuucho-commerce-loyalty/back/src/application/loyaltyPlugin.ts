import type pg from 'pg';
import { isPluginEffectivelyEnabled } from '@kernel/back/modules/plugins/application/pluginStore';
import { buildLoyaltyPricingForCheckout, type LoyaltyPricingResult } from './loyalty.js';

export async function loyaltyCommerceEnabled(): Promise<boolean> {
  return isPluginEffectivelyEnabled('tuucho-commerce-loyalty');
}

export const LOYALTY_OFF_PRICING: LoyaltyPricingResult = {
  loyaltyCredit: 0,
  loyaltyEarn: 0,
  earnStatus: 'void',
  incompatibleWithVoucher: false,
};

export async function priceLoyaltyIfEnabled(
  client: pg.Pool | pg.PoolClient,
  params: Parameters<typeof buildLoyaltyPricingForCheckout>[1],
): Promise<LoyaltyPricingResult> {
  if (!(await loyaltyCommerceEnabled())) {
    return { ...LOYALTY_OFF_PRICING, incompatibleWithVoucher: Boolean(params.voucherOfferType) };
  }
  return buildLoyaltyPricingForCheckout(client, params);
}
