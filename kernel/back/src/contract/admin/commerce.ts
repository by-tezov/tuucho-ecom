/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/admin/commerce.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */

export type AdminCartRuleKind = 'gift_per_nail_set' | 'nail_qty_percent_tiers' | 'free_shipping_above';

export interface AdminCartRuleGiftParams {
  productUid: string;
  qtyPerNailSetUnit: number;
  /** A composed set counts as one gift unit from this many nails (1 to 10). */
  minNails: number;
}

export interface AdminCartRuleNailTierParams {
  tiers: Array<{ minQty: number; percent: number }>;
  /** A composed set counts as one tier unit from this many nails (1 to 10). */
  minNails: number;
}

export interface AdminCartRuleFreeShippingParams {
  thresholdsByCountry: Record<string, number>;
}

export type AdminCartRuleParams =
  | AdminCartRuleGiftParams
  | AdminCartRuleNailTierParams
  | AdminCartRuleFreeShippingParams
  | Record<string, unknown>;

export interface AdminCartRule {
  code: string;
  kind: AdminCartRuleKind | string;
  enabled: boolean;
  priority: number;
  forbidVoucher: boolean;
  params: AdminCartRuleParams;
}

export type AdminVoucherOfferType = 'percent' | 'amount' | 'free_shipping' | 'free_item' | 'free_item_nth';

export interface AdminVoucherRedemption {
  email: string | null;
  orderNumber: string;
  redeemedAt: string;
}

export interface AdminVoucher {
  code: string;
  enabled: boolean;
  quantity: number;
  maxUsesPerUser: number;
  minSubtotal: number | null;
  redeemedQuantity: number;
  heldQuantity: number;
  remainingQuantity: number;
  /** False after any redemption (including a cancelled order) or during an active checkout hold. */
  canDelete: boolean;
  startsAt: string;
  endsAt: string;
  allowedEmails: string[];
  redemptions: AdminVoucherRedemption[];
  offer: {
    type: AdminVoucherOfferType;
    percent?: number;
    amount?: number;
    requiredItemQuantity?: number;
    maxItemPrice?: number;
  };
}

export type AdminSpyKind =
  | 'account_created'
  | 'login'
  | 'email_changed'
  | 'account_deletion'
  | 'order_confirmation'
  | 'order_cancelled'
  | 'order_updated'
  | 'payment_failed'
  | 'payment_authorization_expired'
  | 'payment_authorization_expiring'
  | 'cart_abandoned'
  | 'product_request'
  | 'gift_created'
  | 'website_down'
  | 'website_restore_failed'
  | 'rate_limit_login'
  | 'rate_limit_auth'
  | 'rate_limit_contact_email'
  | 'rate_limit_refresh'
  | 'rate_limit_voucher'
  | 'rate_limit_checkout'
  | 'rate_limit_payment'
  | 'rate_limit_gallery'
  | 'rate_limit_ops'
  | 'rate_limit_otp_email'
  | 'rate_limit_email_confirmation'
  | 'rate_limit_email_change'
  | 'rate_limit_invoice_download'
  | 'rate_limit_invoice_email'
  | 'rate_limit_password_reset_email'
  | 'rate_limit_login_lockout';

export interface AdminPreferences {
  cronShipmentLogEnabled: boolean;
  cronAccountDeletionLogEnabled: boolean;
  cronGuestSavedCleanupLogEnabled: boolean;
  cronLoyaltyLogEnabled: boolean;
  cronGiftLogEnabled: boolean;
  cronGiftPurgeLogEnabled: boolean;
  cronPaymentAuthExpirySpyLogEnabled: boolean;
  cronWarmLogEnabled: boolean;
  apiLogEnabled: boolean;
  apiLogEnabledEffective: boolean;
  emailLogEnabled: boolean;
  contactEmailGuestEnabled: boolean;
  contactEmailConnectedEnabled: boolean;
  paymentCardEnabled: boolean;
  paymentPaypalEnabled: boolean;
  paymentBancontactEnabled: boolean;
  paymentGooglePayEnabled: boolean;
  paymentApplePayEnabled: boolean;
  signInGoogleEnabled: boolean;
  signInAppleEnabled: boolean;
  signInFacebookEnabled: boolean;
  facebookMobileDirectOAuthEnabled: boolean;
  signInGoogleVerboseEnabled: boolean;
  signInAppleVerboseEnabled: boolean;
  signInFacebookVerboseEnabled: boolean;
  outOfStockEnabled: boolean;
  outOfStockSizeRequestEnabled: boolean;
  spy: Record<AdminSpyKind, boolean>;
  paymentMethodCountries: {
    card: string[];
    paypal: string[];
    bancontact: string[];
    googlePay: string[];
    applePay: string[];
  };
  updatedAt: string | null;
}

export interface AdminShippingAddressCountry {
  code: string;
  label: string;
  enabled: boolean;
}

export interface AdminShippingCourierCountry {
  code: string;
  enabled: boolean;
}

export interface AdminShippingCourier {
  code: string;
  name: string;
  enabled: boolean;
  countries: AdminShippingCourierCountry[];
}

export interface AdminShippingCatalog {
  addressCountries: AdminShippingAddressCountry[];
  couriers: AdminShippingCourier[];
}
