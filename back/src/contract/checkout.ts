/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: pamsurin-back `src/contract/checkout.ts`.
 * Regenerate the front copy with `npm run sync:contract` in pamsurin-back.
 */
import type { PickupPoint } from './account.js';
import type { Lang } from './common.js';

export type CheckoutPaymentMethod =
  | 'paypal'
  | 'bancontact'
  | 'google_pay'
  | 'apple_pay'
  | 'new_card';

export interface CheckoutPrivacySessionStart {
  success: true;
  token: string;
  vaultKey: string;
  expiresAt: string;
  idleTimeoutMs: number;
  resumed: boolean;
  expired: boolean;
}

export interface CheckoutVoucher {
  code: string;
  itemDiscount: number;
  shippingDiscount: number;
  discount: number;
  offer: {
    type: 'percent' | 'amount' | 'free_shipping' | 'free_item' | 'free_item_nth';
    percent?: number;
    amount?: number;
    requiredItemQuantity?: number;
    maxItemPrice?: number;
  };
  freeItemQuantity?: number;
  /** Localized server-side from voucher/data-type.json. */
  description?: string;
}

// --- Guest checkout (unauthenticated — no account) ---
// No addressId/paymentMethodId here: a guest has no saved addresses/cards,
// so the full address and cart lines travel in the request body itself
// (see pamsurin-back's guestCheckout.routes.ts). Nothing about the attempt
// is persisted server-side beyond the resulting order.

export interface GuestCheckoutLine {
  productId: string;
  /** '' for accessories, same convention as CartItem. */
  shapeKey: string;
  lengthKey: string;
  size: string;
  packKey: string;
  quantity: number;
  /** Customer note typed on the cart card; omitted or null when none. */
  comment?: string | null;
}

export interface GuestCheckoutAddress {
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  deliveryNotes: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
  /** Same role as a saved address's own networkCodes/pickupPoints (e.g. a
   * Mondial Relay Point pick chosen via the picker) — a one-shot guest
   * address has no address_networks row for the server to derive this
   * from, so it travels with the request directly. */
  networkCodes: string[];
  pickupPoints: Record<string, PickupPoint>;
  label?: string | null;
  savedForFuture?: boolean;
}

/** Guest write shape for one composed set (server re-prices and rechecks offer). */
export interface GuestCheckoutComposition {
  id?: string;
  size: string;
  quantity: number;
  editing?: boolean;
  /** Customer note typed on the cart card; omitted or null when none. */
  comment?: string | null;
  nails: Array<{
    productId: string;
    shapeKey: string;
    lengthKey: string;
    finger: string;
  }>;
}

export interface GuestCheckoutRequest {
  items: GuestCheckoutLine[];
  /** Optional composed nail sets beside catalogue lines. */
  compositions?: GuestCheckoutComposition[];
  address: GuestCheckoutAddress;
  /** Omitted — not just falsy — means same-as-shipping. */
  billingAddress?: GuestCheckoutAddress;
  courierCode: string;
  express?: boolean;
  voucherCode?: string;
  email: string;
  consent: boolean;
  language: Lang;
  rememberCard?: boolean;
}

/** Customer cancel while confirmed + payment still authorized. */

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  /** From Stripe billing_details.name (our custom field above Payment
   * Element). Cards saved before name collection can still be null. */
  cardholderName: string | null;
  /** Guest-vault only — whether this card should become a saved method on
   * login merge (`registerCard` / attach). Omitted means saved (legacy). */
  savedForFuture?: boolean;
}

export type DefaultPaymentMethod =
  | { type: 'card'; id: string }
  | { type: 'paypal' }
  | { type: 'bancontact' }
  | { type: 'google_pay' }
  | { type: 'apple_pay' };

/** Shop-wide admin toggles — independent of the customer's own opt-outs. */
export type ShopPaymentMethods = {
  card: boolean;
  paypal: boolean;
  bancontact: boolean;
  googlePay: boolean;
  applePay: boolean;
};

export interface ShopSignInMethods {
  google: boolean;
  apple: boolean;
  facebook: boolean;
  facebookMobileDirectOAuthEnabled: boolean;
  googleVerbose: boolean;
  appleVerbose: boolean;
  facebookVerbose: boolean;
}

export interface CheckoutSelection {
  addressId: string | null;
  courierCode: string | null;
  express: boolean;
  billingAddressId: string | null;
  sameAsBilling: boolean;
  paymentMethodId: string | null;
  voucherCode: string | null;
  applyLoyalty?: boolean;
}
