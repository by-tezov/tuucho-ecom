/**
 * Proactive owner alert: mail once per order, `PAYMENT_AUTH_EXPIRY_SPY_BEFORE`
 * ahead of its Stripe authorization hold's *estimated* expiry.
 *
 * Stripe exposes no exact expiry for a manual-capture PaymentIntent, so the
 * estimate is `confirmed_at` (when the hold was authorized) plus an assumed
 * window per payment method: the same ~10-day PayPal window already
 * documented in `platform/stripe/stripeClient.ts`, and the ~7-day window
 * Stripe commonly applies to card networks before auto-canceling an
 * uncaptured hold. Bancontact settles immediately (never `authorized`) and
 * free orders are `not_required`, so neither is queried here.
 *
 * Never captures, cancels, or otherwise decides anything about the payment —
 * see docs/cron/README.md's "no automatic Stripe reconciliation" policy.
 * Idempotent: `payment_auth_expiry_spy_sends` caps this at one mail per order
 * per day, so the cron may run as often as it likes.
 */
import type pg from 'pg';
import { pluginSettingDurationMs } from '../../plugins/application/pluginSettingValues.js';
import { tryInsertPaymentAuthExpirySpySend } from '../infrastructure/paymentAuthExpirySpySends.js';
import { notifyPaymentAuthorizationExpiring } from './orderNotifications.js';
import { getById as getOrderById } from './queries/adminOrderQueries.js';

const BATCH = 100;

/** See this file's own doc comment for why these are estimates, not facts. */
const ASSUMED_HOLD_DAYS = {
  card: 7,
  paypal: 10,
} as const;

function utcDayKey(at = new Date()): string {
  return at.toISOString().slice(0, 10);
}

async function findDueAuthorizations(pool: pg.Pool, beforeMs: number): Promise<string[]> {
  const before = `${beforeMs} milliseconds`;
  const { rows: cardRows } = await pool.query<{ id: string }>(
    `select id from orders
     where payment_capture_status = 'authorized'
       and payment_method_type = 'card'
       and confirmed_at + interval '${ASSUMED_HOLD_DAYS.card} days' > now()
       and confirmed_at + interval '${ASSUMED_HOLD_DAYS.card} days' <= now() + $1::interval
     order by confirmed_at
     limit $2`,
    [before, BATCH],
  );
  const { rows: paypalRows } = await pool.query<{ id: string }>(
    `select id from orders
     where payment_capture_status = 'authorized'
       and payment_method_type = 'paypal'
       and confirmed_at + interval '${ASSUMED_HOLD_DAYS.paypal} days' > now()
       and confirmed_at + interval '${ASSUMED_HOLD_DAYS.paypal} days' <= now() + $1::interval
     order by confirmed_at
     limit $2`,
    [before, BATCH],
  );
  return [...cardRows.map((row) => row.id), ...paypalRows.map((row) => row.id)];
}

export async function processPaymentAuthExpirySpy(pool: pg.Pool): Promise<{ notified: number }> {
  const orderIds = await findDueAuthorizations(
    pool,
    pluginSettingDurationMs('tuucho-payment-stripe', 'paymentAuthExpirySpyBefore', '2d'),
  );
  const day = utcDayKey();
  let notified = 0;
  for (const orderId of orderIds) {
    if (!(await tryInsertPaymentAuthExpirySpySend(pool, orderId, day))) continue;
    const order = await getOrderById(pool, orderId);
    if (!order || order.payment_capture_status !== 'authorized') continue;
    const holdDays = order.payment_method_type === 'paypal' ? ASSUMED_HOLD_DAYS.paypal : ASSUMED_HOLD_DAYS.card;
    const estimatedExpiresAt = new Date(
      new Date(order.confirmed_at).getTime() + holdDays * 86_400_000,
    );
    await notifyPaymentAuthorizationExpiring(order, estimatedExpiresAt);
    notified += 1;
  }
  return { notified };
}
