import { Router } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import * as orders from '../../orders/application/ordersFacade.js';
import * as couriers from '../../delivery/application/couriers.js';
import { getStripe, createGuestCheckoutIntent, cancelPaymentIntent, retrievePaymentIntent } from '../../../platform/stripe/stripeClient.js';
import { checkoutRateLimiter, voucherRateLimiter } from '../../../middleware/rateLimiters.js';
import { boundedToken } from '../../../utils/fieldLimits.js';
import { isLanguage, requestLanguage } from '../../../utils/language.js';
import { voucherOfferDescription } from '../../plugins/application/pluginBridges.js';
import { appliedCodeFromPlugins } from '../../orders/application/checkoutOpenings.js';
import {
  guestSavedIntentFromCheckout,
  persistGuestSavedCheckout,
} from '../../customers/application/guestSavedCheckout.js';
import { isShopPaymentMethodEnabled, warmAppPreferences } from '../../settings/application/appPreferences.js';
import { assertShopPaymentMethodAllowedForCheckout } from '../../payments/application/paymentCheckoutValidation.js';
import { parseCheckoutPaymentMethod } from '../../payments/application/paymentPreferences.js';
import { CHECKOUT_FAILURE_STATUS } from '../../commerce/application/checkoutFailureStatus.js';
import { resolveCheckoutIntentMethod } from '../application/checkoutIntentMethod.js';
import { parseGuestCheckoutRequest, parseGuestVoucherValidateBody } from './guestCheckoutSchemas.js';
import { toPublicOrder } from '../../orders/presentation/orderPresenter.js';
import { settlePaymentIntent } from '../../settlement/application/settlePayment.js';
import { enqueueOrderConfirmation } from '../../orders/application/orderMailJob.js';
import {
  isSessionPaymentMethod,
  requireCheckoutPrivacySession,
  sendCheckoutPrivacySessionError,
} from '../../commerce/application/checkoutPrivacySession.js';

/** Unauthenticated checkout for a customer who never creates an account.
 * Stock reservation is keyed to the checkout attempt's own reservation id.
 * The order stays unlinked (`guest_email` only, `placed_as_guest` true)
 * even when that email already has an account — a 24h manage-order token
 * or an integrity-code claim attaches it later. Remembered address/card
 * rows wait for the same token. */
export const guestCheckoutRouter = Router();

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

/** Preview only, same guarantee as /account/checkout/voucher/validate: no
 * price or discount comes from the browser, and nothing is held — the server
 * re-prices the ad-hoc items/address/courier against a fresh voucher lookup.
 * Doesn't need email/consent (those only matter once the guest actually
 * checks out), so it parses its own subset instead of going through
 * parseGuestCheckoutRequest. */
guestCheckoutRouter.post(
  '/voucher/validate',
  requireGuestCheckoutSession,
  voucherRateLimiter,
  async (req, res) => {
    const parsed = parseGuestVoucherValidateBody(req.body ?? {});
    if (!parsed) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const priced = await orders.priceGuestCheckout(
      pool,
      parsed.items,
      parsed.address,
      parsed.courierCode,
      parsed.express,
      parsed.code,
      parsed.billingAddress,
      parsed.email,
      req.body,
    );
    if (!priced.ok) {
      // Collapse voucher_* reasons so probes cannot distinguish not_found /
      // disabled / depleted / etc. — same as the authenticated preview route.
      if (priced.reason.startsWith('voucher_')) {
        res.status(400).json({ success: false, error: { code: 'voucher_invalid' } });
        return;
      }
      res
        .status(CHECKOUT_FAILURE_STATUS[priced.reason] ?? 400)
        .json({ success: false, error: { code: priced.reason } });
      return;
    }
    const voucher = appliedCodeFromPlugins(priced.priced.plugins);
    res.json({
      success: true,
      extraLines: priced.priced.extraLines,
      plugins: priced.priced.plugins,
      voucher: voucher
        ? { ...voucher, description: await voucherOfferDescription(pool, voucher, requestLanguage(req)) }
        : null,
      subtotal: priced.priced.subtotal,
      shippingListFee: priced.priced.shippingListFee,
      shippingFee: priced.priced.shippingFee,
      rulesItemDiscount: priced.priced.rulesItemDiscount,
      cartRules: priced.priced.cartRules,
      total: priced.priced.total,
    });
  },
);

/** Prices + provisionally reserves stock, then opens a Stripe PaymentIntent
 * for the total — same two-step shape as /account/checkout/create-intent,
 * just against ad-hoc items/address instead of a persisted cart. */
guestCheckoutRouter.post(
  '/create-intent',
  requireGuestCheckoutSession,
  checkoutRateLimiter,
  async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
      res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
      return;
    }
    const body = req.body ?? {};
    const parsed = parseGuestCheckoutRequest(body);
    if (!parsed) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const checkoutMethod = parseCheckoutPaymentMethod(body.method);
    if (body.method !== undefined && body.method !== null && body.method !== '' && !checkoutMethod) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const {
      isWalletMethod,
      isPaypalMethod,
      isBancontactMethod,
      paymentMethodTypes,
      shopMethod,
      requiresPaymentMethodId,
      setupFutureUsage,
    } = resolveCheckoutIntentMethod(checkoutMethod);
    // A saved guest card is tokenized client-side before pay and confirmed
    // with confirmCardPayment; its pm_… rides in metadata for the settle
    // mismatch check. `new_card` collects the card in the pay sheet against
    // this PaymentIntent (no prior pm id). PayPal / Bancontact / wallets
    // never carry a pm id; wallets must not set setup_future_usage.
    const paymentMethodId = requiresPaymentMethodId ? boundedToken(body.paymentMethodId) : undefined;
    if (
      paymentMethodId &&
      !(await isSessionPaymentMethod(pool, res.locals.checkoutPrivacySessionId as string, paymentMethodId))
    ) {
      res.status(409).json({ success: false, error: { code: 'payment_method_not_available' } });
      return;
    }

    await warmAppPreferences();
    if (!isShopPaymentMethodEnabled(shopMethod)) {
      res.status(403).json({ success: false, error: { code: 'payment_method_forbidden' } });
      return;
    }
    const paymentAllowed = await assertShopPaymentMethodAllowedForCheckout(pool, shopMethod);
    if (!paymentAllowed.ok) {
      res.status(403).json({ success: false, error: { code: paymentAllowed.code } });
      return;
    }

    const reserved = await orders.reserveGuestCart(
      pool,
      parsed.items,
      parsed.email,
      parsed.address,
      parsed.courierCode,
      parsed.express,
      config.stockReservationTtlMs,
      parsed.voucherCode,
      parsed.billingAddress,
      guestSavedIntentFromCheckout(parsed.address, parsed.billingAddress, parsed.rememberCard),
      req.body,
    );
    if (!reserved.ok) {
      res
        .status(CHECKOUT_FAILURE_STATUS[reserved.reason] ?? 400)
        .json({ success: false, error: { code: reserved.reason } });
      return;
    }
    if (reserved.priced.total === 0) {
      await orders.releaseReservation(pool, reserved.reservationId);
      res.status(409).json({ success: false, error: { code: 'free_checkout_required' } });
      return;
    }

    try {
      const paymentIntent = await createGuestCheckoutIntent(
        stripe,
        reserved.priced.total,
        {
          guestEmail: parsed.email,
          courierCode: parsed.courierCode,
          express: String(parsed.express),
          reservationId: reserved.reservationId,
          ...(parsed.language ? { language: parsed.language } : {}),
          ...(paymentMethodId ? { paymentMethodId } : {}),
        },
        paymentMethodTypes,
        reserved.reservationId,
        setupFutureUsage ||
          (parsed.rememberCard && !isPaypalMethod && !isBancontactMethod && !isWalletMethod),
      );
      const linked = await orders.attachPaymentIntentToReservation(
        pool,
        reserved.reservationId,
        paymentIntent.id,
      );
      if (!linked) {
        throw new Error(
          `guest checkout reservation ${reserved.reservationId} could not be linked to ${paymentIntent.id}`,
        );
      }
      res.json({
        success: true,
        clientSecret: paymentIntent.clientSecret,
        reservationExpiresAt: reserved.expiresAt,
        amount: reserved.priced.total,
        extraLines: reserved.priced.extraLines,
        plugins: reserved.priced.plugins,
        voucher: appliedCodeFromPlugins(reserved.priced.plugins),
        subtotal: reserved.priced.subtotal,
        shippingListFee: reserved.priced.shippingListFee,
        shippingFee: reserved.priced.shippingFee,
        rulesItemDiscount: reserved.priced.rulesItemDiscount,
        cartRules: reserved.priced.cartRules,
      });
    } catch (error) {
      await orders.releaseReservation(pool, reserved.reservationId);
      throw error;
    }
  },
);

/** Confirms a €0 guest checkout (fully covered order — including one a
 * guest voucher brought to zero) without ever calling Stripe, same shape as
 * /account/checkout/free. */
guestCheckoutRouter.post('/free', requireGuestCheckoutSession, checkoutRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const parsed = parseGuestCheckoutRequest(body);
  if (!parsed) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const reserved = await orders.reserveGuestCart(
    pool,
    parsed.items,
    parsed.email,
    parsed.address,
    parsed.courierCode,
    parsed.express,
    config.stockReservationTtlMs,
    parsed.voucherCode,
    parsed.billingAddress,
    guestSavedIntentFromCheckout(parsed.address, parsed.billingAddress, parsed.rememberCard),
    req.body,
  );
  if (!reserved.ok) {
    res
      .status(CHECKOUT_FAILURE_STATUS[reserved.reason] ?? 400)
      .json({ success: false, error: { code: reserved.reason } });
    return;
  }
  if (reserved.priced.total !== 0) {
    await orders.releaseReservation(pool, reserved.reservationId);
    res.status(409).json({ success: false, error: { code: 'payment_required' } });
    return;
  }

  const paymentReference = `free:${reserved.reservationId}`;
  const linked = await orders.attachPaymentIntentToReservation(
    pool,
    reserved.reservationId,
    paymentReference,
  );
  if (!linked) {
    await orders.releaseReservation(pool, reserved.reservationId);
    res.status(409).json({ success: false, error: { code: 'size_unavailable' } });
    return;
  }
  const result = await orders.confirmGuestOrder(
    pool,
    parsed.email,
    parsed.express,
    paymentReference,
    reserved.reservationId,
    'not_required',
    { type: 'free', brand: null, last4: null },
    parsed.language ?? 'en',
  );
  if (!result.ok) {
    await orders.releaseReservation(pool, reserved.reservationId);
    res
      .status(CHECKOUT_FAILURE_STATUS[result.reason] ?? 409)
      .json({ success: false, error: { code: result.reason } });
    return;
  }
  if (result.created) {
    if (result.guestSaved) {
      await persistGuestSavedCheckout(pool, getStripe(), {
        email: parsed.email,
        orderId: result.order.id,
        intent: result.guestSaved,
      });
    }
    await enqueueOrderConfirmation(pool, {
      userId: result.order.user_id ?? undefined,
      orderId: result.order.id,
      guestLanguage: parsed.language,
    });
  }
  const language = parsed.language ?? requestLanguage(req);
  const trackingAvailable = result.order.courier_code
    ? ((await couriers.trackingAvailableByCode(pool, [result.order.courier_code])).get(
        result.order.courier_code,
      ) ?? false)
    : false;
  res.status(201).json({
    success: true,
    order: await toPublicOrder(result.order, result.items, language, trackingAvailable),
  });
});

/** Fast path once the browser's own stripe.confirmPayment() resolves —
 * re-fetches the PaymentIntent from Stripe and hands off to the same
 * settlePaymentIntent used by the authenticated route and the webhook
 * (already guest-aware, see account.routes.ts). Ownership here is proven by
 * knowledge of the PaymentIntent id itself (opaque, Stripe-issued) plus its
 * guestEmail metadata actually being set — there is no bearer token to
 * compare against the way the authenticated route compares userId. */
guestCheckoutRouter.post('/finalize', checkoutRateLimiter, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
    return;
  }
  const paymentIntentId = boundedToken(req.body?.paymentIntentId);
  if (!paymentIntentId) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const paymentIntent = await retrievePaymentIntent(stripe, paymentIntentId);
  if (!paymentIntent.metadata.guestEmail || paymentIntent.metadata.userId) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'requires_capture') {
    res.status(409).json({ success: false, error: { code: 'payment_not_completed' } });
    return;
  }
  const result = await settlePaymentIntent(stripe, paymentIntent);
  if (!result.ok) {
    res.status(409).json({ success: false, error: { code: result.reason } });
    return;
  }
  const language =
    typeof paymentIntent.metadata.language === 'string' && isLanguage(paymentIntent.metadata.language)
      ? paymentIntent.metadata.language
      : requestLanguage(req);
  const trackingAvailable = result.order.courier_code
    ? ((await couriers.trackingAvailableByCode(pool, [result.order.courier_code])).get(
        result.order.courier_code,
      ) ?? false)
    : false;
  res.status(201).json({
    success: true,
    order: await toPublicOrder(result.order, result.items, language, trackingAvailable),
  });
});

/** Customer closes the payment modal before confirming — same shape as
 * /account/checkout/cancel, ownership proven the same way as /finalize. */
guestCheckoutRouter.post('/cancel', checkoutRateLimiter, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
    return;
  }
  const paymentIntentId = boundedToken(req.body?.paymentIntentId);
  if (!paymentIntentId) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const paymentIntent = await retrievePaymentIntent(stripe, paymentIntentId);
  if (!paymentIntent.metadata.guestEmail || paymentIntent.metadata.userId) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (
    ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(paymentIntent.status)
  ) {
    await cancelPaymentIntent(stripe, paymentIntent.id);
  } else if (paymentIntent.status !== 'canceled') {
    res.status(409).json({ success: false, error: { code: 'payment_not_cancellable' } });
    return;
  }
  await orders.releaseReservationForPaymentIntent(pool, paymentIntent.id);
  res.json({ success: true });
});

/** Immediate client-side counterpart to the Stripe payment_failed webhook —
 * same shape as /account/checkout/release-failed. */
guestCheckoutRouter.post('/release-failed', checkoutRateLimiter, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
    return;
  }
  const paymentIntentId = boundedToken(req.body?.paymentIntentId);
  if (!paymentIntentId) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const paymentIntent = await retrievePaymentIntent(stripe, paymentIntentId);
  if (!paymentIntent.metadata.guestEmail || paymentIntent.metadata.userId) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (paymentIntent.status !== 'requires_payment_method' || !paymentIntent.last_payment_error) {
    res.status(409).json({ success: false, error: { code: 'payment_not_failed' } });
    return;
  }
  await orders.releaseReservationForPaymentIntent(pool, paymentIntent.id);
  res.json({ success: true });
});
