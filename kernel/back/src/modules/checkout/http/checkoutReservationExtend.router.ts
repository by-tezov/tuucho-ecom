import { Router, type Response } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { checkoutRateLimiter } from '../../../middleware/rateLimiters.js';
import * as orders from '../../orders/application/ordersFacade.js';
import { getStripe, retrievePaymentIntent } from '../../../platform/stripe/stripeClient.js';
import { boundedToken } from '../../../utils/fieldLimits.js';

/** The intent states a customer can still confirm, so the only ones whose
 * stock hold is worth extending. */
const EXTENDABLE_INTENT_STATUSES: ReadonlySet<string> = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]);

/** The payment modal warns before its stock hold expires and offers to extend
 * it (RGAA 13.1, timing adjustable). Only a still-unconfirmed intent the
 * caller owns can extend. Each call restarts STOCK_RESERVATION_TTL from now,
 * a bounded number of times (RESERVATION_MAX_EXTENSIONS). The Stripe read
 * happens before the database transaction, never inside it. */
async function extendCheckoutReservation(
  res: Response,
  rawPaymentIntentId: unknown,
  ownsIntent: (paymentIntent: any) => boolean,
): Promise<void> {
  const stripe = getStripe();
  if (!stripe) {
    res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
    return;
  }
  const paymentIntentId = boundedToken(rawPaymentIntentId);
  if (!paymentIntentId) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const paymentIntent = await retrievePaymentIntent(stripe, paymentIntentId);
  if (!ownsIntent(paymentIntent)) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const extended = EXTENDABLE_INTENT_STATUSES.has(paymentIntent.status)
    ? await orders.extendReservationForPaymentIntent(pool, paymentIntent.id, config.stockReservationTtlMs)
    : null;
  if (!extended?.ok) {
    res.status(409).json({ success: false, error: { code: 'reservation_not_extendable' } });
    return;
  }
  res.json({ success: true, reservationExpiresAt: extended.expiresAt.toISOString() });
}

/** POST /account/checkout/extend. Ownership as for /account/checkout/cancel. */
export const accountCheckoutExtendRouter = Router();

accountCheckoutExtendRouter.post('/checkout/extend', requireAuth, checkoutRateLimiter, async (req, res) => {
  await extendCheckoutReservation(
    res,
    req.body?.paymentIntentId,
    (paymentIntent) => paymentIntent.metadata.userId === req.user!.id,
  );
});

/** POST /checkout/guest/extend. Ownership as for /checkout/guest/cancel. */
export const guestCheckoutExtendRouter = Router();

guestCheckoutExtendRouter.post('/extend', checkoutRateLimiter, async (req, res) => {
  await extendCheckoutReservation(
    res,
    req.body?.paymentIntentId,
    (paymentIntent) => Boolean(paymentIntent.metadata.guestEmail) && !paymentIntent.metadata.userId,
  );
});
