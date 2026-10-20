/**
 * The preference vocabulary: every key the shop stores, what it defaults to
 * when the row is absent, and how a stored value is read back.
 *
 * Separated from the cache and from the public API because these are the parts
 * that change when a preference is added, and they are worth reading on their
 * own.
 */
import { config } from '../../../config/env.js';
import { pluginSettingBool } from '../../plugins/application/pluginSettingValues.js';
import { isSpyKind, SPY_KINDS, type SpyKind } from '../domain/spyKinds.js';

export { isSpyKind, SPY_KINDS, type SpyKind };

export type ShopPaymentMethod = 'card' | 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay';

export type ShopSignInMethod = 'google' | 'facebook' | 'apple';

export type AppPreferenceKey =
  | 'cron_shipment_log_enabled'
  | 'cron_account_deletion_log_enabled'
  | 'cron_guest_saved_cleanup_log_enabled'
  | 'cron_loyalty_log_enabled'
  | 'cron_gift_log_enabled'
  | 'cron_gift_purge_log_enabled'
  | 'cron_payment_auth_expiry_spy_log_enabled'
  | 'cron_warm_log_enabled'
  | 'api_log_enabled'
  | 'email_log_enabled'
  | 'contact_email_guest_enabled'
  | 'contact_email_connected_enabled'
  | 'payment_card_enabled'
  | 'payment_paypal_enabled'
  | 'payment_bancontact_enabled'
  | 'payment_google_pay_enabled'
  | 'payment_apple_pay_enabled'
  | 'sign_in_google_enabled'
  | 'sign_in_facebook_enabled'
  | 'sign_in_apple_enabled'
  | 'facebook_mobile_direct_oauth_enabled'
  | 'sign_in_google_verbose_enabled'
  | 'sign_in_facebook_verbose_enabled'
  | 'sign_in_apple_verbose_enabled'
  | 'out_of_stock_enabled'
  | 'out_of_stock_size_request_enabled'
  | 'relax_rate_limits'
  | `spy.${SpyKind}`;

export type ShopPaymentMethodsSnapshot = {
  card: boolean;
  paypal: boolean;
  bancontact: boolean;
  googlePay: boolean;
  applePay: boolean;
};

export type ShopSignInMethodsSnapshot = {
  google: boolean;
  facebook: boolean;
  apple: boolean;
  /** Public mobile Facebook flow selector; desktop always uses FB.login. */
  facebookMobileDirectOAuthEnabled: boolean;
  /** Per-provider: unknown social email → create vs link instead of silent create. */
  googleVerbose: boolean;
  facebookVerbose: boolean;
  appleVerbose: boolean;
};

export type AppPreferencesSnapshot = {
  /** Whether the shipment cron writes its detailed result to the private log.
   * Processing always runs regardless of this flag. */
  cronShipmentLogEnabled: boolean;
  cronAccountDeletionLogEnabled: boolean;
  cronGuestSavedCleanupLogEnabled: boolean;
  cronLoyaltyLogEnabled: boolean;
  cronGiftLogEnabled: boolean;
  cronGiftPurgeLogEnabled: boolean;
  cronPaymentAuthExpirySpyLogEnabled: boolean;
  cronWarmLogEnabled: boolean;
  apiLogEnabled: boolean;
  /** Effective value: always false on prod regardless of stored preference. */
  apiLogEnabledEffective: boolean;
  /** Sent-mail journal. Production anonymises personal data instead of refusing to write. */
  emailLogEnabled: boolean;
  /** Owner notify for the anonymous contact form. */
  contactEmailGuestEnabled: boolean;
  /** Owner notify for authenticated account chat messages. */
  contactEmailConnectedEnabled: boolean;
  /** Shop-wide payment method availability (admin must enable each explicitly). */
  paymentCardEnabled: boolean;
  paymentPaypalEnabled: boolean;
  paymentBancontactEnabled: boolean;
  paymentGooglePayEnabled: boolean;
  paymentApplePayEnabled: boolean;
  /** Shop-wide third-party sign-in (admin / OPS; email+OTP always on). */
  signInGoogleEnabled: boolean;
  signInFacebookEnabled: boolean;
  signInAppleEnabled: boolean;
  /** Mobile Facebook Login: direct web OAuth when true, JS SDK FB.login when false. */
  facebookMobileDirectOAuthEnabled: boolean;
  /** Per-provider create-vs-link step for unknown social emails (admin). */
  signInGoogleVerboseEnabled: boolean;
  signInFacebookVerboseEnabled: boolean;
  signInAppleVerboseEnabled: boolean;
  /** When false, sold-out nail sets are omitted from gallery browsing,
   * featured, product pages, and the sitemap. Cart hydration by id still
   * returns them so an already-added line can show the out-of-stock notice. */
  outOfStockEnabled: boolean;
  /** When false, barred size chips stay visible but clicks do nothing. */
  outOfStockSizeRequestEnabled: boolean;
  spy: Record<SpyKind, boolean>;
  updatedAt: string | null;
};

export function spyKey(kind: SpyKind): AppPreferenceKey {
  return `spy.${kind}`;
}

export function defaultForKey(key: AppPreferenceKey): boolean {
  if (key === 'api_log_enabled') return config.apiLog.enabled;
  if (key === 'email_log_enabled') return config.emailLog.enabled;
  if (
    key === 'cron_shipment_log_enabled' ||
    key === 'cron_account_deletion_log_enabled' ||
    key === 'cron_guest_saved_cleanup_log_enabled' ||
    key === 'cron_loyalty_log_enabled' ||
    key === 'cron_gift_log_enabled' ||
    key === 'cron_gift_purge_log_enabled' ||
    key === 'cron_payment_auth_expiry_spy_log_enabled' ||
    key === 'cron_warm_log_enabled' ||
    key === 'contact_email_guest_enabled' ||
    key === 'contact_email_connected_enabled' ||
    key === 'facebook_mobile_direct_oauth_enabled' ||
    key === 'out_of_stock_enabled' ||
    key === 'out_of_stock_size_request_enabled'
  ) {
    return true;
  }
  if (
    key === 'payment_card_enabled' ||
    key === 'payment_paypal_enabled' ||
    key === 'payment_bancontact_enabled' ||
    key === 'payment_google_pay_enabled' ||
    key === 'payment_apple_pay_enabled' ||
    key === 'sign_in_google_enabled' ||
    key === 'sign_in_facebook_enabled' ||
    key === 'sign_in_apple_enabled' ||
    key === 'sign_in_google_verbose_enabled' ||
    key === 'sign_in_facebook_verbose_enabled' ||
    key === 'sign_in_apple_verbose_enabled'
  ) {
    return false;
  }
  if (key === 'relax_rate_limits') return false;
  return !pluginSettingBool('tuucho-mail-spy', 'disableEmail');
}

export function allKeys(): AppPreferenceKey[] {
  return [
    'cron_shipment_log_enabled',
    'cron_account_deletion_log_enabled',
    'cron_guest_saved_cleanup_log_enabled',
    'cron_loyalty_log_enabled',
    'cron_gift_log_enabled',
    'cron_gift_purge_log_enabled',
    'cron_payment_auth_expiry_spy_log_enabled',
    'cron_warm_log_enabled',
    'api_log_enabled',
    'email_log_enabled',
    'contact_email_guest_enabled',
    'contact_email_connected_enabled',
    'payment_card_enabled',
    'payment_paypal_enabled',
    'payment_bancontact_enabled',
    'payment_google_pay_enabled',
    'payment_apple_pay_enabled',
    'sign_in_google_enabled',
    'sign_in_facebook_enabled',
    'sign_in_apple_enabled',
    'facebook_mobile_direct_oauth_enabled',
    'sign_in_google_verbose_enabled',
    'sign_in_facebook_verbose_enabled',
    'sign_in_apple_verbose_enabled',
    'out_of_stock_enabled',
    'out_of_stock_size_request_enabled',
    'relax_rate_limits',
    ...SPY_KINDS.map(spyKey),
  ];
}

export function shopPaymentKey(method: ShopPaymentMethod): AppPreferenceKey {
  if (method === 'card') return 'payment_card_enabled';
  if (method === 'paypal') return 'payment_paypal_enabled';
  if (method === 'bancontact') return 'payment_bancontact_enabled';
  if (method === 'google_pay') return 'payment_google_pay_enabled';
  return 'payment_apple_pay_enabled';
}

export function shopSignInKey(method: ShopSignInMethod): AppPreferenceKey {
  if (method === 'google') return 'sign_in_google_enabled';
  if (method === 'facebook') return 'sign_in_facebook_enabled';
  return 'sign_in_apple_enabled';
}

export function shopSignInVerboseKey(method: ShopSignInMethod): AppPreferenceKey {
  if (method === 'google') return 'sign_in_google_verbose_enabled';
  if (method === 'facebook') return 'sign_in_facebook_verbose_enabled';
  return 'sign_in_apple_verbose_enabled';
}

export function parseBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && 'enabled' in value) {
    const enabled = (value as { enabled: unknown }).enabled;
    if (typeof enabled === 'boolean') return enabled;
  }
  return undefined;
}
