import { Router } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import {
  getShopPaymentMethodsSnapshot,
  warmAppPreferences,
} from '../../settings/application/appPreferences.js';
import {
  getPublicPaymentMethodCountriesSnapshot,
  warmPaymentMethodCountriesForCheckout,
} from '../../payments/application/paymentMethodCountries.js';
import { buildClientCountryContextFromRequest } from '../application/clientCountryContext.js';
import { CHECKOUT_FAILURE_STATUS } from '../../commerce/application/checkoutFailureStatus.js';
import { previewGuestItemsLoyalty } from '../../loyalty/application/merchandiseLoyaltyPreview.js';
import { boundedToken, boundedVoucherCode } from '../../../utils/fieldLimits.js';
import { optionalAuth } from '../../../middleware/optionalAuth.js';
import { checkoutRateLimiter } from '../../../middleware/rateLimiters.js';
import {
  registerSessionPaymentMethod,
  requireCheckoutPrivacySession,
  sendCheckoutPrivacySessionError,
  startCheckoutPrivacySession,
} from '../../commerce/application/checkoutPrivacySession.js';
import { guestItemsFromBody } from './guestCheckoutSchemas.js';

/** Unauthenticated checkout helpers shared by guest and signed-in carts. */
export const checkoutRouter = Router();

async function requireGuestCheckoutSession(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
): Promise<void> {
  try {
    const session = await requireCheckoutPrivacySession(pool, req, null, true);
    res.locals.checkoutPrivacySessionId = session.id;
    next();
  } catch (error) {
    if (!sendCheckoutPrivacySessionError(res, error)) throw error;
  }
}

/** Creates or resumes the current tab's sensitive-checkout session. The raw
 * bearer token and unwrapped AES key are returned to the browser only. */
checkoutRouter.post('/session/start', checkoutRateLimiter, optionalAuth, async (req, res) => {
  const session = await startCheckoutPrivacySession(pool, req, req.user?.id ?? null);
  res.json({
    success: true,
    token: session.token,
    vaultKey: session.vaultKey,
    expiresAt: session.expiresAt,
    idleTimeoutMs: config.checkoutPrivacySessionIdleTtlMs,
    resumed: session.resumed,
    expired: session.expired,
  });
});

checkoutRouter.post('/session/touch', optionalAuth, async (req, res) => {
  try {
    const session = await requireCheckoutPrivacySession(pool, req, req.user?.id ?? null, true, true);
    res.json({ success: true, expiresAt: session.expiresAt });
  } catch (error) {
    if (!sendCheckoutPrivacySessionError(res, error)) throw error;
  }
});

/** Registers a guest-created Stripe token with this tab before it may be
 * named by guest create-intent. No PAN/CVC ever crosses this API. */
checkoutRouter.post('/session/payment-methods', checkoutRateLimiter, optionalAuth, async (req, res) => {
  try {
    const session = await requireCheckoutPrivacySession(pool, req, req.user?.id ?? null, true);
    const paymentMethodId = boundedToken(req.body?.paymentMethodId);
    if (!paymentMethodId?.startsWith('pm_')) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    if (!(await registerSessionPaymentMethod(pool, session.id, paymentMethodId))) {
      res.status(409).json({
        success: false,
        error: { code: 'checkout_session_payment_method_limit' },
      });
      return;
    }
    res.status(201).json({ success: true });
  } catch (error) {
    if (!sendCheckoutPrivacySessionError(res, error)) throw error;
  }
});

/** Shop-wide payment method availability — guests have no account payload. */
checkoutRouter.get('/payment-methods', async (req, res) => {
  await warmAppPreferences();
  await warmPaymentMethodCountriesForCheckout(pool);
  const deliveryCountry =
    typeof req.query.deliveryCountry === 'string' ? req.query.deliveryCountry : undefined;
  const countryContext = await buildClientCountryContextFromRequest(req, deliveryCountry);
  const countries = getPublicPaymentMethodCountriesSnapshot();
  res.json({
    success: true,
    shopPaymentMethods: getShopPaymentMethodsSnapshot(),
    paymentMethodCountries: countries,
    countryContext,
  });
});

/** Guest earn preview — merchandise only; no address/courier; guests cannot spend. */
checkoutRouter.post('/loyalty/preview', requireGuestCheckoutSession, async (req, res) => {
  const body = req.body ?? {};
  const items = guestItemsFromBody(body.items);
  const voucherCode = boundedVoucherCode(body.voucherCode);
  if (!items) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const priced = await previewGuestItemsLoyalty(pool, items, voucherCode ?? undefined);
  if (!priced.ok) {
    res
      .status(CHECKOUT_FAILURE_STATUS[priced.reason] ?? 400)
      .json({ success: false, error: { code: priced.reason } });
    return;
  }
  res.json({
    success: true,
    preview: {
      enabled: true,
      earningEnabled: true,
      loyaltyCredit: 0,
      loyaltyEarn: priced.preview.loyaltyEarn,
      incompatibleWithVoucher: false,
      total: priced.preview.total,
    },
  });
});
