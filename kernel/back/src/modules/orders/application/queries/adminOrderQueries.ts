import type pg from 'pg';
import {
  grantDueOrderEarnsForUserInTransaction,
  grantPendingOrderEarn,
} from '../../../plugins/application/pluginBridges.js';
import {
  type AdminOrderListRow,
  type AdminOrderRow,
  type OrderItemRow,
  type OrderRow,
  type OrderStatus,
} from '../../domain/order.js';
import { attachItems, decryptAdminOrderRow, decryptOrderRow } from '../../infrastructure/orderRows.js';

// --- Admin (OPS_TOKEN) ---

/** Ops-only lookup by id, no user-ownership check (unlike getForUser) — for
 * admin routes that already have the id from an earlier /operation/orders
 * listing, e.g. PATCH /operation/orders/:id/tracking's status guard. */
export async function getById(pool: pg.Pool, orderId: string): Promise<OrderRow | undefined> {
  const { rows } = await pool.query<OrderRow>(`select * from orders where id = $1`, [orderId]);
  return rows[0] ? decryptOrderRow(rows[0]) : undefined;
}

export async function listAllOrders(
  pool: pg.Pool,
  status: OrderStatus | undefined,
): Promise<{ order: AdminOrderRow; items: OrderItemRow[] }[]> {
  const { rows: orders } = status
    ? await pool.query<AdminOrderRow>(
        `select orders.*, users.email as user_email, users.first_name as user_first_name,
                users.last_name as user_last_name, users.phone as user_phone
         from orders
         left join users on users.id = orders.user_id
         where orders.status = $1
         order by orders.created_at asc`,
        [status],
      )
    : await pool.query<AdminOrderRow>(
        `select orders.*, users.email as user_email, users.first_name as user_first_name,
                users.last_name as user_last_name, users.phone as user_phone
         from orders
         left join users on users.id = orders.user_id
         where orders.status not in ('need_review', 'return_review')
         order by orders.created_at asc`,
      );
  const itemsByOrder = await attachItems(pool, orders);
  return orders.map((order) => {
    const decrypted = decryptAdminOrderRow(order);
    return { order: decrypted, items: itemsByOrder.get(order.id) ?? [] };
  });
}

/** Small fulfillment queue page for the browser administration UI. Order
 * items are deliberately not joined here: their snapshot and media checks are
 * loaded only when the administrator opens one order.
 * `verified` filters `admin_verified_at` and is only meaningful for terminal
 * statuses (`received` / `cancelled`); callers must validate that pairing. */
export async function listAdminOrdersPage(
  pool: pg.Pool,
  status: OrderStatus,
  page: number,
  pageSize: number,
  verified?: boolean,
): Promise<{ orders: AdminOrderListRow[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const verifiedSql =
    verified === undefined
      ? ''
      : verified
        ? ' and orders.admin_verified_at is not null'
        : ' and orders.admin_verified_at is null';
  const [{ rows: orders }, { rows: countRows }] = await Promise.all([
    pool.query<AdminOrderListRow>(
      `select orders.*, users.email as user_email, users.first_name as user_first_name,
              users.last_name as user_last_name, users.phone as user_phone,
              coalesce((select sum(quantity) from order_items where order_id = orders.id and origin = 'user'), 0)::text as item_count
       from orders
       left join users on users.id = orders.user_id
       where orders.status = $1${verifiedSql}
       order by orders.created_at asc
       limit $2 offset $3`,
      [status, pageSize, offset],
    ),
    pool.query<{ total: string }>(
      `select count(*)::text as total from orders where status = $1${verifiedSql}`,
      [status],
    ),
  ]);
  return {
    orders: orders.map((order) => decryptAdminOrderRow(order) as AdminOrderListRow),
    total: Number(countRows[0]?.total ?? 0),
  };
}

/** Compact all-status order history for one browser-admin customer card. The
 * detailed order snapshot stays behind getAdminOrderById and is only loaded
 * once an administrator opens one row. */
export interface AdminUserOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  confirmedAt: string;
  adminVerified: boolean;
}

export async function listAdminOrdersForUserPage(
  pool: pg.Pool,
  userId: string,
  page: number,
  pageSize: number,
): Promise<{ orders: AdminUserOrderSummary[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query<{
      id: string;
      order_number: string;
      status: OrderStatus;
      total: string;
      confirmed_at: string;
      admin_verified_at: string | null;
    }>(
      `select id, order_number, status, total, confirmed_at, admin_verified_at
       from orders
       where user_id = $1
       order by confirmed_at desc, id desc
       limit $2 offset $3`,
      [userId, pageSize, offset],
    ),
    pool.query<{ total: string }>(`select count(*)::text as total from orders where user_id = $1`, [userId]),
  ]);
  return {
    orders: rows.map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      total: Number(row.total),
      confirmedAt: row.confirmed_at,
      adminVerified: row.admin_verified_at !== null,
    })),
    total: Number(countRows[0]?.total ?? 0),
  };
}

export interface AdminOrderAttentionCounts {
  confirmed: number;
  disponible: number;
  needReview: number;
  returnReview: number;
  receivedUnverified: number;
  cancelledUnverified: number;
}

/** Counts driving the admin-hub Orders tile badges. */
export async function getAdminOrderAttentionCounts(pool: pg.Pool): Promise<AdminOrderAttentionCounts> {
  const { rows } = await pool.query<{
    confirmed: string;
    disponible: string;
    need_review: string;
    return_review: string;
    received_unverified: string;
    cancelled_unverified: string;
  }>(
    // One scalar subquery per badge, each matching a partial attention index
    // (orders_attention_*, orders_*_review_attention_idx). A single
    // `count(*) filter (...) from orders` always scanned the whole table, so
    // those indexes were never used.
    `select
       (select count(*) from orders where status = 'confirmed')::text as confirmed,
       (select count(*) from orders where status = 'disponible')::text as disponible,
       (select count(*) from orders where status = 'need_review')::text as need_review,
       (select count(*) from orders where status = 'return_review')::text as return_review,
       (select count(*) from orders
         where status = 'received' and admin_verified_at is null)::text as received_unverified,
       (select count(*) from orders
         where status = 'cancelled' and admin_verified_at is null)::text as cancelled_unverified`,
  );
  const row = rows[0];
  return {
    confirmed: Number(row?.confirmed ?? 0),
    disponible: Number(row?.disponible ?? 0),
    needReview: Number(row?.need_review ?? 0),
    returnReview: Number(row?.return_review ?? 0),
    receivedUnverified: Number(row?.received_unverified ?? 0),
    cancelledUnverified: Number(row?.cancelled_unverified ?? 0),
  };
}

export type VerifyAdminOrderResult =
  | { ok: true; order: AdminOrderRow; items: OrderItemRow[] }
  | { ok: false; reason: 'not_found' | 'invalid_status' | 'already_verified' };

/** One-way admin acknowledgement for terminal orders. */
export async function verifyAdminOrder(pool: pg.Pool, orderId: string): Promise<VerifyAdminOrderResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<AdminOrderRow>(
      `select orders.*, users.email as user_email, users.first_name as user_first_name,
              users.last_name as user_last_name, users.phone as user_phone
       from orders
       left join users on users.id = orders.user_id
       where orders.id = $1
       for update of orders`,
      [orderId],
    );
    const row = rows[0];
    if (!row) {
      await client.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    const order = decryptAdminOrderRow(row);
    if (order.status !== 'received' && order.status !== 'cancelled') {
      await client.query('rollback');
      return { ok: false, reason: 'invalid_status' };
    }
    if (order.admin_verified_at) {
      // Idempotent retry: heal earn lots missed when verify ran without a
      // linked user or with legacy loyalty_earn_status = void.
      if (order.user_id) {
        await grantDueOrderEarnsForUserInTransaction(client, order.user_id);
      } else {
        await grantPendingOrderEarn(client, orderId);
      }
      await client.query('commit');
      return { ok: false, reason: 'already_verified' };
    }
    const { rows: updatedRows } = await client.query<OrderRow>(
      `update orders
          set admin_verified_at = now(), updated_at = now()
        where id = $1
      returning *`,
      [orderId],
    );
    if (order.user_id) {
      await grantDueOrderEarnsForUserInTransaction(client, order.user_id);
    } else {
      await grantPendingOrderEarn(client, orderId);
    }
    await client.query('commit');
    // Reuse the joined user columns from the locked SELECT — they are still
    // ciphertext there. Do not pass the already-decrypted `order.user_*`
    // values back through decryptAdminOrderRow (decryptPii rejects plaintext).
    const updated = decryptAdminOrderRow({
      ...updatedRows[0]!,
      user_email: row.user_email,
      user_first_name: row.user_first_name,
      user_last_name: row.user_last_name,
      user_phone: row.user_phone,
    });
    const items = (await attachItems(pool, [updated])).get(updated.id) ?? [];
    return { ok: true, order: updated, items };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Browser-admin lookup by id, including the immutable item snapshot. */
export async function getAdminOrderById(
  pool: pg.Pool,
  orderId: string,
): Promise<{ order: AdminOrderRow; items: OrderItemRow[] } | undefined> {
  const { rows } = await pool.query<AdminOrderRow>(
    `select orders.*, users.email as user_email, users.first_name as user_first_name,
            users.last_name as user_last_name, users.phone as user_phone
     from orders
     left join users on users.id = orders.user_id
     where orders.id = $1`,
    [orderId],
  );
  const row = rows[0];
  if (!row) return undefined;
  const order = decryptAdminOrderRow(row);
  const items = (await attachItems(pool, [order])).get(order.id) ?? [];
  return { order, items };
}
