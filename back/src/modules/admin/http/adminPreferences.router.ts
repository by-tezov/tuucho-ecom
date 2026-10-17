import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import {
  getAppPreferencesSnapshot,
  patchAppPreferences,
  SPY_KINDS,
  type SpyKind,
} from '../../settings/application/appPreferences.js';
import { invalidateFilterOptionsCache } from '../../catalog/application/filterOptionsCache.js';
import {
  patchPublicPaymentMethodCountries,
  readPublicPaymentMethodCountries,
} from '../../payments/application/paymentMethodCountries.js';
import { recordAdminActivityBestEffort } from '../../activity/application/recordAdminActivity.js';
import { activityChangeDetail } from '../../activity/application/changeDetail.js';

export const adminPreferencesRouter = Router();

adminPreferencesRouter.get('/preferences', requireAuth, requirePermission('preferences'), async (_req, res) => {
  const [preferences, paymentMethodCountries] = await Promise.all([
    getAppPreferencesSnapshot(pool),
    readPublicPaymentMethodCountries(pool),
  ]);
  res.json({ success: true, preferences: { ...preferences, paymentMethodCountries } });
});

adminPreferencesRouter.patch('/preferences', requireAuth, requirePermission('preferences'), async (req, res) => {
  const body = req.body ?? {};
  const spyPatch: Partial<Record<SpyKind, boolean>> = {};
  if (body.spy && typeof body.spy === 'object' && !Array.isArray(body.spy)) {
    for (const kind of SPY_KINDS) {
      if (typeof body.spy[kind] === 'boolean') spyPatch[kind] = body.spy[kind];
    }
  }
  if (body.cronShipmentLogEnabled !== undefined && typeof body.cronShipmentLogEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (
    body.cronAccountDeletionLogEnabled !== undefined &&
    typeof body.cronAccountDeletionLogEnabled !== 'boolean'
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (
    body.cronGuestSavedCleanupLogEnabled !== undefined &&
    typeof body.cronGuestSavedCleanupLogEnabled !== 'boolean'
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.cronLoyaltyLogEnabled !== undefined && typeof body.cronLoyaltyLogEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.cronGiftLogEnabled !== undefined && typeof body.cronGiftLogEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.cronGiftPurgeLogEnabled !== undefined && typeof body.cronGiftPurgeLogEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (
    body.cronPaymentAuthExpirySpyLogEnabled !== undefined &&
    typeof body.cronPaymentAuthExpirySpyLogEnabled !== 'boolean'
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.cronWarmLogEnabled !== undefined && typeof body.cronWarmLogEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.apiLogEnabled !== undefined && typeof body.apiLogEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.emailLogEnabled !== undefined && typeof body.emailLogEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.contactEmailGuestEnabled !== undefined && typeof body.contactEmailGuestEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (
    body.contactEmailConnectedEnabled !== undefined &&
    typeof body.contactEmailConnectedEnabled !== 'boolean'
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.paymentCardEnabled !== undefined && typeof body.paymentCardEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.paymentPaypalEnabled !== undefined && typeof body.paymentPaypalEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.paymentBancontactEnabled !== undefined && typeof body.paymentBancontactEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.paymentGooglePayEnabled !== undefined && typeof body.paymentGooglePayEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.paymentApplePayEnabled !== undefined && typeof body.paymentApplePayEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.signInGoogleEnabled !== undefined && typeof body.signInGoogleEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.signInFacebookEnabled !== undefined && typeof body.signInFacebookEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.signInAppleEnabled !== undefined && typeof body.signInAppleEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (
    body.facebookMobileDirectOAuthEnabled !== undefined &&
    typeof body.facebookMobileDirectOAuthEnabled !== 'boolean'
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.signInGoogleVerboseEnabled !== undefined && typeof body.signInGoogleVerboseEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (
    body.signInFacebookVerboseEnabled !== undefined &&
    typeof body.signInFacebookVerboseEnabled !== 'boolean'
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.signInAppleVerboseEnabled !== undefined && typeof body.signInAppleVerboseEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.outOfStockEnabled !== undefined && typeof body.outOfStockEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (
    body.outOfStockSizeRequestEnabled !== undefined &&
    typeof body.outOfStockSizeRequestEnabled !== 'boolean'
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (body.compositionPageEnabled !== undefined && typeof body.compositionPageEnabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const countryPatch: Partial<Record<'card' | 'paypal' | 'bancontact' | 'googlePay' | 'applePay', string[]>> =
    {};
  if (
    body.paymentMethodCountries &&
    typeof body.paymentMethodCountries === 'object' &&
    !Array.isArray(body.paymentMethodCountries)
  ) {
    const raw = body.paymentMethodCountries as Record<string, unknown>;
    if (Array.isArray(raw.card))
      countryPatch.card = raw.card.filter((c): c is string => typeof c === 'string');
    if (Array.isArray(raw.paypal))
      countryPatch.paypal = raw.paypal.filter((c): c is string => typeof c === 'string');
    if (Array.isArray(raw.bancontact))
      countryPatch.bancontact = raw.bancontact.filter((c): c is string => typeof c === 'string');
    if (Array.isArray(raw.googlePay))
      countryPatch.googlePay = raw.googlePay.filter((c): c is string => typeof c === 'string');
    if (Array.isArray(raw.applePay))
      countryPatch.applePay = raw.applePay.filter((c): c is string => typeof c === 'string');
  }
  const beforePreferences = await getAppPreferencesSnapshot(pool);
  const beforeCountries =
    Object.keys(countryPatch).length > 0 ? await readPublicPaymentMethodCountries(pool) : null;
  if (Object.keys(countryPatch).length > 0) {
    await patchPublicPaymentMethodCountries(pool, countryPatch);
  }
  const preferencePatch = {
    ...(typeof body.cronShipmentLogEnabled === 'boolean'
      ? { cronShipmentLogEnabled: body.cronShipmentLogEnabled }
      : {}),
    ...(typeof body.cronAccountDeletionLogEnabled === 'boolean'
      ? { cronAccountDeletionLogEnabled: body.cronAccountDeletionLogEnabled }
      : {}),
    ...(typeof body.cronGuestSavedCleanupLogEnabled === 'boolean'
      ? { cronGuestSavedCleanupLogEnabled: body.cronGuestSavedCleanupLogEnabled }
      : {}),
    ...(typeof body.cronLoyaltyLogEnabled === 'boolean'
      ? { cronLoyaltyLogEnabled: body.cronLoyaltyLogEnabled }
      : {}),
    ...(typeof body.cronGiftLogEnabled === 'boolean'
      ? { cronGiftLogEnabled: body.cronGiftLogEnabled }
      : {}),
    ...(typeof body.cronGiftPurgeLogEnabled === 'boolean'
      ? { cronGiftPurgeLogEnabled: body.cronGiftPurgeLogEnabled }
      : {}),
    ...(typeof body.cronPaymentAuthExpirySpyLogEnabled === 'boolean'
      ? { cronPaymentAuthExpirySpyLogEnabled: body.cronPaymentAuthExpirySpyLogEnabled }
      : {}),
    ...(typeof body.cronWarmLogEnabled === 'boolean'
      ? { cronWarmLogEnabled: body.cronWarmLogEnabled }
      : {}),
    ...(typeof body.apiLogEnabled === 'boolean' ? { apiLogEnabled: body.apiLogEnabled } : {}),
    ...(typeof body.emailLogEnabled === 'boolean' ? { emailLogEnabled: body.emailLogEnabled } : {}),
    ...(typeof body.contactEmailGuestEnabled === 'boolean'
      ? { contactEmailGuestEnabled: body.contactEmailGuestEnabled }
      : {}),
    ...(typeof body.contactEmailConnectedEnabled === 'boolean'
      ? { contactEmailConnectedEnabled: body.contactEmailConnectedEnabled }
      : {}),
    ...(typeof body.paymentCardEnabled === 'boolean'
      ? { paymentCardEnabled: body.paymentCardEnabled }
      : {}),
    ...(typeof body.paymentPaypalEnabled === 'boolean'
      ? { paymentPaypalEnabled: body.paymentPaypalEnabled }
      : {}),
    ...(typeof body.paymentBancontactEnabled === 'boolean'
      ? { paymentBancontactEnabled: body.paymentBancontactEnabled }
      : {}),
    ...(typeof body.paymentGooglePayEnabled === 'boolean'
      ? { paymentGooglePayEnabled: body.paymentGooglePayEnabled }
      : {}),
    ...(typeof body.paymentApplePayEnabled === 'boolean'
      ? { paymentApplePayEnabled: body.paymentApplePayEnabled }
      : {}),
    ...(typeof body.signInGoogleEnabled === 'boolean'
      ? { signInGoogleEnabled: body.signInGoogleEnabled }
      : {}),
    ...(typeof body.signInFacebookEnabled === 'boolean'
      ? { signInFacebookEnabled: body.signInFacebookEnabled }
      : {}),
    ...(typeof body.signInAppleEnabled === 'boolean'
      ? { signInAppleEnabled: body.signInAppleEnabled }
      : {}),
    ...(typeof body.facebookMobileDirectOAuthEnabled === 'boolean'
      ? { facebookMobileDirectOAuthEnabled: body.facebookMobileDirectOAuthEnabled }
      : {}),
    ...(typeof body.signInGoogleVerboseEnabled === 'boolean'
      ? { signInGoogleVerboseEnabled: body.signInGoogleVerboseEnabled }
      : {}),
    ...(typeof body.signInFacebookVerboseEnabled === 'boolean'
      ? { signInFacebookVerboseEnabled: body.signInFacebookVerboseEnabled }
      : {}),
    ...(typeof body.signInAppleVerboseEnabled === 'boolean'
      ? { signInAppleVerboseEnabled: body.signInAppleVerboseEnabled }
      : {}),
    ...(typeof body.outOfStockEnabled === 'boolean' ? { outOfStockEnabled: body.outOfStockEnabled } : {}),
    ...(typeof body.outOfStockSizeRequestEnabled === 'boolean'
      ? { outOfStockSizeRequestEnabled: body.outOfStockSizeRequestEnabled }
      : {}),
    ...(typeof body.compositionPageEnabled === 'boolean'
      ? { compositionPageEnabled: body.compositionPageEnabled }
      : {}),
    ...(Object.keys(spyPatch).length > 0 ? { spy: spyPatch } : {}),
  };
  const preferences = await patchAppPreferences(pool, preferencePatch, req.user?.id ?? null);
  if (
    typeof body.outOfStockEnabled === 'boolean' ||
    typeof body.outOfStockSizeRequestEnabled === 'boolean'
  ) {
    invalidateFilterOptionsCache();
  }
  const paymentMethodCountries = await readPublicPaymentMethodCountries(pool);
  const beforeSnapshot: Record<string, unknown> = {};
  const afterSnapshot: Record<string, unknown> = {};
  for (const key of Object.keys(preferencePatch) as (keyof typeof preferencePatch)[]) {
    if (key === 'spy') {
      beforeSnapshot.spy = Object.fromEntries(
        Object.keys(spyPatch).map((kind) => [kind, beforePreferences.spy[kind as SpyKind]]),
      );
      afterSnapshot.spy = spyPatch;
      continue;
    }
    beforeSnapshot[key] = beforePreferences[key as keyof typeof beforePreferences];
    afterSnapshot[key] = preferencePatch[key];
  }
  if (beforeCountries) {
    beforeSnapshot.paymentMethodCountries = Object.fromEntries(
      Object.keys(countryPatch).map((method) => [
        method,
        beforeCountries[method as keyof typeof beforeCountries] ?? [],
      ]),
    );
    afterSnapshot.paymentMethodCountries = Object.fromEntries(
      Object.keys(countryPatch).map((method) => [
        method,
        paymentMethodCountries[method as keyof typeof paymentMethodCountries] ?? [],
      ]),
    );
  }
  const { changes, changeSummary, detail } = activityChangeDetail({}, beforeSnapshot, afterSnapshot);
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'settings',
    action: 'settings.preferences',
    summary:
      changes.length === 0
        ? 'Preferences administrateur: aucun changement'
        : `Preferences administrateur: ${changeSummary}`,
    targetType: 'preferences',
    detail,
  });
  res.json({ success: true, preferences: { ...preferences, paymentMethodCountries } });
});

/** Live shipping catalog toggles — same DB rows courier seed owns
 * (address_countries.enabled, couriers.enabled, courier_countries.enabled). */
