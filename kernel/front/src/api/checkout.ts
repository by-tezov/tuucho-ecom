/** Checkout intent, guest checkout and stored payment-method API. */
import { authHeaders, requestJson as request } from './client';
import type { Order } from './orders';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in kernel/back). Do not redeclare them here. */
import type {
  CheckoutPaymentMethod,
  CheckoutPrivacySessionStart,
  CheckoutSelection,
  CheckoutVoucher,
  DefaultPaymentMethod,
  GuestCheckoutAddress,
  GuestCheckoutLine,
  GuestCheckoutRequest,
  PaymentMethod,
  ShopPaymentMethods,
  ShopSignInMethods,
} from './contract/checkout';

export type {
  CheckoutPaymentMethod,
  CheckoutPrivacySessionStart,
  CheckoutSelection,
  CheckoutVoucher,
  DefaultPaymentMethod,
  GuestCheckoutAddress,
  GuestCheckoutLine,
  GuestCheckoutRequest,
  PaymentMethod,
  ShopPaymentMethods,
  ShopSignInMethods,
};

export { ApiError } from './errors';
export function startCheckoutPrivacySession(accessToken?: string): Promise<CheckoutPrivacySessionStart> {
  return request('/checkout/session/start', {
    method: 'POST',
    ...(accessToken ? { headers: authHeaders(accessToken) } : {}),
  });
}

export function touchCheckoutPrivacySession(
  accessToken?: string,
): Promise<{ success: true; expiresAt: string }> {
  return request('/checkout/session/touch', {
    method: 'POST',
    ...(accessToken ? { headers: authHeaders(accessToken) } : {}),
  });
}

export function registerCheckoutSessionPaymentMethod(
  paymentMethodId: string,
  accessToken?: string,
): Promise<{ success: true }> {
  return request('/checkout/session/payment-methods', {
    method: 'POST',
    ...(accessToken ? { headers: authHeaders(accessToken) } : {}),
    body: JSON.stringify({ paymentMethodId }),
  });
}

export function createCheckoutIntent(
  accessToken: string,
  addressId: string,
  courierCode: string,
  express: boolean,
  paymentMethod?: CheckoutPaymentMethod,
  voucherCode?: string,
  billingAddressId?: string,
  paymentMethodId?: string,
  applyLoyalty?: boolean,
): Promise<{
  success: true;
  clientSecret: string;
  /** Server-clock expiry of the stock/price/delivery reservation. */
  reservationExpiresAt: string;
  amount: number;
  voucher: CheckoutVoucher | null;
}> {
  return request('/account/checkout/create-intent', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      addressId,
      courierCode,
      express,
      method: paymentMethod,
      voucherCode,
      billingAddressId,
      paymentMethodId,
      ...(applyLoyalty === undefined ? {} : { applyLoyalty }),
    }),
  });
}

/** Explicitly confirms an order whose server-side voucher calculation leaves
 * nothing to pay. The API re-prices and refuses this path unless total is
 * exactly zero, so the browser cannot use it to bypass a real payment. */
export function completeFreeCheckout(
  accessToken: string,
  addressId: string,
  courierCode: string,
  express: boolean,
  voucherCode?: string,
  billingAddressId?: string,
  applyLoyalty?: boolean,
): Promise<{ success: true; order: Order }> {
  return request('/account/checkout/free', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      addressId,
      courierCode,
      express,
      voucherCode,
      billingAddressId,
      ...(applyLoyalty === undefined ? {} : { applyLoyalty }),
    }),
  });
}
/** Server-side voucher preview for the cart's current address, carrier and
 * contents. A successful response is still rechecked while creating the
 * payment intent, so no client-side preview can consume a stale quantity. */
export function validateCheckoutVoucher(
  accessToken: string,
  addressId: string,
  courierCode: string,
  express: boolean,
  code: string,
  billingAddressId?: string,
): Promise<{
  success: true;
  voucher: CheckoutVoucher;
  subtotal: number;
  shippingFee: number;
  shippingListFee?: number;
  rulesItemDiscount?: number;
  cartRules?: unknown;
  total: number;
}> {
  return request('/account/checkout/voucher/validate', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ addressId, courierCode, express, code, billingAddressId }),
  });
}

/** Called right after stripe.confirmPayment() resolves successfully — turns
 * the now-succeeded PaymentIntent into an actual order. Safe to call even
 * if the Stripe webhook already did this first (idempotent server-side). */
export function finalizeCheckout(
  accessToken: string,
  paymentIntentId: string,
): Promise<{ success: true; order: Order }> {
  return request('/account/checkout/finalize', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ paymentIntentId }),
  });
}

/** Releases a checkout hold after Stripe has server-verified a declined PI.
 * The API rejects any intent that is not owned by this customer and failed. */
export function releaseFailedCheckout(
  accessToken: string,
  paymentIntentId: string,
): Promise<{ success: true }> {
  return request('/account/checkout/release-failed', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ paymentIntentId }),
  });
}

/** Cancels an unconfirmed checkout intent and releases only its matching
 * stock/voucher reservation. It is intentionally unavailable once Stripe has
 * authorized or captured payment. */
export function cancelCheckout(accessToken: string, paymentIntentId: string): Promise<{ success: true }> {
  return request('/account/checkout/cancel', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ paymentIntentId }),
  });
}

/** Extends the stock hold behind an unconfirmed checkout intent to a full
 * reservation TTL from now, when the customer accepts the expiry warning
 * (RGAA 13.1). `409 reservation_not_extendable` once the hold is gone or has
 * used its extensions. */
export function extendCheckout(
  accessToken: string,
  paymentIntentId: string,
): Promise<{ success: true; reservationExpiresAt: string }> {
  return request('/account/checkout/extend', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ paymentIntentId }),
  });
}

function guestCheckoutBody(input: GuestCheckoutRequest): Record<string, unknown> {
  return {
    items: input.items,
    ...(input.extra != null ? { extra: input.extra } : {}),
    address: input.address,
    ...(input.billingAddress ? { billingAddress: input.billingAddress } : {}),
    courierCode: input.courierCode,
    express: input.express ?? false,
    ...(input.voucherCode ? { voucherCode: input.voucherCode } : {}),
    email: input.email,
    gdprConsent: { accepted: input.consent },
    language: input.language,
    ...(input.rememberCard ? { rememberCard: true } : {}),
  };
}

/** Guest voucher preview. A success is rechecked when the intent is created. */
export function validateGuestCheckoutVoucher(
  items: GuestCheckoutLine[],
  address: GuestCheckoutAddress,
  courierCode: string,
  express: boolean,
  code: string,
  billingAddress?: GuestCheckoutAddress,
): Promise<{
  success: true;
  voucher: CheckoutVoucher;
  subtotal: number;
  shippingFee: number;
  shippingListFee?: number;
  rulesItemDiscount?: number;
  cartRules?: unknown;
  total: number;
}> {
  return request('/checkout/guest/voucher/validate', {
    method: 'POST',
    body: JSON.stringify({
      items,
      address,
      ...(billingAddress ? { billingAddress } : {}),
      courierCode,
      express,
      code,
    }),
  });
}

/** Guest sibling of createCheckoutIntent. */
export function createGuestCheckoutIntent(
  input: GuestCheckoutRequest,
  paymentMethod?: CheckoutPaymentMethod,
  paymentMethodId?: string,
): Promise<{
  success: true;
  clientSecret: string;
  reservationExpiresAt: string;
  amount: number;
  voucher: CheckoutVoucher | null;
  subtotal: number;
  shippingListFee: number;
  shippingFee: number;
  rulesItemDiscount?: number;
  cartRules?: unknown;
}> {
  return request('/checkout/guest/create-intent', {
    method: 'POST',
    body: JSON.stringify({ ...guestCheckoutBody(input), method: paymentMethod, paymentMethodId }),
  });
}

/** Guest sibling of completeFreeCheckout. */
export function completeGuestFreeCheckout(
  input: GuestCheckoutRequest,
): Promise<{ success: true; order: Order }> {
  return request('/checkout/guest/free', {
    method: 'POST',
    body: JSON.stringify(guestCheckoutBody(input)),
  });
}

/** Records the pay-sheet remember choice before confirm. */
export function rememberGuestCheckoutCard(
  paymentIntentId: string,
  rememberCard: boolean,
): Promise<{ success: true }> {
  return request('/checkout/guest/remember-card', {
    method: 'POST',
    body: JSON.stringify({ paymentIntentId, rememberCard }),
  });
}

/** Guest sibling of finalizeCheckout. */
export function finalizeGuestCheckout(paymentIntentId: string): Promise<{ success: true; order: Order }> {
  return request('/checkout/guest/finalize', {
    method: 'POST',
    body: JSON.stringify({ paymentIntentId }),
  });
}

/** Guest sibling of cancelCheckout. */
export function cancelGuestCheckout(paymentIntentId: string): Promise<{ success: true }> {
  return request('/checkout/guest/cancel', {
    method: 'POST',
    body: JSON.stringify({ paymentIntentId }),
  });
}

/** Guest sibling of extendCheckout. */
export function extendGuestCheckout(
  paymentIntentId: string,
): Promise<{ success: true; reservationExpiresAt: string }> {
  return request('/checkout/guest/extend', {
    method: 'POST',
    body: JSON.stringify({ paymentIntentId }),
  });
}

/** Guest sibling of releaseFailedCheckout. */
export function releaseFailedGuestCheckout(paymentIntentId: string): Promise<{ success: true }> {
  return request('/checkout/guest/release-failed', {
    method: 'POST',
    body: JSON.stringify({ paymentIntentId }),
  });
}
export function listPaymentMethods(accessToken: string): Promise<{
  success: true;
  paymentMethods: PaymentMethod[];
  defaultPaymentMethod: DefaultPaymentMethod | null;
  paypalEnabled: boolean;
  bancontactEnabled: boolean;
  googlePayEnabled: boolean;
  applePayEnabled: boolean;
  newCardEnabled: boolean;
  shopPaymentMethods: ShopPaymentMethods;
}> {
  return request('/account/payment-methods', { headers: authHeaders(accessToken) });
}

/** Unauthenticated shop-wide payment flags for guest checkout. */
export function getShopPaymentMethods(deliveryCountry?: string): Promise<{
  success: true;
  shopPaymentMethods: ShopPaymentMethods;
  paymentMethodCountries: {
    card: string[];
    paypal: string[];
    bancontact: string[];
    googlePay: string[];
    applePay: string[];
  };
  countryContext: {
    deliveryCountry: string | null;
    geoCountry: string | null;
    effectiveCountries: string[];
  };
}> {
  const query =
    deliveryCountry && deliveryCountry.trim()
      ? `?deliveryCountry=${encodeURIComponent(deliveryCountry.trim())}`
      : '';
  return request(`/checkout/payment-methods${query}`);
}
/** Unauthenticated shop-wide third-party sign-in flags (pref ∧ server OAuth config). */
export function getShopSignInMethods(): Promise<{
  success: true;
  signInMethods: ShopSignInMethods;
}> {
  return request('/auth/sign-in-methods');
}

export function setDefaultPaymentMethod(
  accessToken: string,
  paymentMethod: DefaultPaymentMethod,
): Promise<{ success: true; defaultPaymentMethod: DefaultPaymentMethod }> {
  return request('/account/payment-methods/default', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(paymentMethod),
  });
}

/** Clicking the default badge — payment methods already treat "no default"
 * as a normal state, so this is just clearing it. */
export function unsetDefaultPaymentMethod(accessToken: string): Promise<{ success: true }> {
  return request('/account/payment-methods/unset-default', {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

/** Payment-methods page's PayPal card toggle — re-checked server-side at
 * checkout (see API.md), not just a client-side hint. */
export function setPaypalEnabled(
  accessToken: string,
  enabled: boolean,
): Promise<{ success: true; paypalEnabled: boolean }> {
  return request('/account/payment-methods/paypal-enabled', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ enabled }),
  });
}

/** Same opt-out shape as PayPal for the Bancontact preference row. */
export function setBancontactEnabled(
  accessToken: string,
  enabled: boolean,
): Promise<{ success: true; bancontactEnabled: boolean }> {
  return request('/account/payment-methods/bancontact-enabled', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ enabled }),
  });
}

/** Same opt-out shape as PayPal for the Google Pay preference row. */
export function setGooglePayEnabled(
  accessToken: string,
  enabled: boolean,
): Promise<{ success: true; googlePayEnabled: boolean }> {
  return request('/account/payment-methods/google-pay-enabled', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ enabled }),
  });
}

/** Same opt-out shape as PayPal for the Apple Pay preference row. */
export function setApplePayEnabled(
  accessToken: string,
  enabled: boolean,
): Promise<{ success: true; applePayEnabled: boolean }> {
  return request('/account/payment-methods/apple-pay-enabled', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ enabled }),
  });
}

/** Cart "Nouvelle carte" row only — remembered cards stay listed. */
export function setNewCardEnabled(
  accessToken: string,
  enabled: boolean,
): Promise<{ success: true; newCardEnabled: boolean }> {
  return request('/account/payment-methods/new-card-enabled', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ enabled }),
  });
}

/** Client secret for a plain SetupIntent — no charge involved until the
 * customer pays; remember vs one-time is applied via registerPaymentMethod. */
export function createSetupIntent(accessToken: string): Promise<{ success: true; clientSecret: string }> {
  return request('/account/payment-methods/setup-intent', {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

/** Syncs fingerprint dedupe / one_time vs saved after SetupIntent confirm. */
export function registerPaymentMethod(
  accessToken: string,
  paymentMethodId: string,
  savedForFuture: boolean,
): Promise<{ success: true; paymentMethod: PaymentMethod; savedForFuture: boolean }> {
  return request('/account/payment-methods/register', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ paymentMethodId, savedForFuture }),
  });
}

/** One-time cards omitted from the saved list, for the checkout session. */
export function getPaymentMethod(
  accessToken: string,
  id: string,
): Promise<{ success: true; paymentMethod: PaymentMethod }> {
  return request(`/account/payment-methods/${id}`, { headers: authHeaders(accessToken) });
}

/** Attaches a signed-out card on merge-on-login. `savedForFuture` defaults to true. */
export function attachPaymentMethod(
  accessToken: string,
  paymentMethodId: string,
  savedForFuture?: boolean,
): Promise<{ success: true; paymentMethod: PaymentMethod }> {
  return request('/account/payment-methods/attach', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      paymentMethodId,
      ...(savedForFuture === undefined ? {} : { savedForFuture }),
    }),
  });
}
/** Restores the cart delivery choice after a full remount. */
export function getCheckoutSelection(accessToken: string): Promise<{ success: true } & CheckoutSelection> {
  return request('/account/checkout/selection', { headers: authHeaders(accessToken) });
}

/** `signal` cancels a superseded selection write so an older response cannot win. */
export function setCheckoutSelection(
  accessToken: string,
  selection: CheckoutSelection,
  signal?: AbortSignal,
): Promise<{ success: true } & CheckoutSelection> {
  return request('/account/checkout/selection', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(selection),
    ...(signal ? { signal } : {}),
  });
}

export function deletePaymentMethod(
  accessToken: string,
  id: string,
): Promise<{ success: true; deleted: true }> {
  return request(`/account/payment-methods/${id}`, { method: 'DELETE', headers: authHeaders(accessToken) });
}
