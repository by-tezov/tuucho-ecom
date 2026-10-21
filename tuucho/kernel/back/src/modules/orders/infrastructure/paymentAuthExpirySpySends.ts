import { randomUUID } from 'node:crypto';
import type pg from 'pg';

/** One row per `(order_id, day)` — at most one payment-authorization-expiry
 * spy mail per order per day, so the cron can run as often as it likes
 * without double-mailing. Same shape as gift's `gift_reminder_sends`. */
export async function tryInsertPaymentAuthExpirySpySend(
  db: pg.Pool | pg.PoolClient,
  orderId: string,
  day: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `insert into payment_auth_expiry_spy_sends (id, order_id, day)
     values ($1, $2, $3::date)
     on conflict (order_id, day) do nothing`,
    [randomUUID(), orderId, day],
  );
  return (rowCount ?? 0) > 0;
}
