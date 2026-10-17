import { useEffect, useSyncExternalStore } from 'react';
import { getShopPaymentMethods, type ShopPaymentMethods } from '../api/checkout';
import type { PaymentMethodCountries } from '../utils/checkoutOverflow';

/**
 * The shop-wide payment gates (`GET /checkout/payment-methods`), loaded once
 * per page load for the "accepted payment methods" marks in the footer and
 * under the cart's pay button. Those marks must follow the admin switches and
 * country lists: a logo for a method the shop has turned off, or does not
 * offer where the visitor is, would be a false promise.
 *
 * Loaded without a delivery country, so `geoCountry` is the server's reading
 * of the request; the cart adds its delivery country on top.
 *
 * A failed load leaves the cache empty (no marks shown) and lets the next
 * consumer mount retry.
 */
export type AcceptedPaymentMethods = {
  shop: ShopPaymentMethods;
  countries: PaymentMethodCountries;
  geoCountry: string | null;
};

let cached: AcceptedPaymentMethods | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load(): void {
  if (cached || inflight) return;
  inflight = getShopPaymentMethods()
    .then((result) => {
      cached = {
        shop: result.shopPaymentMethods,
        countries: result.paymentMethodCountries,
        geoCountry: result.countryContext.geoCountry,
      };
      for (const listener of listeners) listener();
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
}

export function useAcceptedPaymentMethods(): AcceptedPaymentMethods | null {
  const methods = useSyncExternalStore(
    subscribe,
    () => cached,
    () => null,
  );
  useEffect(load, []);
  return methods;
}
