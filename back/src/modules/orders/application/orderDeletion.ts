import type pg from 'pg';
import type { OrderStatus } from '../domain/order.js';

export type DeleteOrderResult = { ok: true } | { ok: false; reason: 'not_found' | 'payment_review_required' };

/** Operations-only cleanup. It never contacts Stripe and refuses unresolved
 * payment-review orders, whose external state needs a human decision first. */
export async function deleteByOrderNumber(pool: pg.Pool, orderNumber: string): Promise<DeleteOrderResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<{ id: string; status: OrderStatus }>(
      `select id, status from orders where order_number = $1 for update`,
      [orderNumber],
    );
    const order = rows[0];
    if (!order) {
      await client.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    if (order.status === 'need_review' || order.status === 'return_review') {
      await client.query('rollback');
      return { ok: false, reason: 'payment_review_required' };
    }
    await client.query(`delete from voucher_redemptions where order_id = $1`, [order.id]);
    await client.query(`delete from stock_reservations where order_id = $1`, [order.id]);
    await client.query(`delete from orders where id = $1`, [order.id]);
    await client.query('commit');
    return { ok: true };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export type DeleteAllOrdersResult =
  { ok: true; deletedCount: number } | { ok: false; reason: 'payment_review_required'; reviewCount: number };

/** Same cleanup semantics as deleteByOrderNumber, atomically across every
 * order present when the table lock is obtained. */
export async function deleteAll(pool: pg.Pool): Promise<DeleteAllOrdersResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('lock table orders in share row exclusive mode');
    const { rows: reviewRows } = await client.query<{ count: string }>(
      `select count(*)::text as count from orders where status in ('need_review', 'return_review')`,
    );
    const reviewCount = Number(reviewRows[0]?.count ?? 0);
    if (reviewCount > 0) {
      await client.query('rollback');
      return { ok: false, reason: 'payment_review_required', reviewCount };
    }
    const { rows: orders } = await client.query<{ id: string }>(`select id from orders`);
    if (orders.length === 0) {
      await client.query('commit');
      return { ok: true, deletedCount: 0 };
    }
    const orderIds = orders.map((order) => order.id);
    // voucher_redemptions.order_id is ON DELETE RESTRICT — clear first.
    await client.query(`delete from voucher_redemptions where order_id = any($1::uuid[])`, [orderIds]);
    await client.query(`delete from stock_reservations where order_id = any($1::uuid[])`, [orderIds]);
    const { rowCount } = await client.query(`delete from orders where id = any($1::uuid[])`, [orderIds]);
    await client.query('commit');
    return { ok: true, deletedCount: rowCount ?? 0 };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
