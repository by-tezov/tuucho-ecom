import type pg from 'pg';
import { releaseVoucherHoldsForReservations } from '../../../vouchers/application/vouchers.js';
import { releaseLoyaltyHold } from '../../../loyalty/application/loyalty.js';
import {
  decryptCheckoutReservationSnapshot,
  purgeTemporaryCheckoutReservationSnapshots,
} from './checkoutReservationSnapshot.js';

export async function attachPaymentIntentToReservation(
  pool: pg.Pool,
  reservationId: string,
  paymentIntentId: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update stock_reservations
     set stripe_payment_intent_id = $2, updated_at = now()
     where id = $1 and state = 'held' and expires_at > now() and stripe_payment_intent_id is null`,
    [reservationId, paymentIntentId],
  );
  return rowCount === 1;
}

export interface PaymentSettlementReservation {
  reservationId: string;
  userId: string | null;
  guestEmail: string | null;
  expectedAmountCents: number | null;
}

/** Recover settlement ownership from the database link to the signed Stripe
 * object. Metadata remains a useful cross-check, but is no longer the only
 * place the owner and reservation id exist. */
export async function findPaymentSettlementReservation(
  pool: pg.Pool,
  paymentIntentId: string,
): Promise<PaymentSettlementReservation | undefined> {
  const { rows } = await pool.query<{ id: string; user_id: string | null; snapshot: unknown }>(
    `select reservation.id, reservation.user_id, snapshot.snapshot
       from stock_reservations reservation
       left join checkout_reservation_snapshots snapshot on snapshot.reservation_id = reservation.id
      where reservation.stripe_payment_intent_id = $1
      order by reservation.created_at desc
      limit 1`,
    [paymentIntentId],
  );
  const row = rows[0];
  if (!row) return undefined;
  const snapshot = row.snapshot ? decryptCheckoutReservationSnapshot(row.snapshot) : null;
  return {
    reservationId: row.id,
    userId: row.user_id,
    guestEmail: row.user_id ? null : (snapshot?.guestEmail ?? null),
    expectedAmountCents: snapshot ? Math.round(Number(snapshot.priced.total) * 100) : null,
  };
}

/** Releases only an unpaid hold. Paid allocations are released explicitly by
 * the order-edit/cancel flows that change the purchased line items. */
export async function releaseReservation(pool: pg.Pool, reservationId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await releaseLoyaltyHold(client, reservationId);
    await releaseVoucherHoldsForReservations(client, [reservationId]);
    await client.query(
      `update stock_reservations set state = 'released', updated_at = now()
       where id = $1 and state = 'held'`,
      [reservationId],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  await purgeTemporaryCheckoutReservationSnapshots(pool, reservationId);
}

/** A failed Stripe PaymentIntent can never turn into an order. Release only
 * the still-held reservation linked to that exact intent; webhook retries are
 * harmless and cannot release a newer reservation for the same cart. */
export async function releaseReservationForPaymentIntent(
  pool: pg.Pool,
  paymentIntentId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<{ id: string }>(
      `select id from stock_reservations
       where stripe_payment_intent_id = $1 and state = 'held'
       for update`,
      [paymentIntentId],
    );
    for (const row of rows) await releaseLoyaltyHold(client, row.id);
    await releaseVoucherHoldsForReservations(
      client,
      rows.map((row) => row.id),
    );
    await client.query(
      `update stock_reservations set state = 'released', updated_at = now()
       where stripe_payment_intent_id = $1 and state = 'held'`,
      [paymentIntentId],
    );
    await client.query(
      `delete from checkout_reservation_snapshots
        where reservation_id = any($1::uuid[])`,
      [rows.map((row) => row.id)],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  await purgeTemporaryCheckoutReservationSnapshots(pool);
}
