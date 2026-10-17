import type pg from 'pg';

const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PURGE_BATCH = 5000;
let nextMaintenanceAt = 0;
let maintenanceInFlight: Promise<void> | undefined;

/** Deletes stock reservations that can never matter again, so the stock
 * reads that sum reservation items for every variant (gallery cards, filters,
 * sitemap, cart, checkout) stop wading through every abandoned checkout ever
 * made: a released hold used to be kept forever.
 *
 * Only rows nothing can come back for are removed: released for a day, or
 * held and expired for a day, with no PaymentIntent (a late signed webhook
 * settles through the reservation linked to its PaymentIntent), no order, and
 * no gift offer pointing at them. Their items, checkout snapshot, voucher and
 * loyalty holds go with them (ON DELETE CASCADE). Bounded per run. */
async function purgeDeadStockReservations(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: lockRows } = await client.query<{ locked: boolean }>(
      // Postgres 10 (LWS): two-int lock + hashtext, not hashtextextended.
      `select pg_try_advisory_xact_lock(87224, hashtext('stock-reservation-maintenance')) as locked`,
    );
    if (!lockRows[0]?.locked) {
      await client.query('rollback');
      return;
    }
    await client.query(
      `delete from stock_reservations
       where id in (
         select r.id from stock_reservations r
         where r.stripe_payment_intent_id is null
           and r.order_id is null
           and (
             (r.state = 'released' and r.updated_at < now() - interval '1 day')
             or (r.state = 'held' and r.expires_at < now() - interval '1 day')
           )
           and not exists (select 1 from gift_offers g where g.stock_reservation_id = r.id)
         limit $1
       )`,
      [PURGE_BATCH],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Opportunistic, same discipline as scheduleAuthArtifactMaintenance: at most
 * one best-effort run per process every six hours, started when a checkout
 * reservation is made, never awaited by the request. */
export function scheduleStockReservationMaintenance(pool: pg.Pool): void {
  const now = Date.now();
  if (now < nextMaintenanceAt || maintenanceInFlight) return;
  nextMaintenanceAt = now + MAINTENANCE_INTERVAL_MS;
  maintenanceInFlight = purgeDeadStockReservations(pool)
    .catch((error) => {
      console.error('[reservation maintenance] dead reservation purge failed', error);
      nextMaintenanceAt = 0;
    })
    .finally(() => {
      maintenanceInFlight = undefined;
    });
}
