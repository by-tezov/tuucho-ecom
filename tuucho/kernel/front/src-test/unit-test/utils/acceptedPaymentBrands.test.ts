import { describe, expect, it } from 'vitest';
import type { ShopPaymentMethods } from '@/api/checkout';
import { acceptedPaymentBrands } from '@/utils/acceptedPaymentBrands';
import type { PaymentMethodCountries } from '@/utils/checkoutOverflow';

const ALL_ON: ShopPaymentMethods = {
  card: true,
  paypal: true,
  bancontact: true,
  googlePay: true,
  applePay: true,
};

const DEFAULT_COUNTRIES: PaymentMethodCountries = {
  card: ['ALL'],
  paypal: ['ALL'],
  bancontact: ['BE'],
  googlePay: ['ALL'],
  applePay: ['ALL'],
};

describe('acceptedPaymentBrands', () => {
  it('leaves Bancontact out for a French visitor', () => {
    expect(acceptedPaymentBrands(ALL_ON, DEFAULT_COUNTRIES, null, 'FR')).toEqual([
      'visa',
      'mastercard',
      'apple_pay',
      'google_pay',
      'paypal',
    ]);
  });

  it('shows Bancontact when the visitor is located in Belgium', () => {
    expect(acceptedPaymentBrands(ALL_ON, DEFAULT_COUNTRIES, null, 'BE')).toContain('bancontact');
  });

  it('shows Bancontact for a Belgian delivery whatever the geo reading', () => {
    expect(acceptedPaymentBrands(ALL_ON, DEFAULT_COUNTRIES, 'BE', 'FR')).toContain('bancontact');
  });

  it('treats an empty Bancontact list as Belgium only, not worldwide', () => {
    const countries = { ...DEFAULT_COUNTRIES, bancontact: [] };
    expect(acceptedPaymentBrands(ALL_ON, countries, null, 'FR')).not.toContain('bancontact');
    expect(acceptedPaymentBrands(ALL_ON, countries, null, 'BE')).toContain('bancontact');
  });

  it('drops a method the shop switched off, even in its country', () => {
    const shop = { ...ALL_ON, bancontact: false, paypal: false };
    const brands = acceptedPaymentBrands(shop, DEFAULT_COUNTRIES, 'BE', null);
    expect(brands).not.toContain('bancontact');
    expect(brands).not.toContain('paypal');
  });

  it('shows no country-bound method when no country is known', () => {
    expect(acceptedPaymentBrands(ALL_ON, DEFAULT_COUNTRIES, null, null)).not.toContain('bancontact');
  });
});
