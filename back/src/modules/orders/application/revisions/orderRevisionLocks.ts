import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { type OrderItemRow, type OrderRow } from '../../domain/order.js';
import { attachItems, decryptOrderRow } from '../../infrastructure/orderRows.js';
import {
  REVISION_ELIGIBLE_STATUSES,
  clearLockSql,
  isLockActive,
  latestRevisionNumber,
  lockTtlSeconds,
  lockUntilFromNow,
  orderHasInvoice,
  revisionLimitReached,
  type OrderRevisionLockInfo,
} from './orderRevisionSupport.js';

export type AcquireRevisionLockResult =
  | { ok: true; order: OrderRow; items: OrderItemRow[]; lock: OrderRevisionLockInfo }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'order_not_editable'
        | 'order_revision_locked'
        | 'revision_limit_reached'
        | 'invoice_already_issued'
        | 'content_hash_missing';
      order?: OrderRow;
    };

/** Opens (or refreshes the caller's own) edit lock. Ops set-status refuses
 * while lock_until is in the future. */
export async function acquireRevisionLock(
  pool: pg.Pool,
  userId: string,
  orderId: string,
): Promise<AcquireRevisionLockResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<OrderRow>(
      `select * from orders where id = $1 and user_id = $2 for update`,
      [orderId, userId],
    );
    const order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
    if (!order) {
      await client.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    if (!REVISION_ELIGIBLE_STATUSES.has(order.status)) {
      await client.query('rollback');
      return { ok: false, reason: 'order_not_editable', order };
    }
    if (!order.content_hash) {
      await client.query('rollback');
      return { ok: false, reason: 'content_hash_missing', order };
    }
    if (await orderHasInvoice(client, order.id)) {
      await client.query('rollback');
      return { ok: false, reason: 'invoice_already_issued', order };
    }
    if (revisionLimitReached(await latestRevisionNumber(client, order.id))) {
      await client.query('rollback');
      return { ok: false, reason: 'revision_limit_reached', order };
    }
    if (isLockActive(order) && order.revision_lock_user_id !== userId) {
      await client.query('rollback');
      return { ok: false, reason: 'order_revision_locked', order };
    }

    const token = randomUUID();
    const until = lockUntilFromNow();
    const { rows: updatedRows } = await client.query<OrderRow>(
      `update orders set
         revision_lock_token = $2,
         revision_lock_until = $3,
         revision_lock_user_id = $4,
         revision_lock_baseline_hash = $5,
         updated_at = now()
       where id = $1
       returning *`,
      [order.id, token, until.toISOString(), userId, order.content_hash],
    );
    await client.query('commit');
    const updated = decryptOrderRow(updatedRows[0]!);
    const itemsByOrder = await attachItems(pool, [updated]);
    return {
      ok: true,
      order: updated,
      items: itemsByOrder.get(updated.id) ?? [],
      lock: {
        lockToken: token,
        lockUntil: updated.revision_lock_until!,
        ttlSeconds: lockTtlSeconds(),
      },
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export type ExtendRevisionLockResult =
  | { ok: true; order: OrderRow; items: OrderItemRow[]; lock: OrderRevisionLockInfo }
  | { ok: false; reason: 'not_found' | 'lock_invalid' | 'order_not_editable' };

export async function extendRevisionLock(
  pool: pg.Pool,
  userId: string,
  orderId: string,
  lockToken: string,
): Promise<ExtendRevisionLockResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<OrderRow>(
      `select * from orders where id = $1 and user_id = $2 for update`,
      [orderId, userId],
    );
    const order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
    if (!order) {
      await client.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    if (!REVISION_ELIGIBLE_STATUSES.has(order.status)) {
      await client.query('rollback');
      return { ok: false, reason: 'order_not_editable' };
    }
    if (
      !order.revision_lock_token ||
      order.revision_lock_token !== lockToken ||
      order.revision_lock_user_id !== userId ||
      !isLockActive(order)
    ) {
      await client.query('rollback');
      return { ok: false, reason: 'lock_invalid' };
    }

    const until = lockUntilFromNow();
    const { rows: updatedRows } = await client.query<OrderRow>(
      `update orders set revision_lock_until = $2, updated_at = now() where id = $1 returning *`,
      [order.id, until.toISOString()],
    );
    await client.query('commit');
    const updated = decryptOrderRow(updatedRows[0]!);
    const itemsByOrder = await attachItems(pool, [updated]);
    return {
      ok: true,
      order: updated,
      items: itemsByOrder.get(updated.id) ?? [],
      lock: {
        lockToken: updated.revision_lock_token!,
        lockUntil: updated.revision_lock_until!,
        ttlSeconds: lockTtlSeconds(),
      },
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export type ReleaseRevisionLockResult = { ok: true } | { ok: false; reason: 'not_found' | 'lock_invalid' };

export async function releaseRevisionLock(
  pool: pg.Pool,
  userId: string,
  orderId: string,
  lockToken: string,
): Promise<ReleaseRevisionLockResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<OrderRow>(
      `select * from orders where id = $1 and user_id = $2 for update`,
      [orderId, userId],
    );
    const order = rows[0];
    if (!order) {
      await client.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    if (
      !order.revision_lock_token ||
      order.revision_lock_token !== lockToken ||
      order.revision_lock_user_id !== userId
    ) {
      await client.query('rollback');
      return { ok: false, reason: 'lock_invalid' };
    }
    await client.query(`update orders set ${clearLockSql()}, updated_at = now() where id = $1`, [order.id]);
    await client.query('commit');
    return { ok: true };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
