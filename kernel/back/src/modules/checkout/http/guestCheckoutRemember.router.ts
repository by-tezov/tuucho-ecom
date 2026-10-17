import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { checkoutRateLimiter } from '../../../middleware/rateLimiters.js';
import { rememberGuestCheckoutCard } from '../../orders/application/reservation/rememberGuestCheckoutCard.js';
import { getStripe, retrievePaymentIntent } from '../../../platform/stripe/stripeClient.js';
import { boundedToken } from '../../../utils/fieldLimits.js';

/** Still confirmable: the remember choice has to land before settle, because
 * the first of finalize and the webhook deletes the reservation snapshot. */
const OPENABLE_INTENT_STATUSES: ReadonlySet<string> = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]);

/** POST /checkout/guest/remember-card. Ownership as for /checkout/guest/finalize:
 * the PaymentIntent id plus guest metadata. Records the pay-sheet checkbox. */
export const guestCheckoutRememberRouter = Router();

guestCheckoutRememberRouter.post('/remember-card', checkoutRateLimiter, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(501).json({ success: false, error: { code: 'stripe_not_configured' } });
    return;
  }
  const paymentIntentId = boundedToken(req.body?.paymentIntentId);
  const rememberCard = req.body?.rememberCard;
  if (!paymentIntentId || typeof rememberCard !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const paymentIntent = await retrievePaymentIntent(stripe, paymentIntentId);
  if (!paymentIntent.metadata.guestEmail || paymentIntent.metadata.userId) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (!OPENABLE_INTENT_STATUSES.has(paymentIntent.status)) {
    res.status(409).json({ success: false, error: { code: 'reservation_not_held' } });
    return;
  }
  const result = await rememberGuestCheckoutCard(pool, paymentIntentId, rememberCard);
  if (result === 'not_found') {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (result === 'not_held') {
    res.status(409).json({ success: false, error: { code: 'reservation_not_held' } });
    return;
  }
  res.json({ success: true });
});
