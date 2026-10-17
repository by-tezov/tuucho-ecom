import type pg from 'pg';
import { extendLoyaltyHold } from '../../../plugins/application/pluginBridges.js';
import { extendVoucherHoldsForReservation } from '../../../plugins/application/pluginBridges.js';

/** RGAA 13.1 / WCAG 2.2.1 (timing adjustable): the payment confirmation warns
 * before its stock hold runs out and lets the customer extend it with one
 * action, at least ten times. Each extension restarts a full
 * STOCK_RESERVATION_TTL from now, never beyond this many TTLs after the hold
 * was created, so an open tab cannot keep stock away from other customers
 * indefinitely. */
export const RESERVATION_MAX_EXTENSIONS = 10;

/** An extension asked for this close to expiry is refused. The temporary
 * snapshot purge judges "expired" from its own `now()`, so without a margin
 * an extension racing the purge could keep a hold whose snapshot is gone. */
const EXTENSION_SAFETY_MARGIN_MS = 5_000;

export type ExtendReservationResult = { ok: true; expiresAt: Date } | { ok: false };

/** Extends the still-held checkout reservation linked to one unconfirmed
 * PaymentIntent, with its voucher and loyalty holds, in one transaction. The
 * caller has already proven ownership and checked the intent with Stripe;
 * nothing here waits on the network. `{ ok: false }` covers a hold that was
 * released, consumed, expired, too close to expiry or past its last
 * extension. */
export async function extendReservationForPaymentIntent(
  pool: pg.Pool,
  paymentIntentId: string,
  ttlMs: number,
): Promise<ExtendReservationResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<{ id: string; expires_at: Date }>(
      `update stock_reservations
          set expires_at = now() + make_interval(secs => $2::double precision / 1000),
              updated_at = now()
        where stripe_payment_intent_id = $1
          and state = 'held'
          and purpose = 'checkout'
          and expires_at > now() + make_interval(secs => $3::double precision / 1000)
          and created_at > now() - make_interval(secs => $4::double precision / 1000)
        returning id, expires_at`,
      [paymentIntentId, ttlMs, EXTENSION_SAFETY_MARGIN_MS, ttlMs * (RESERVATION_MAX_EXTENSIONS + 1)],
    );
    const row = rows[0];
    if (!row) {
      await client.query('rollback');
      return { ok: false };
    }
    await extendVoucherHoldsForReservation(client, row.id, row.expires_at);
    await extendLoyaltyHold(client, row.id, row.expires_at);
    await client.query('commit');
    return { ok: true, expiresAt: row.expires_at };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
