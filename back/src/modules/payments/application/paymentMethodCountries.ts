import type { Pool } from 'pg';
import {
  getPaymentMethodCountriesSnapshot,
  patchPaymentMethodCountries,
  readPaymentMethodCountriesSnapshot,
  warmPaymentMethodCountries,
  invalidatePaymentMethodCountriesCache,
  type PaymentMethodCountriesMap,
  type PaymentMethodKey,
} from '../infrastructure/paymentMethodCountries.service.js';

export type { PaymentMethodCountriesMap, PaymentMethodKey };

export type PublicPaymentMethodCountries = {
  card: string[];
  paypal: string[];
  bancontact: string[];
  googlePay: string[];
  applePay: string[];
};

function toPublic(map: PaymentMethodCountriesMap): PublicPaymentMethodCountries {
  return {
    card: map.card,
    paypal: map.paypal,
    bancontact: map.bancontact,
    googlePay: map.google_pay,
    applePay: map.apple_pay,
  };
}

export async function warmPaymentMethodCountriesForCheckout(db: Pool): Promise<void> {
  await warmPaymentMethodCountries(db);
}

export function getPublicPaymentMethodCountriesSnapshot(): PublicPaymentMethodCountries {
  return toPublic(getPaymentMethodCountriesSnapshot());
}

export async function readPublicPaymentMethodCountries(db: Pool): Promise<PublicPaymentMethodCountries> {
  return toPublic(await readPaymentMethodCountriesSnapshot(db));
}

export async function patchPublicPaymentMethodCountries(
  db: Pool,
  patch: Partial<PublicPaymentMethodCountries>,
): Promise<PublicPaymentMethodCountries> {
  const mapped: Partial<PaymentMethodCountriesMap> = {};
  if (patch.card !== undefined) mapped.card = patch.card;
  if (patch.paypal !== undefined) mapped.paypal = patch.paypal;
  if (patch.bancontact !== undefined) mapped.bancontact = patch.bancontact;
  if (patch.googlePay !== undefined) mapped.google_pay = patch.googlePay;
  if (patch.applePay !== undefined) mapped.apple_pay = patch.applePay;
  return toPublic(await patchPaymentMethodCountries(db, mapped));
}

export { invalidatePaymentMethodCountriesCache as invalidatePaymentMethodCountries };
