/**
 * The public preference API: typed readers, snapshots, and the admin patch.
 *
 * The vocabulary lives in `preferenceKeys.ts` and the cross-process cache in
 * `preferenceCache.ts`.
 */
import type { Pool } from 'pg';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { isSpyKind, SPY_KINDS, type SpyKind } from '../domain/spyKinds.js';
import {
  defaultForKey,
  parseBool,
  shopPaymentKey,
  shopSignInKey,
  shopSignInVerboseKey,
  spyKey,
  type AppPreferenceKey,
  type AppPreferencesSnapshot,
  type ShopPaymentMethod,
  type ShopPaymentMethodsSnapshot,
  type ShopSignInMethod,
  type ShopSignInMethodsSnapshot,
} from './preferenceKeys.js';
import {
  cachedPreferencesUpdatedAt,
  ensureLoaded,
  readBool,
  reloadPreferences,
  warmAppPreferences,
} from './preferenceCache.js';
import { isRuntimePluginEnabled } from '../../plugins/application/runtimeEnabledPlugins.js';

export { isSpyKind, SPY_KINDS, type SpyKind };
export { warmAppPreferences, reloadPreferences };
export type {
  AppPreferenceKey,
  AppPreferencesSnapshot,
  ShopPaymentMethod,
  ShopPaymentMethodsSnapshot,
  ShopSignInMethod,
  ShopSignInMethodsSnapshot,
};

/** When false, the shipment cron still processes; the private cron log stays quiet. */
export function isCronShipmentLogPreferenceEnabled(): boolean {
  return isRuntimePluginEnabled('tuucho-shipping-expedition-cron') && readBool('cron_shipment_log_enabled');
}

export function isCronAccountDeletionLogPreferenceEnabled(): boolean {
  return readBool('cron_account_deletion_log_enabled');
}

export function isCronGuestSavedCleanupLogPreferenceEnabled(): boolean {
  return readBool('cron_guest_saved_cleanup_log_enabled');
}

export function isCronLoyaltyLogPreferenceEnabled(): boolean {
  return isRuntimePluginEnabled('tuucho-commerce-loyalty') && readBool('cron_loyalty_log_enabled');
}

export function isCronGiftLogPreferenceEnabled(): boolean {
  return isRuntimePluginEnabled('tuucho-commerce-gift') && readBool('cron_gift_log_enabled');
}

export function isCronGiftPurgeLogPreferenceEnabled(): boolean {
  return isRuntimePluginEnabled('tuucho-commerce-gift') && readBool('cron_gift_purge_log_enabled');
}

/** When false, the payment-authorization-expiry-spy cron still processes;
 * the private cron log stays quiet. */
export function isCronPaymentAuthExpirySpyLogPreferenceEnabled(): boolean {
  return isRuntimePluginEnabled('tuucho-payment-stripe') && readBool('cron_payment_auth_expiry_spy_log_enabled');
}

/** When false, the keep-warm cron still probes and restores; the private
 * failure-path log stays unreadable remotely. */
export function isCronWarmLogPreferenceEnabled(): boolean {
  return readBool('cron_warm_log_enabled');
}

export function isApiLogPreferenceEnabled(): boolean {
  return isRuntimePluginEnabled('tuucho-journal-admin') && readBool('api_log_enabled');
}

export function isEmailLogPreferenceEnabled(): boolean {
  return isRuntimePluginEnabled('tuucho-journal-email') && readBool('email_log_enabled');
}

/** Preprod test harness: skip HTTP rate limiters. Prod is always false. */
export function isRelaxRateLimitsEnabledSync(): boolean {
  if (config.target === 'prod') return false;
  const overlay = process.env.TUUCHO_TEST_RELAX_RATE_LIMIT?.trim().toLowerCase();
  if (overlay === '1' || overlay === 'true') return true;
  return readBool('relax_rate_limits');
}

/** Same as `isRelaxRateLimitsEnabledSync` after a cross-process refresh. */
export async function isHttpRateLimitRelaxed(): Promise<boolean> {
  if (config.target === 'prod') return false;
  const overlay = process.env.TUUCHO_TEST_RELAX_RATE_LIMIT?.trim().toLowerCase();
  if (overlay === '1' || overlay === 'true') return true;
  await warmAppPreferences();
  return isRelaxRateLimitsEnabledSync();
}

export function isContactEmailGuestEnabled(): boolean {
  return isRuntimePluginEnabled('tuucho-contact') && readBool('contact_email_guest_enabled');
}

export function isContactEmailConnectedEnabled(): boolean {
  return isRuntimePluginEnabled('tuucho-contact') && readBool('contact_email_connected_enabled');
}

export function isSpyKindEnabled(kind: SpyKind): boolean {
  return isRuntimePluginEnabled('tuucho-mail-spy') && readBool(spyKey(kind));
}

/** Shop-wide payment method gate (admin preference). Sync after warm. */
export function isShopPaymentMethodEnabled(method: ShopPaymentMethod): boolean {
  return isRuntimePluginEnabled('tuucho-payment-stripe') && readBool(shopPaymentKey(method));
}

export function isOutOfStockEnabled(): boolean {
  return readBool('out_of_stock_enabled');
}
export function isOutOfStockSizeRequestEnabled(): boolean {
  return readBool('out_of_stock_size_request_enabled');
}

export function getShopPaymentMethodsSnapshot(): ShopPaymentMethodsSnapshot {
  return {
    card: isShopPaymentMethodEnabled('card'),
    paypal: isShopPaymentMethodEnabled('paypal'),
    bancontact: isShopPaymentMethodEnabled('bancontact'),
    googlePay: isShopPaymentMethodEnabled('google_pay'),
    applePay: isShopPaymentMethodEnabled('apple_pay'),
  };
}

/** Read the shop-wide gates without warming the preference cache. Operations
 * `check` uses this so inspecting a fresh target cannot seed missing rows. */
export async function readShopPaymentMethodsSnapshot(db: Pool = pool): Promise<ShopPaymentMethodsSnapshot> {
  const { rows } = await db.query<{ key: AppPreferenceKey; value: unknown }>(
    `select key, value
     from app_preferences
     where key = any($1::text[])`,
    [
      [
        'payment_card_enabled',
        'payment_paypal_enabled',
        'payment_bancontact_enabled',
        'payment_google_pay_enabled',
        'payment_apple_pay_enabled',
      ],
    ],
  );
  const values = new Map<string, boolean>();
  for (const row of rows) {
    const value = parseBool(row.value);
    if (value !== undefined) values.set(row.key, value);
  }
  return {
    card: values.get('payment_card_enabled') ?? defaultForKey('payment_card_enabled'),
    paypal: values.get('payment_paypal_enabled') ?? defaultForKey('payment_paypal_enabled'),
    bancontact: values.get('payment_bancontact_enabled') ?? defaultForKey('payment_bancontact_enabled'),
    googlePay: values.get('payment_google_pay_enabled') ?? defaultForKey('payment_google_pay_enabled'),
    applePay: values.get('payment_apple_pay_enabled') ?? defaultForKey('payment_apple_pay_enabled'),
  };
}

/** Shop-wide third-party sign-in gate (admin preference). Sync after warm. */
const SIGN_IN_PLUGIN: Record<ShopSignInMethod, string> = {
  google: 'tuucho-signin-google',
  facebook: 'tuucho-signin-facebook',
  apple: 'tuucho-signin-apple',
};

export function isShopSignInMethodEnabled(method: ShopSignInMethod): boolean {
  return isRuntimePluginEnabled(SIGN_IN_PLUGIN[method]) && readBool(shopSignInKey(method));
}

export function isShopSignInVerboseEnabled(method: ShopSignInMethod): boolean {
  return isShopSignInMethodEnabled(method) && readBool(shopSignInVerboseKey(method));
}

export function getShopSignInMethodsSnapshot(): ShopSignInMethodsSnapshot {
  return {
    google: isShopSignInMethodEnabled('google'),
    facebook: isShopSignInMethodEnabled('facebook'),
    apple: isShopSignInMethodEnabled('apple'),
    facebookMobileDirectOAuthEnabled:
      isShopSignInMethodEnabled('facebook') && readBool('facebook_mobile_direct_oauth_enabled'),
    googleVerbose: isShopSignInVerboseEnabled('google'),
    facebookVerbose: isShopSignInVerboseEnabled('facebook'),
    appleVerbose: isShopSignInVerboseEnabled('apple'),
  };
}

/** Read sign-in gates without warming the preference cache (OPS `check`). */
export async function readShopSignInMethodsSnapshot(db: Pool = pool): Promise<ShopSignInMethodsSnapshot> {
  const { rows } = await db.query<{ key: AppPreferenceKey; value: unknown }>(
    `select key, value
     from app_preferences
     where key = any($1::text[])`,
    [
      [
        'sign_in_google_enabled',
        'sign_in_facebook_enabled',
        'sign_in_apple_enabled',
        'facebook_mobile_direct_oauth_enabled',
        'sign_in_google_verbose_enabled',
        'sign_in_facebook_verbose_enabled',
        'sign_in_apple_verbose_enabled',
      ],
    ],
  );
  const values = new Map<string, boolean>();
  for (const row of rows) {
    const value = parseBool(row.value);
    if (value !== undefined) values.set(row.key, value);
  }
  return {
    google: values.get('sign_in_google_enabled') ?? defaultForKey('sign_in_google_enabled'),
    facebook: values.get('sign_in_facebook_enabled') ?? defaultForKey('sign_in_facebook_enabled'),
    apple: values.get('sign_in_apple_enabled') ?? defaultForKey('sign_in_apple_enabled'),
    facebookMobileDirectOAuthEnabled:
      values.get('facebook_mobile_direct_oauth_enabled') ??
      defaultForKey('facebook_mobile_direct_oauth_enabled'),
    googleVerbose:
      values.get('sign_in_google_verbose_enabled') ?? defaultForKey('sign_in_google_verbose_enabled'),
    facebookVerbose:
      values.get('sign_in_facebook_verbose_enabled') ?? defaultForKey('sign_in_facebook_verbose_enabled'),
    appleVerbose:
      values.get('sign_in_apple_verbose_enabled') ?? defaultForKey('sign_in_apple_verbose_enabled'),
  };
}

export async function getAppPreferencesSnapshot(db: Pool = pool): Promise<AppPreferencesSnapshot> {
  await ensureLoaded(db);
  const spy = {} as Record<SpyKind, boolean>;
  for (const kind of SPY_KINDS) spy[kind] = isSpyKindEnabled(kind);
  const apiLogEnabled = isApiLogPreferenceEnabled();
  const shopPayments = getShopPaymentMethodsSnapshot();
  const shopSignIn = getShopSignInMethodsSnapshot();
  return {
    cronShipmentLogEnabled: isCronShipmentLogPreferenceEnabled(),
    cronAccountDeletionLogEnabled: isCronAccountDeletionLogPreferenceEnabled(),
    cronGuestSavedCleanupLogEnabled: isCronGuestSavedCleanupLogPreferenceEnabled(),
    cronLoyaltyLogEnabled: isCronLoyaltyLogPreferenceEnabled(),
    cronGiftLogEnabled: isCronGiftLogPreferenceEnabled(),
    cronGiftPurgeLogEnabled: isCronGiftPurgeLogPreferenceEnabled(),
    cronPaymentAuthExpirySpyLogEnabled: isCronPaymentAuthExpirySpyLogPreferenceEnabled(),
    cronWarmLogEnabled: isCronWarmLogPreferenceEnabled(),
    apiLogEnabled,
    apiLogEnabledEffective: isApiLogPreferenceEnabled(),
    emailLogEnabled: isEmailLogPreferenceEnabled(),
    contactEmailGuestEnabled: isContactEmailGuestEnabled(),
    contactEmailConnectedEnabled: isContactEmailConnectedEnabled(),
    paymentCardEnabled: shopPayments.card,
    paymentPaypalEnabled: shopPayments.paypal,
    paymentBancontactEnabled: shopPayments.bancontact,
    paymentGooglePayEnabled: shopPayments.googlePay,
    paymentApplePayEnabled: shopPayments.applePay,
    signInGoogleEnabled: shopSignIn.google,
    signInFacebookEnabled: shopSignIn.facebook,
    signInAppleEnabled: shopSignIn.apple,
    facebookMobileDirectOAuthEnabled: shopSignIn.facebookMobileDirectOAuthEnabled,
    signInGoogleVerboseEnabled: shopSignIn.googleVerbose,
    signInFacebookVerboseEnabled: shopSignIn.facebookVerbose,
    signInAppleVerboseEnabled: shopSignIn.appleVerbose,
    outOfStockEnabled: isOutOfStockEnabled(),
    outOfStockSizeRequestEnabled: isOutOfStockSizeRequestEnabled(),
    spy,
    updatedAt: cachedPreferencesUpdatedAt()?.toISOString() ?? null,
  };
}

export type AppPreferencesPatch = {
  cronShipmentLogEnabled?: boolean;
  cronAccountDeletionLogEnabled?: boolean;
  cronGuestSavedCleanupLogEnabled?: boolean;
  cronLoyaltyLogEnabled?: boolean;
  cronGiftLogEnabled?: boolean;
  cronGiftPurgeLogEnabled?: boolean;
  cronPaymentAuthExpirySpyLogEnabled?: boolean;
  cronWarmLogEnabled?: boolean;
  apiLogEnabled?: boolean;
  emailLogEnabled?: boolean;
  contactEmailGuestEnabled?: boolean;
  contactEmailConnectedEnabled?: boolean;
  paymentCardEnabled?: boolean;
  paymentPaypalEnabled?: boolean;
  paymentBancontactEnabled?: boolean;
  paymentGooglePayEnabled?: boolean;
  paymentApplePayEnabled?: boolean;
  signInGoogleEnabled?: boolean;
  signInFacebookEnabled?: boolean;
  signInAppleEnabled?: boolean;
  facebookMobileDirectOAuthEnabled?: boolean;
  signInGoogleVerboseEnabled?: boolean;
  signInFacebookVerboseEnabled?: boolean;
  signInAppleVerboseEnabled?: boolean;
  outOfStockEnabled?: boolean;
  outOfStockSizeRequestEnabled?: boolean;
  spy?: Partial<Record<SpyKind, boolean>>;
};

export async function patchAppPreferences(
  db: Pool,
  patch: AppPreferencesPatch,
  updatedBy: string | null,
): Promise<AppPreferencesSnapshot> {
  await ensureLoaded(db);
  const writes: Array<{ key: AppPreferenceKey; value: boolean }> = [];
  function pushOwned(pluginId: string, key: AppPreferenceKey, value: boolean): void {
    if (!isRuntimePluginEnabled(pluginId)) return;
    writes.push({ key, value });
  }
  if (typeof patch.cronShipmentLogEnabled === 'boolean')
    pushOwned('tuucho-shipping-expedition-cron', 'cron_shipment_log_enabled', patch.cronShipmentLogEnabled);
  if (typeof patch.cronAccountDeletionLogEnabled === 'boolean')
    writes.push({ key: 'cron_account_deletion_log_enabled', value: patch.cronAccountDeletionLogEnabled });
  if (typeof patch.cronGuestSavedCleanupLogEnabled === 'boolean')
    writes.push({
      key: 'cron_guest_saved_cleanup_log_enabled',
      value: patch.cronGuestSavedCleanupLogEnabled,
    });
  if (typeof patch.cronLoyaltyLogEnabled === 'boolean')
    pushOwned('tuucho-commerce-loyalty', 'cron_loyalty_log_enabled', patch.cronLoyaltyLogEnabled);
  if (typeof patch.cronGiftLogEnabled === 'boolean')
    pushOwned('tuucho-commerce-gift', 'cron_gift_log_enabled', patch.cronGiftLogEnabled);
  if (typeof patch.cronGiftPurgeLogEnabled === 'boolean')
    pushOwned('tuucho-commerce-gift', 'cron_gift_purge_log_enabled', patch.cronGiftPurgeLogEnabled);
  if (typeof patch.cronPaymentAuthExpirySpyLogEnabled === 'boolean')
    pushOwned(
      'tuucho-payment-stripe',
      'cron_payment_auth_expiry_spy_log_enabled',
      patch.cronPaymentAuthExpirySpyLogEnabled,
    );
  if (typeof patch.cronWarmLogEnabled === 'boolean')
    writes.push({ key: 'cron_warm_log_enabled', value: patch.cronWarmLogEnabled });
  if (typeof patch.apiLogEnabled === 'boolean')
    pushOwned('tuucho-journal-admin', 'api_log_enabled', patch.apiLogEnabled);
  if (typeof patch.emailLogEnabled === 'boolean')
    pushOwned('tuucho-journal-email', 'email_log_enabled', patch.emailLogEnabled);
  if (typeof patch.contactEmailGuestEnabled === 'boolean')
    pushOwned('tuucho-contact', 'contact_email_guest_enabled', patch.contactEmailGuestEnabled);
  if (typeof patch.contactEmailConnectedEnabled === 'boolean')
    pushOwned('tuucho-contact', 'contact_email_connected_enabled', patch.contactEmailConnectedEnabled);
  if (typeof patch.paymentCardEnabled === 'boolean')
    pushOwned('tuucho-payment-stripe', 'payment_card_enabled', patch.paymentCardEnabled);
  if (typeof patch.paymentPaypalEnabled === 'boolean')
    pushOwned('tuucho-payment-stripe', 'payment_paypal_enabled', patch.paymentPaypalEnabled);
  if (typeof patch.paymentBancontactEnabled === 'boolean')
    pushOwned('tuucho-payment-stripe', 'payment_bancontact_enabled', patch.paymentBancontactEnabled);
  if (typeof patch.paymentGooglePayEnabled === 'boolean')
    pushOwned('tuucho-payment-stripe', 'payment_google_pay_enabled', patch.paymentGooglePayEnabled);
  if (typeof patch.paymentApplePayEnabled === 'boolean')
    pushOwned('tuucho-payment-stripe', 'payment_apple_pay_enabled', patch.paymentApplePayEnabled);
  if (typeof patch.signInGoogleEnabled === 'boolean')
    pushOwned('tuucho-signin-google', 'sign_in_google_enabled', patch.signInGoogleEnabled);
  if (typeof patch.signInFacebookEnabled === 'boolean')
    pushOwned('tuucho-signin-facebook', 'sign_in_facebook_enabled', patch.signInFacebookEnabled);
  if (typeof patch.signInAppleEnabled === 'boolean')
    pushOwned('tuucho-signin-apple', 'sign_in_apple_enabled', patch.signInAppleEnabled);
  if (typeof patch.facebookMobileDirectOAuthEnabled === 'boolean')
    pushOwned(
      'tuucho-signin-facebook',
      'facebook_mobile_direct_oauth_enabled',
      patch.facebookMobileDirectOAuthEnabled,
    );
  if (typeof patch.signInGoogleVerboseEnabled === 'boolean')
    pushOwned('tuucho-signin-google', 'sign_in_google_verbose_enabled', patch.signInGoogleVerboseEnabled);
  if (typeof patch.signInFacebookVerboseEnabled === 'boolean')
    pushOwned('tuucho-signin-facebook', 'sign_in_facebook_verbose_enabled', patch.signInFacebookVerboseEnabled);
  if (typeof patch.signInAppleVerboseEnabled === 'boolean')
    pushOwned('tuucho-signin-apple', 'sign_in_apple_verbose_enabled', patch.signInAppleVerboseEnabled);
  if (typeof patch.outOfStockEnabled === 'boolean')
    writes.push({ key: 'out_of_stock_enabled', value: patch.outOfStockEnabled });
  if (typeof patch.outOfStockSizeRequestEnabled === 'boolean')
    writes.push({ key: 'out_of_stock_size_request_enabled', value: patch.outOfStockSizeRequestEnabled });
  if (patch.spy) {
    for (const [kind, value] of Object.entries(patch.spy)) {
      if (!isSpyKind(kind) || typeof value !== 'boolean') continue;
      pushOwned('tuucho-mail-spy', spyKey(kind), value);
    }
  }
  if (writes.length === 0) return getAppPreferencesSnapshot(db);

  const client = await db.connect();
  try {
    await client.query('begin');
    // `updated_at` is the coherency watermark every process compares against,
    // so only the database may stamp it. The API, the OPS server and the CLIs
    // are separate processes with separate clocks: stamping it from whichever
    // one happened to write meant `max(updated_at)` could fail to advance past
    // a reader's cached watermark, and that reader then never reloaded again.
    // That is how an OPS-seeded `sign_in_google_enabled = true` kept being
    // served by the API as the `false` default for the life of the process.
    let latest: Date | null = null;
    for (const write of writes) {
      const { rows } = await client.query<{ updated_at: Date | string }>(
        `insert into app_preferences (key, value, updated_at, updated_by)
         values ($1, $2::jsonb, now(), $3)
         on conflict (key) do update
           set value = excluded.value,
               updated_at = now(),
               updated_by = excluded.updated_by
         returning updated_at`,
        [write.key, JSON.stringify({ enabled: write.value }), updatedBy],
      );
      const raw = rows[0]?.updated_at;
      const at = raw instanceof Date ? raw : raw ? new Date(raw) : null;
      if (at && !Number.isNaN(at.getTime()) && (!latest || at > latest)) latest = at;
    }
    await client.query('commit');
    // Reload rather than patching the written keys into the cache.
    //
    // Patching set `cache.updatedAt` to this write's timestamp while merging
    // only the keys this call touched. Any key another process had written
    // since the last load was then permanently masked: the watermark had moved
    // past it, so refreshIfStale saw nothing to do and the stale value was
    // served for the life of the process. An admin toggling one preference
    // through the API was enough to freeze every OPS-written preference,
    // which is how a seeded `sign_in_google_enabled = true` kept being served
    // as the `false` default.
    await reloadPreferences(db);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return getAppPreferencesSnapshot(db);
}
