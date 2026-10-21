import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { paymentRateLimiter } from '../../../middleware/rateLimiters.js';
import { isPaymentMethodAvailableForCheckout, registerCard } from '../application/cardRetention.js';
import * as cart from '../../cart/application/cart.js';
import { isShopPaymentMethodEnabled, warmAppPreferences } from '../../settings/application/appPreferences.js';
import {
  createSetupIntent,
  detachPaymentMethod,
  getOrCreateCustomerId,
  getPaymentMethod,
  getStripe,
  listPaymentMethods,
} from '../../../platform/stripe/stripeClient.js';
import { findUserById } from '../../identity/application/users.js';
import { deleteUserPreference, setUserPreference } from '../../identity/application/userPreferences.js';
import { boundedToken, boundedVoucherCode } from '../../../utils/fieldLimits.js';
import { isNonEmptyString } from '../../../utils/validate.js';
import {
  isSessionPaymentMethod,
  requireCheckoutPrivacySession,
  sendCheckoutPrivacySessionError,
} from '../../commerce/application/checkoutPrivacySession.js';
import {
  buildPaymentMethodsPayload,
  DEFAULT_PAYMENT_METHOD_PREFERENCE,
  getStoredDefaultPaymentMethod,
} from '../application/paymentPreferences.js';
import { handlePaymentMethodEnabledToggle } from '../application/paymentMethodEnabledToggles.js';

export const accountPaymentMethodsRouter = Router();

function shopPaymentForbiddenResponse(res: import('express').Response): void {
  res.status(403).json({ success: false, error: { code: 'payment_method_forbidden' } });
}

accountPaymentMethodsRouter.get('/payment-methods', requireAuth, async (req, res) => {
  res.json({ success: true, ...(await buildPaymentMethodsPayload(pool, req.user!.id)) });
});

/** A single attached card owned by this customer — including one-time
 * (`allow_redisplay: limited`) cards that GET /payment-methods omits.
 * Checkout uses this right after SetupIntent to render a card that isn't
 * saved for future purchases. */
accountPaymentMethodsRouter.get('/payment-methods/:id', requireAuth, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
    return;
  }
  const { id } = req.params as { id: string };
  const user = await findUserById(pool, req.user!.id);
  if (!user?.stripe_customer_id) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  try {
    const session = await requireCheckoutPrivacySession(pool, req, req.user!.id);
    const paymentMethod = await getPaymentMethod(stripe, user.stripe_customer_id, id);
    if (!paymentMethod || !(await isPaymentMethodAvailableForCheckout(pool, req.user!.id, id, session.id))) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    res.json({ success: true, paymentMethod });
  } catch (error) {
    if (sendCheckoutPrivacySessionError(res, error)) return;
    res.status(404).json({ success: false, error: { code: 'not_found' } });
  }
});

/** Profile show/hide toggles — placement only (overflow still choosable). */
accountPaymentMethodsRouter.put('/payment-methods/paypal-enabled', requireAuth, (req, res) =>
  handlePaymentMethodEnabledToggle(pool, req, res, 'paypal', shopPaymentForbiddenResponse),
);
accountPaymentMethodsRouter.put('/payment-methods/bancontact-enabled', requireAuth, (req, res) =>
  handlePaymentMethodEnabledToggle(pool, req, res, 'bancontact', shopPaymentForbiddenResponse),
);
accountPaymentMethodsRouter.put('/payment-methods/google-pay-enabled', requireAuth, (req, res) =>
  handlePaymentMethodEnabledToggle(pool, req, res, 'google_pay', shopPaymentForbiddenResponse),
);
accountPaymentMethodsRouter.put('/payment-methods/apple-pay-enabled', requireAuth, (req, res) =>
  handlePaymentMethodEnabledToggle(pool, req, res, 'apple_pay', shopPaymentForbiddenResponse),
);
/** Cart "Nouvelle carte" only; remembered cards stay listed. */
accountPaymentMethodsRouter.put('/payment-methods/new-card-enabled', requireAuth, (req, res) =>
  handlePaymentMethodEnabledToggle(pool, req, res, 'new_card', shopPaymentForbiddenResponse),
);

/** Stores the customer's preferred checkout method. A card default must be
 * one of this customer's attached Stripe cards; PayPal / Bancontact /
 * Google Pay / Apple Pay are first-class preferences even though they are
 * not stored Stripe PaymentMethods (wallet checkout still creates a one-off
 * pm_… at pay time). */
accountPaymentMethodsRouter.put('/payment-methods/default', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  await warmAppPreferences();
  if (
    body.type === 'paypal' ||
    body.type === 'bancontact' ||
    body.type === 'google_pay' ||
    body.type === 'apple_pay'
  ) {
    if (!isShopPaymentMethodEnabled(body.type)) {
      shopPaymentForbiddenResponse(res);
      return;
    }
    await setUserPreference(pool, req.user!.id, DEFAULT_PAYMENT_METHOD_PREFERENCE, body.type);
    res.json({ success: true, defaultPaymentMethod: { type: body.type } });
    return;
  }
  if (body.type !== 'card' || !boundedToken(body.id)) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (!isShopPaymentMethodEnabled('card')) {
    shopPaymentForbiddenResponse(res);
    return;
  }

  const stripe = getStripe();
  const user = await findUserById(pool, req.user!.id);
  const paymentMethods =
    stripe && user?.stripe_customer_id ? await listPaymentMethods(stripe, user.stripe_customer_id) : [];
  const paymentMethodId = boundedToken(body.id)!;
  if (!paymentMethods.some((method) => method.id === paymentMethodId)) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  await setUserPreference(pool, req.user!.id, DEFAULT_PAYMENT_METHOD_PREFERENCE, `card:${paymentMethodId}`);
  res.json({ success: true, defaultPaymentMethod: { type: 'card', id: paymentMethodId } });
});

/** Clicking the default badge — payment methods already treat "no default"
 * as a normal state (defaultPaymentMethod is nullable everywhere), so this
 * is just clearing the preference, no promotion/fallback needed. */
accountPaymentMethodsRouter.post('/payment-methods/unset-default', requireAuth, async (req, res) => {
  await deleteUserPreference(pool, req.user!.id, DEFAULT_PAYMENT_METHOD_PREFERENCE);
  res.json({ success: true });
});

/** Advisory checkout selection for the active cart — restores the cart
 * page's delivery/payment choices after a full remount (Mondial Relay
 * pickup-point picker, failed/interrupted redirect-based payment, a
 * different device). Never trusted for pricing/stock/compatibility. */
accountPaymentMethodsRouter.get('/checkout/selection', requireAuth, async (req, res) => {
  const selection = await cart.getCheckoutSelection(pool, req.user!.id);
  res.json({ success: true, ...selection });
});

accountPaymentMethodsRouter.put('/checkout/selection', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const selection = await cart.setCheckoutSelection(pool, req.user!.id, {
    addressId: isNonEmptyString(body.addressId) ? body.addressId : null,
    courierCode: isNonEmptyString(body.courierCode) ? body.courierCode : null,
    express: body.express === true,
    billingAddressId: isNonEmptyString(body.billingAddressId) ? body.billingAddressId : null,
    sameAsBilling: body.sameAsBilling !== false,
    paymentMethodId: boundedToken(body.paymentMethodId) ?? null,
    voucherCode: boundedVoucherCode(body.voucherCode) ?? null,
    applyLoyalty: body.applyLoyalty === true,
  });
  res.json({ success: true, ...selection });
});

/** Client secret for a plain SetupIntent — used by the "add a card" modal
 * on the payment-methods management page, where no charge is involved. */
accountPaymentMethodsRouter.post(
  '/payment-methods/setup-intent',
  requireAuth,
  paymentRateLimiter,
  async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
      res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
      return;
    }
    await warmAppPreferences();
    if (!isShopPaymentMethodEnabled('card')) {
      shopPaymentForbiddenResponse(res);
      return;
    }
    const customerId = await getOrCreateCustomerId(pool, stripe, req.user!.id);
    const clientSecret = await createSetupIntent(stripe, customerId);
    res.json({ success: true, clientSecret });
  },
);

/** Attaches a card tokenized while signed out (the front's guest checkout
 * creates the pm_… id before any customer exists) to this now-known
 * customer, then runs registerCard so one_time vs saved matches the
 * authenticated SetupIntent path. Body may include `savedForFuture`
 * (default true for backwards compatibility with older guest vaults). */
accountPaymentMethodsRouter.post(
  '/payment-methods/attach',
  requireAuth,
  paymentRateLimiter,
  async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
      res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
      return;
    }
    await warmAppPreferences();
    if (!isShopPaymentMethodEnabled('card')) {
      shopPaymentForbiddenResponse(res);
      return;
    }
    const body = req.body ?? {};
    const paymentMethodId = boundedToken(body.paymentMethodId);
    if (!paymentMethodId) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const savedForFuture = body.savedForFuture !== false;
    try {
      const session = await requireCheckoutPrivacySession(pool, req, req.user!.id, true);
      if (!(await isSessionPaymentMethod(pool, session.id, paymentMethodId))) {
        res.status(409).json({ success: false, error: { code: 'payment_method_not_available' } });
        return;
      }
      const paymentMethod = await registerCard(
        pool,
        stripe,
        req.user!.id,
        paymentMethodId,
        savedForFuture,
        session.id,
      );
      res.json({ success: true, paymentMethod });
    } catch (error) {
      if (sendCheckoutPrivacySessionError(res, error)) return;
      res.status(400).json({ success: false, error: { code: 'payment_method_attach_failed' } });
    }
  },
);

/** After SetupIntent confirm (or guest tokenize): sync retention row,
 * allow_redisplay, and one_time vs saved. Body:
 * `{ "paymentMethodId": "pm_…", "savedForFuture": boolean }`. */
accountPaymentMethodsRouter.post(
  '/payment-methods/register',
  requireAuth,
  paymentRateLimiter,
  async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
      res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
      return;
    }
    await warmAppPreferences();
    if (!isShopPaymentMethodEnabled('card')) {
      shopPaymentForbiddenResponse(res);
      return;
    }
    const body = req.body ?? {};
    const paymentMethodId = boundedToken(body.paymentMethodId);
    if (!paymentMethodId || typeof body.savedForFuture !== 'boolean') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    try {
      const session = body.savedForFuture
        ? undefined
        : await requireCheckoutPrivacySession(pool, req, req.user!.id, true);
      const paymentMethod = await registerCard(
        pool,
        stripe,
        req.user!.id,
        paymentMethodId,
        body.savedForFuture,
        session?.id,
      );
      res.json({ success: true, paymentMethod, savedForFuture: body.savedForFuture });
    } catch (error) {
      if (sendCheckoutPrivacySessionError(res, error)) return;
      res.status(400).json({ success: false, error: { code: 'payment_method_register_failed' } });
    }
  },
);

accountPaymentMethodsRouter.delete('/payment-methods/:id', requireAuth, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
    return;
  }
  const { id } = req.params as { id: string };
  const user = await findUserById(pool, req.user!.id);
  const removed = user?.stripe_customer_id
    ? await detachPaymentMethod(stripe, user.stripe_customer_id, id)
    : false;
  if (!removed) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  await pool.query(
    `delete from customer_card_retention where user_id = $1 and stripe_payment_method_id = $2`,
    [req.user!.id, id],
  );
  const defaultPaymentMethod = await getStoredDefaultPaymentMethod(pool, req.user!.id);
  if (defaultPaymentMethod?.type === 'card' && defaultPaymentMethod.id === id) {
    await deleteUserPreference(pool, req.user!.id, DEFAULT_PAYMENT_METHOD_PREFERENCE);
  }
  res.json({ success: true, deleted: true });
});

/** Orders are immutable once placed — kept as a stable endpoint shape (same
 * as the DELETE below) rather than removed outright, always rejecting. */
