import type { ShopPaymentMethods } from '../api/checkout';
import {
  countryListMatchesEffective,
  liveEffectiveCountries,
  shopMethodAllowedCountries,
  type PaymentMethodCountries,
} from './checkoutOverflow';

export type AcceptedPaymentBrand =
  'visa' | 'mastercard' | 'apple_pay' | 'google_pay' | 'paypal' | 'bancontact';

/**
 * Which acceptance marks to show, in display order: a method appears when the
 * shop has it on and its country list covers where the visitor is (delivery
 * country when known, else the server's geo reading). That is the same
 * country rule the checkout uses to list a method, so Bancontact (Belgium by
 * default) only shows for a Belgian visitor or delivery.
 */
export function acceptedPaymentBrands(
  shop: ShopPaymentMethods,
  countries: PaymentMethodCountries,
  deliveryCountry: string | null | undefined,
  geoCountry: string | null | undefined,
): AcceptedPaymentBrand[] {
  const effective = liveEffectiveCountries(deliveryCountry, geoCountry);
  const offered = (method: Parameters<typeof shopMethodAllowedCountries>[0]) =>
    countryListMatchesEffective(shopMethodAllowedCountries(method, countries), effective);

  const brands: AcceptedPaymentBrand[] = [];
  if (shop.card && offered('card')) brands.push('visa', 'mastercard');
  if (shop.bancontact && offered('bancontact')) brands.push('bancontact');
  if (shop.applePay && offered('apple_pay')) brands.push('apple_pay');
  if (shop.googlePay && offered('google_pay')) brands.push('google_pay');
  if (shop.paypal && offered('paypal')) brands.push('paypal');
  return brands;
}
