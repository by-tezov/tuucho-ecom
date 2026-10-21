/**
 * Orders' slot in the mail queue. See gift/application/giftMailJob.ts for why
 * the deliverer is registered from the feature side rather than dispatched
 * inside `messaging`.
 */
import type pg from 'pg';
import { pool } from '../../../db/pool.js';
import type { Language } from '../../../utils/language.js';
import { enqueueMailJob, registerMailJobDeliverer, wakeMailJobWorker } from '../../messaging/application/mailJobs.js';
import { getById as getOrderById } from './queries/adminOrderQueries.js';
import { attachItems } from './orderItems.js';
import { sendOrderConfirmation } from './orderNotifications.js';

const ORDER_CONFIRMATION_MAIL = 'order_confirmation';

/** Only the order id is queued: the confirmation renders from the order as it
 * stands when the mail is actually sent, not from a snapshot taken at enqueue
 * time. */
type OrderConfirmationPayload = {
  userId?: string;
  orderId: string;
  guestLanguage?: Language;
};

export async function enqueueOrderConfirmation(
  db: pg.Pool | pg.PoolClient,
  input: { userId?: string; orderId: string; guestLanguage?: Language },
): Promise<string> {
  const payload: OrderConfirmationPayload = {
    ...(input.userId ? { userId: input.userId } : {}),
    orderId: input.orderId,
    ...(input.guestLanguage ? { guestLanguage: input.guestLanguage } : {}),
  };
  return enqueueMailJob(db, ORDER_CONFIRMATION_MAIL, payload);
}

/** Enqueues the confirmation once per order, however many times settlement
 * runs for it (webhook retry, browser finalize racing the webhook, a crash
 * between order creation and enqueue). Serialized per order by an advisory
 * lock; the lookup is bounded to recent jobs (mail_jobs_kind_created_idx),
 * which is all a settlement retry can need. */
export async function ensureOrderConfirmationEnqueued(
  db: pg.Pool,
  input: { userId?: string; orderId: string; guestLanguage?: Language },
): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(87223, hashtext($1))`, [input.orderId]);
    const { rows } = await client.query(
      `select 1 from mail_jobs
       where kind = $1 and created_at > now() - interval '7 days' and payload->>'orderId' = $2
       limit 1`,
      [ORDER_CONFIRMATION_MAIL, input.orderId],
    );
    if (rows.length === 0) await enqueueOrderConfirmation(client, input);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  // The insert wakes the worker before commit, while the row is still
  // invisible. Wake again now that the job is committed.
  wakeMailJobWorker();
}

registerMailJobDeliverer(ORDER_CONFIRMATION_MAIL, async (raw) => {
  const payload = raw as OrderConfirmationPayload;
  const order = await getOrderById(pool, payload.orderId);
  if (!order) throw new Error(`order_not_found:${payload.orderId}`);
  const items = (await attachItems(pool, [order])).get(order.id) ?? [];
  await sendOrderConfirmation(
    payload.userId ?? order.user_id ?? undefined,
    order,
    items,
    payload.guestLanguage,
  );
});
