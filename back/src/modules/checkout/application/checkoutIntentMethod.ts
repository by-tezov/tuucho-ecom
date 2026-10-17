import type { CheckoutPaymentMethod } from '../../payments/application/paymentPreferences.js';
import type { ShopPaymentMethod } from '../../settings/application/appPreferences.js';

/** Shared create-intent branching for account and guest checkout. */
export function resolveCheckoutIntentMethod(checkoutMethod: CheckoutPaymentMethod | undefined): {
  isWalletMethod: boolean;
  isPaypalMethod: boolean;
  isBancontactMethod: boolean;
  isNewCardMethod: boolean;
  paymentMethodTypes: string[] | undefined;
  shopMethod: ShopPaymentMethod;
  /** Saved-card path needs a pm_…; wallets / PayPal / Bancontact / new_card do not. */
  requiresPaymentMethodId: boolean;
  setupFutureUsage: boolean;
} {
  const isWalletMethod = checkoutMethod === 'google_pay' || checkoutMethod === 'apple_pay';
  const isPaypalMethod = checkoutMethod === 'paypal';
  const isBancontactMethod = checkoutMethod === 'bancontact';
  const isNewCardMethod = checkoutMethod === 'new_card';
  const paymentMethodTypes = isPaypalMethod
    ? ['paypal']
    : isBancontactMethod
      ? ['bancontact']
      : isNewCardMethod
        ? ['card']
        : undefined;
  const shopMethod: ShopPaymentMethod = isPaypalMethod
    ? 'paypal'
    : isBancontactMethod
      ? 'bancontact'
      : checkoutMethod === 'google_pay'
        ? 'google_pay'
        : checkoutMethod === 'apple_pay'
          ? 'apple_pay'
          : 'card';
  return {
    isWalletMethod,
    isPaypalMethod,
    isBancontactMethod,
    isNewCardMethod,
    paymentMethodTypes,
    shopMethod,
    requiresPaymentMethodId: !isPaypalMethod && !isBancontactMethod && !isWalletMethod && !isNewCardMethod,
    setupFutureUsage: isNewCardMethod,
  };
}
