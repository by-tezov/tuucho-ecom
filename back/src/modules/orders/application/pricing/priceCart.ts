import type pg from 'pg';
import type { PriceCheckoutResult } from './checkoutPricingTypes.js';
import { priceCheckout } from './priceAuthenticatedCheckout.js';

export async function priceCart(
  pool: pg.Pool,
  userId: string,
  addressId: string,
  courierCode: string,
  express: boolean,
  voucherCode?: string,
  billingAddressId?: string,
  applyLoyalty?: boolean,
  cartId?: string,
  excludeReservationId?: string,
): Promise<PriceCheckoutResult> {
  return priceCheckout(pool, {
    userId,
    addressId,
    courierCode,
    express,
    voucherCode,
    billingAddressId,
    checkAvailability: true,
    excludeUnavailable: true,
    applyLoyalty,
    cartId,
    excludeReservationId,
  });
}
