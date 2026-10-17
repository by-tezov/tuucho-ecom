import { Router } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { checkoutRateLimiter } from '../../../middleware/rateLimiters.js';
import { isShopPaymentMethodEnabled, warmAppPreferences } from '../../settings/application/appPreferences.js';
import { isPaymentMethodAvailableForCheckout } from '../../payments/application/cardRetention.js';
import * as couriers from '../../delivery/application/couriers.js';
import * as orders from '../../orders/application/ordersFacade.js';
import {
  createCheckoutIntent,
  getOrCreateCustomerId,
  getStripe,
} from '../../../platform/stripe/stripeClient.js';
import { boundedToken, boundedVoucherCode } from '../../../utils/fieldLimits.js';
import { requestLanguage } from '../../../utils/language.js';
import { isNonEmptyString } from '../../../utils/validate.js';
import { enqueueOrderConfirmation } from '../../orders/application/orderMailJob.js';
import { toPublicOrder } from '../../orders/presentation/orderPresenter.js';
import { parseCheckoutPaymentMethod } from '../../payments/application/paymentPreferences.js';
import { assertShopPaymentMethodAllowedForCheckout } from '../../payments/application/paymentCheckoutValidation.js';
import { settlePaymentIntent } from '../../settlement/application/settlePayment.js';
import { CHECKOUT_FAILURE_STATUS } from '../../commerce/application/checkoutFailureStatus.js';
import { resolveCheckoutIntentMethod } from '../application/checkoutIntentMethod.js';
import { requireAccountCheckoutSession } from './accountCheckoutSession.js';
import { accountCheckoutVoucherRouter } from './accountCheckoutVoucher.router.js';
import {
  accountCheckoutAddressFailure,
  bindGiftOrderFromReservation,
  reserveAccountCart,
} from '../../gift/application/giftCheckout.js';
import { GiftFailure } from '../../gift/domain/errors.js';

export const accountCheckoutRouter = Router();
accountCheckoutRouter.use(accountCheckoutVoucherRouter);

function shopPaymentForbiddenResponse(res: import('express').Response): void {
  res.status(403).json({ success: false, error: { code: 'payment_method_forbidden' } });
}

async function reserveAccountCartOrFail(
  res: import('express').Response,
  userId: string,
  addressId: string,
  courierCode: string,
  express: boolean,
  voucherCode: string | undefined,
  billingAddressId: string | undefined,
  applyLoyalty: boolean,
): Promise<orders.ReserveCartResult | null> {
  try {
    return await reserveAccountCart(
      pool,
      userId,
      addressId,
      courierCode,
      express,
      config.stockReservationTtlMs,
      voucherCode,
      billingAddressId,
      applyLoyalty,
    );
  } catch (error) {
    if (error instanceof GiftFailure) {
      res.status(error.httpStatus).json({ success: false, error: { code: error.code } });
      return null;
    }
    throw error;
  }
}

/** Atomically reserves the caller's cart against stock, then opens a Stripe
 * PaymentIntent for that fixed checkout attempt. The reservation expires
 * after STOCK_RESERVATION_TTL unless payment succeeds; carts themselves do
 * not reserve stock.
 *
 * `method`:
 * - `'paypal'` — PayPal-only PaymentIntent (`payment_method_types: ['paypal']`,
 *   manual capture)
 * - `'bancontact'` — Bancontact-only PaymentIntent
 *   (`payment_method_types: ['bancontact']`, automatic capture — Stripe does
 *   not support Bancontact manual capture)
 * - `'google_pay'` / `'apple_pay'` — one-off card/wallet PaymentIntent
 *   (`automatic_payment_methods`, no `paymentMethodId`, no
 *   `setup_future_usage`); the front confirms via Express Checkout Element
 * - `'new_card'` — card-only PaymentIntent (`payment_method_types: ['card']`,
 *   `setup_future_usage: on_session`, no `paymentMethodId`); the front
 *   collects the card in the pay sheet and confirms against the order amount
 * - omitted + `paymentMethodId` — saved / one-time card
 *
 * Card / PayPal / wallets use `capture_method=manual`. Bancontact uses
 * automatic capture. The front requests the intent only after the customer
 * opens the matching confirmation dialog. */
accountCheckoutRouter.post(
  '/checkout/create-intent',
  requireAuth,
  requireAccountCheckoutSession,
  checkoutRateLimiter,
  async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
      res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
      return;
    }

    const body = req.body ?? {};
    const addressId = isNonEmptyString(body.addressId) ? body.addressId : undefined;
    const billingAddressId = isNonEmptyString(body.billingAddressId) ? body.billingAddressId : undefined;
    const courierCode = isNonEmptyString(body.courierCode) ? body.courierCode : undefined;
    const voucherCode = boundedVoucherCode(body.voucherCode);
    const express = body.express === true;
    const applyLoyalty = body.applyLoyalty === true;
    const checkoutMethod = parseCheckoutPaymentMethod(body.method);
    if (body.method !== undefined && body.method !== null && body.method !== '' && !checkoutMethod) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const {
      paymentMethodTypes,
      shopMethod,
      requiresPaymentMethodId,
      setupFutureUsage,
    } = resolveCheckoutIntentMethod(checkoutMethod);
    const paymentMethodId = requiresPaymentMethodId ? boundedToken(body.paymentMethodId) : null;
    if (!addressId || !courierCode) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    if (requiresPaymentMethodId && !paymentMethodId) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    if (
      body.voucherCode !== undefined &&
      body.voucherCode !== null &&
      !(typeof body.voucherCode === 'string' && body.voucherCode.trim() === '') &&
      !voucherCode
    ) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const sessionId = res.locals.checkoutPrivacySessionId as string;
    // Shop-wide admin flags and per-method country lists gate create-intent.
    // Account payment toggles only affect primary placement (+more still works).
    await warmAppPreferences();
    if (!isShopPaymentMethodEnabled(shopMethod)) {
      shopPaymentForbiddenResponse(res);
      return;
    }
    if (
      paymentMethodId &&
      !(await isPaymentMethodAvailableForCheckout(pool, req.user!.id, paymentMethodId, sessionId))
    ) {
      res.status(409).json({ success: false, error: { code: 'payment_method_not_available' } });
      return;
    }
    const addressFailure = await accountCheckoutAddressFailure(
      pool,
      req.user!.id,
      sessionId,
      addressId,
      billingAddressId,
    );
    if (addressFailure) {
      res
        .status(CHECKOUT_FAILURE_STATUS[addressFailure] ?? 404)
        .json({ success: false, error: { code: addressFailure } });
      return;
    }
    const paymentAllowed = await assertShopPaymentMethodAllowedForCheckout(pool, shopMethod);
    if (!paymentAllowed.ok) {
      res.status(403).json({ success: false, error: { code: paymentAllowed.code } });
      return;
    }

    const customerId = await getOrCreateCustomerId(pool, stripe, req.user!.id);
    const reserved = await reserveAccountCartOrFail(
      res,
      req.user!.id,
      addressId,
      courierCode,
      express,
      voucherCode,
      billingAddressId,
      applyLoyalty,
    );
    if (!reserved) return;
    if (!reserved.ok) {
      res
        .status(CHECKOUT_FAILURE_STATUS[reserved.reason] ?? 400)
        .json({ success: false, error: { code: reserved.reason } });
      return;
    }

    // Stripe cannot create a zero-value PaymentIntent. The browser must use
    // the explicit /checkout/free endpoint after the customer presses Payer;
    // release this provisional hold rather than leaving it to expire.
    if (reserved.priced.total === 0) {
      await orders.releaseReservation(pool, reserved.reservationId);
      res.status(409).json({ success: false, error: { code: 'free_checkout_required' } });
      return;
    }

    try {
      const paymentIntent = await createCheckoutIntent(
        stripe,
        customerId,
        reserved.priced.total,
        {
          userId: req.user!.id,
          addressId,
          courierCode,
          express: String(express),
          reservationId: reserved.reservationId,
          ...(voucherCode ? { voucherCode } : {}),
          ...(billingAddressId ? { billingAddressId } : {}),
          ...(paymentMethodId ? { paymentMethodId } : {}),
        },
        paymentMethodTypes,
        reserved.reservationId,
        setupFutureUsage,
      );
      const linked = await orders.attachPaymentIntentToReservation(
        pool,
        reserved.reservationId,
        paymentIntent.id,
      );
      if (!linked)
        throw new Error(
          `checkout reservation ${reserved.reservationId} could not be linked to ${paymentIntent.id}`,
        );
      res.json({
        success: true,
        clientSecret: paymentIntent.clientSecret,
        // The client closes its payment modal at this exact server-defined
        // instant. It must never leave a visible Payer button after the stock
        // allocation has expired.
        reservationExpiresAt: reserved.expiresAt,
        amount: reserved.priced.total,
        voucher: reserved.priced.voucher,
        subtotal: reserved.priced.subtotal,
        shippingListFee: reserved.priced.shippingListFee,
        shippingFee: reserved.priced.shippingFee,
        rulesItemDiscount: reserved.priced.rulesItemDiscount,
        loyaltyCredit: reserved.priced.loyaltyCredit,
        loyaltyEarn: reserved.priced.loyaltyEarn,
      });
    } catch (error) {
      await orders.releaseReservation(pool, reserved.reservationId);
      throw error;
    }
  },
);

/** Customer closes a payment modal before confirming it. Cancel only an
 * unconfirmed Stripe intent owned by that customer, then release its exact
 * stock/voucher hold immediately instead of waiting for the reservation TTL.
 * An authorized/captured payment is deliberately never cancellable here. */
accountCheckoutRouter.post('/checkout/cancel', requireAuth, checkoutRateLimiter, async (req, res) => {
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
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.metadata.userId !== req.user!.id) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (
    ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(paymentIntent.status)
  ) {
    await stripe.paymentIntents.cancel(paymentIntent.id);
  } else if (paymentIntent.status !== 'canceled') {
    res.status(409).json({ success: false, error: { code: 'payment_not_cancellable' } });
    return;
  }
  await orders.releaseReservationForPaymentIntent(pool, paymentIntent.id);
  res.json({ success: true });
});

/** Confirms a voucher-covered €0 checkout after an explicit customer click.
 * It shares the same stock/voucher reservation and authoritative re-pricing
 * as a paid checkout, but deliberately never calls Stripe. */
accountCheckoutRouter.post(
  '/checkout/free',
  requireAuth,
  requireAccountCheckoutSession,
  checkoutRateLimiter,
  async (req, res) => {
    const body = req.body ?? {};
    const addressId = isNonEmptyString(body.addressId) ? body.addressId : undefined;
    const billingAddressId = isNonEmptyString(body.billingAddressId) ? body.billingAddressId : undefined;
    const courierCode = isNonEmptyString(body.courierCode) ? body.courierCode : undefined;
    const voucherCode = boundedVoucherCode(body.voucherCode);
    const express = body.express === true;
    const applyLoyalty = body.applyLoyalty === true;
    if (!addressId || !courierCode) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    if (
      body.voucherCode !== undefined &&
      body.voucherCode !== null &&
      !(typeof body.voucherCode === 'string' && body.voucherCode.trim() === '') &&
      !voucherCode
    ) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const addressFailure = await accountCheckoutAddressFailure(
      pool,
      req.user!.id,
      res.locals.checkoutPrivacySessionId as string,
      addressId,
      billingAddressId,
    );
    if (addressFailure) {
      res
        .status(CHECKOUT_FAILURE_STATUS[addressFailure] ?? 404)
        .json({ success: false, error: { code: addressFailure } });
      return;
    }

    const reserved = await reserveAccountCartOrFail(
      res,
      req.user!.id,
      addressId,
      courierCode,
      express,
      voucherCode,
      billingAddressId,
      applyLoyalty,
    );
    if (!reserved) return;
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

    // confirmOrder uses the linked payment reference as its idempotency key.
    // The reservation UUID produces an opaque, collision-free reference while
    // making it explicit that no Stripe PaymentIntent exists for this order.
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
    const result = await orders.confirmOrder(
      pool,
      req.user!.id,
      addressId,
      courierCode,
      express,
      paymentReference,
      reserved.reservationId,
      voucherCode,
      billingAddressId,
      'not_required',
      { type: 'free', brand: null, last4: null },
    );
    if (!result.ok) {
      await orders.releaseReservation(pool, reserved.reservationId);
      res
        .status(CHECKOUT_FAILURE_STATUS[result.reason] ?? 409)
        .json({ success: false, error: { code: result.reason } });
      return;
    }
    if (result.created) {
      await bindGiftOrderFromReservation(pool, reserved.reservationId, result.order.id);
      const { rows: giftRows } = await pool.query<{ gift_offer_id: string | null; gift_snapshot: unknown }>(
        `select gift_offer_id, gift_snapshot from orders where id = $1`,
        [result.order.id],
      );
      if (giftRows[0]) {
        result.order.gift_offer_id = giftRows[0].gift_offer_id;
        result.order.gift_snapshot = giftRows[0].gift_snapshot;
      }
      await enqueueOrderConfirmation(pool, {
        userId: req.user!.id,
        orderId: result.order.id,
      });
    }
    const freeTrackingAvailable = result.order.courier_code
      ? ((await couriers.trackingAvailableByCode(pool, [result.order.courier_code])).get(
          result.order.courier_code,
        ) ?? false)
      : false;
    res.status(201).json({
      success: true,
      order: await toPublicOrder(result.order, result.items, requestLanguage(req), freeTrackingAvailable),
    });
  },
);

/**
 * Immediate client-side counterpart to the Stripe payment_failed webhook.
 * A declined card leaves the browser with a Stripe error before webhook
 * delivery is guaranteed. Re-fetch the intent server-side, prove that it is
 * the caller's failed intent, then release only its linked held reservation.
 * The webhook remains an idempotent durable fallback for closed tabs.
 */
accountCheckoutRouter.post('/checkout/release-failed', requireAuth, checkoutRateLimiter, async (req, res) => {
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

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.metadata.userId !== req.user!.id) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  // A fresh intent is normally `requires_confirmation`; it must never be
  // releasable by a client. Stripe puts a declined confirmation back into
  // `requires_payment_method` and supplies the concrete failure.
  if (paymentIntent.status !== 'requires_payment_method' || !paymentIntent.last_payment_error) {
    res.status(409).json({ success: false, error: { code: 'payment_not_failed' } });
    return;
  }

  await orders.releaseReservationForPaymentIntent(pool, paymentIntent.id);
  res.json({ success: true });
});

/** Fast path once the browser's own stripe.confirmPayment() call resolves
 * successfully — re-fetches the PaymentIntent from Stripe (never trusts a
 * client-asserted "it succeeded") and, if authorized (`requires_capture`)
 * or fully captured (`succeeded`), hands off to settlePaymentIntent. The
 * webhook is the durable backstop whenever this call never happens. */
accountCheckoutRouter.post('/checkout/finalize', requireAuth, checkoutRateLimiter, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
    return;
  }

  const body = req.body ?? {};
  const paymentIntentId = boundedToken(body.paymentIntentId);
  if (!paymentIntentId) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  // Ownership check: this PaymentIntent's metadata must name the calling
  // user — a 404 here (rather than 403) avoids confirming to a caller
  // whether some other user's paymentIntentId even exists.
  if (paymentIntent.metadata.userId !== req.user!.id) {
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
  const finalizeTrackingAvailable = result.order.courier_code
    ? ((await couriers.trackingAvailableByCode(pool, [result.order.courier_code])).get(
        result.order.courier_code,
      ) ?? false)
    : false;
  res.status(201).json({
    success: true,
    order: await toPublicOrder(result.order, result.items, requestLanguage(req), finalizeTrackingAvailable),
  });
});
