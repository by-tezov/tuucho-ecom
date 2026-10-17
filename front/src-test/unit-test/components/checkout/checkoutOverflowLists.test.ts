import { describe, expect, it } from 'vitest';
import type { Courier } from '../../../../src/api/contract/account';
import type { Strings } from '../../../../src/assets/i18n/types';
import { buildCourierOverflowOptions } from '../../../../src/components/cart/CartCourierSection';
import { buildPaymentOverflowOptions } from '../../../../src/components/checkout/CheckoutPaymentMethodList';
import type { PaymentMethodCountries } from '../../../../src/utils/checkoutOverflow';

const t = {
  paymentMethods: {
    googlePayDescription: 'Google Pay',
    applePayDescription: 'Apple Pay',
    paypalDescription: 'PayPal',
    bancontactDescription: 'Bancontact',
    newCardDescription: 'New card',
    secureDataNotice: 'secure',
  },
  cart: { overflowOptionCard: 'Card', overflowOptionNewCard: 'New card' },
} as unknown as Strings;

const shop = { card: true, paypal: true, bancontact: true, googlePay: true, applePay: true };
const countries: PaymentMethodCountries = {
  card: ['ALL'],
  paypal: ['ALL'],
  bancontact: ['BE'],
  googlePay: ['ALL'],
  applePay: ['ALL'],
};
const wallets = { googlePay: true, applePay: true, ready: true };

function paymentIds(googlePayEnabled: boolean, promoted: ReadonlySet<'google_pay'>) {
  return buildPaymentOverflowOptions(
    t,
    shop,
    countries,
    ['FR'],
    wallets,
    googlePayEnabled,
    true,
    true,
    true,
    true,
    false,
    [],
    promoted,
  ).map((option) => option.id);
}

function courier(code: string): Courier {
  return {
    code,
    name: code,
    sortOrder: 0,
    countries: ['FR'],
    networks: ['home'],
    packets: [],
  };
}

describe('cart overflow lists', () => {
  it('moves a profile-hidden payment into overflow unless it is the current choice', () => {
    expect(paymentIds(false, new Set())).toContain('google_pay');
    expect(paymentIds(false, new Set(['google_pay']))).not.toContain('google_pay');
    expect(paymentIds(true, new Set())).not.toContain('google_pay');
  });

  it('moves a hidden courier into overflow unless it is the current choice', () => {
    const colissimo = courier('colissimo');
    const listed = [colissimo, courier('mondial')];
    expect(buildCourierOverflowOptions(listed, ['colissimo'], ['FR'], new Set()).map((option) => option.id)).toEqual([
      'colissimo',
    ]);
    expect(
      buildCourierOverflowOptions(listed, ['colissimo'], ['FR'], new Set(['colissimo'])).map((option) => option.id),
    ).toEqual([]);
    expect(buildCourierOverflowOptions(listed, [], ['FR'], new Set()).map((option) => option.id)).toEqual([]);
  });
});
