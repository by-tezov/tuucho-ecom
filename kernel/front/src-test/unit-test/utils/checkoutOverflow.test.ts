import { describe, expect, it } from 'vitest';
import {
  checkoutChoicePlacement,
  countryListMatchesEffective,
  courierOverflowTier,
  isSelectedPaymentMethodStillValid,
  liveEffectiveCountries,
  paymentMethodOverflowTier,
  paymentOverflowKeyForSelection,
  shopMethodAllowedCountries,
  type PaymentMethodCountries,
} from '@/utils/checkoutOverflow';

describe('courier overflow', () => {
  it('keeps shop couriers primary when destination and geo are still unknown', () => {
    expect(courierOverflowTier(false, ['FR', 'BE'], [])).toBe('primary');
  });

  it('demotes Cacher opt-outs even before a destination exists', () => {
    expect(courierOverflowTier(true, ['FR', 'BE'], [])).toBe('overflow');
  });

  it('demotes couriers that do not serve the known destination', () => {
    expect(courierOverflowTier(false, ['FR', 'BE'], ['TH'])).toBe('overflow');
    expect(courierOverflowTier(false, ['FR', 'BE'], ['FR'])).toBe('primary');
  });

  it('keeps a hidden courier in the main list only while it is the current choice', () => {
    const hidden = courierOverflowTier(true, ['FR'], ['FR']);
    expect(hidden).toBe('overflow');
    expect(checkoutChoicePlacement(hidden, false)).toBe('overflow');
    expect(checkoutChoicePlacement(hidden, true)).toBe('list');
  });
});

describe('payment overflow', () => {
  it('still treats an unknown country as overflow for country-limited methods', () => {
    expect(paymentMethodOverflowTier(true, true, true, ['BE'], [])).toBe('overflow');
    expect(paymentMethodOverflowTier(true, true, true, ['ALL'], [])).toBe('primary');
  });

  it('puts a profile-hidden method in overflow unless it is the current choice', () => {
    const hidden = paymentMethodOverflowTier(true, false, true, ['ALL'], ['FR']);
    expect(hidden).toBe('overflow');
    expect(checkoutChoicePlacement(hidden, false)).toBe('overflow');
    expect(checkoutChoicePlacement(hidden, true)).toBe('list');
    expect(paymentMethodOverflowTier(false, false, true, ['ALL'], ['FR'])).toBe('hidden');
    expect(paymentMethodOverflowTier(true, false, false, ['ALL'], ['FR'])).toBe('hidden');
  });

  it('lets the live delivery country win over a stale geo snapshot', () => {
    expect(liveEffectiveCountries('BE', 'FR', ['FR'])).toEqual(['BE', 'FR']);
    expect(liveEffectiveCountries(undefined, undefined, ['FR'])).toEqual(['FR']);
  });
});

const shopAllOn = { card: true, paypal: true, bancontact: true, googlePay: true, applePay: true };
const prefsAllOn = {
  paypalEnabled: true,
  bancontactEnabled: true,
  googlePayEnabled: true,
  applePayEnabled: true,
  newCardEnabled: true,
};
const countries: PaymentMethodCountries = {
  card: ['FR', 'BE'],
  paypal: ['ALL'],
  bancontact: [],
  googlePay: ['ALL'],
  applePay: ['ALL'],
};


  it('puts new_card in overflow when the profile toggle is off, while saved cards stay primary', () => {
    const prefsOff = { ...prefsAllOn, newCardEnabled: false };
    expect(
      paymentOverflowKeyForSelection(
        'new_card',
        shopAllOn,
        prefsOff,
        { googlePay: true, applePay: true },
        countries,
        ['FR'],
      ),
    ).toBe('new_card');
    expect(
      isSelectedPaymentMethodStillValid(
        'new_card',
        shopAllOn,
        prefsOff,
        { googlePay: true, applePay: true },
        countries,
        ['FR'],
      ),
    ).toBe(true);
    expect(
      paymentOverflowKeyForSelection(
        'pm_saved',
        shopAllOn,
        prefsOff,
        { googlePay: true, applePay: true },
        countries,
        ['FR'],
      ),
    ).toBeNull();
  });

describe('country allowlists', () => {
  it('treats ALL as worldwide and an empty list as nowhere', () => {
    expect(countryListMatchesEffective(['all'], [])).toBe(true);
    expect(countryListMatchesEffective([], ['FR'])).toBe(false);
    expect(countryListMatchesEffective(['fr'], ['FR'])).toBe(true);
  });

  it('never reads an empty Bancontact list as worldwide', () => {
    expect(shopMethodAllowedCountries('bancontact', countries)).toEqual(['BE']);
  });
});

describe('selected payment method validity', () => {
  const wallets = { googlePay: true, applePay: false };

  it('keeps a wallet selection only while the shop and the device still offer it', () => {
    expect(
      isSelectedPaymentMethodStillValid('google_pay', shopAllOn, prefsAllOn, wallets, countries, ['FR']),
    ).toBe(true);
    expect(
      isSelectedPaymentMethodStillValid('apple_pay', shopAllOn, prefsAllOn, wallets, countries, ['FR']),
    ).toBe(false);
    expect(
      isSelectedPaymentMethodStillValid(
        'paypal',
        { ...shopAllOn, paypal: false },
        prefsAllOn,
        wallets,
        countries,
        ['FR'],
      ),
    ).toBe(false);
  });

  it('rejects a card for a destination the card allowlist does not serve', () => {
    expect(isSelectedPaymentMethodStillValid('pm_1', shopAllOn, prefsAllOn, wallets, countries, ['FR'])).toBe(
      true,
    );
    expect(isSelectedPaymentMethodStillValid('pm_1', shopAllOn, prefsAllOn, wallets, countries, ['TH'])).toBe(
      false,
    );
  });

  it('promotes a profile-hidden wallet only when that wallet is the current choice', () => {
    const hiddenGoogle = { ...prefsAllOn, googlePayEnabled: false };
    expect(
      paymentOverflowKeyForSelection('google_pay', shopAllOn, hiddenGoogle, wallets, countries, ['FR']),
    ).toBe('google_pay');
    expect(
      isSelectedPaymentMethodStillValid('google_pay', shopAllOn, hiddenGoogle, wallets, countries, ['FR']),
    ).toBe(true);
    expect(
      paymentOverflowKeyForSelection('paypal', shopAllOn, hiddenGoogle, wallets, countries, ['FR']),
    ).toBeNull();
  });

  it('promotes an out-of-country selection into the visible list by its overflow key', () => {
    expect(
      paymentOverflowKeyForSelection('bancontact', shopAllOn, prefsAllOn, wallets, countries, ['FR']),
    ).toBe('bancontact');
    expect(paymentOverflowKeyForSelection('pm_1', shopAllOn, prefsAllOn, wallets, countries, ['TH'])).toBe(
      'card',
    );
    expect(
      paymentOverflowKeyForSelection('paypal', shopAllOn, prefsAllOn, wallets, countries, ['TH']),
    ).toBeNull();
  });
});
