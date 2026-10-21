import type pg from 'pg';
import { forgetOneTimeCardForOrder } from '../../../payments/application/cardRetention.js';
import { refundConsumedLoyaltyForOrder, voidPendingOrderEarn } from '../../../plugins/application/pluginBridges.js';
import { type OrderItemRow, type OrderRow } from '../../domain/order.js';
import { attachItems, decryptOrderRow } from '../../infrastructure/orderRows.js';
import { clearLockSql, orderHasInvoice } from '../revisions/orderRevisions.js';
import { releasePaymentAuthorization } from '../orderPaymentCapture.js';
import { type PaymentClient } from '../../../../platform/stripe/stripeClient.js';

export type CancelOrderResult =
  | { ok: true; order: OrderRow; items: OrderItemRow[] }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'order_not_cancellable'
        | 'invoice_already_issued'
        | 'payment_capture_failed'
        | 'stripe_not_configured';
    };

export function isCustomerCancellable(order: OrderRow): boolean {
  const authorizedPaymentCanBeReleased =
    order.status === 'confirmed' && order.payment_capture_status === 'authorized';
  const zeroTotalNeedsNoPayment =
    (order.status === 'confirmed' || order.status === 'in_preparation') &&
    order.payment_capture_status === 'not_required' &&
    Number(order.total) === 0;
  return authorizedPaymentCanBeReleased || zeroTotalNeedsNoPayment;
}

export async function applyLocalCancellation(client: pg.PoolClient, order: OrderRow): Promise<OrderRow> {
  await client.query(`delete from stock_reservations where order_id = $1 and state = 'consumed'`, [order.id]);
  await refundConsumedLoyaltyForOrder(client, order.id);
  await voidPendingOrderEarn(client, order.id);
  const { rows } = await client.query<OrderRow>(
    `update orders set
       status = 'cancelled',
       payment_capture_status = case
         when payment_capture_status = 'authorized' then 'canceled'
         else payment_capture_status
       end,
       payment_operation = null,
       payment_operation_started_at = null,
       ${clearLockSql()},
       status_updated_at = now(),
       updated_at = now()
     where id = $1
     returning *`,
    [order.id],
  );
  return decryptOrderRow(rows[0]!);
}

/** Customer self-cancel: either `confirmed` + a still-authorized hold (card
 * or PayPal), or a zero-total / payment-not-required order that is confirmed
 * or in preparation. Releases any Stripe authorization, frees stock, forgets
 * one-time cards, and clears any edit lock the customer held. */
export async function cancelOrder(
  pool: pg.Pool,
  userId: string,
  orderId: string,
  stripe?: PaymentClient,
): Promise<CancelOrderResult> {
  let claimedOrder: OrderRow;
  let locallyCancelled: OrderRow | undefined;
  const claimClient = await pool.connect();
  try {
    await claimClient.query('begin');
    const { rows } = await claimClient.query<OrderRow>(
      `select * from orders where id = $1 and user_id = $2 for update`,
      [orderId, userId],
    );
    const order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
    if (!order) {
      await claimClient.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    claimedOrder = order;
    if (order.status === 'cancelled') {
      await claimClient.query('rollback');
      return { ok: false, reason: 'order_not_cancellable' };
    }
    if (!isCustomerCancellable(order)) {
      await claimClient.query('rollback');
      return { ok: false, reason: 'order_not_cancellable' };
    }
    if (await orderHasInvoice(claimClient, order.id)) {
      await claimClient.query('rollback');
      return { ok: false, reason: 'invoice_already_issued' };
    }

    if (order.payment_capture_status !== 'authorized') {
      locallyCancelled = await applyLocalCancellation(claimClient, order);
      await claimClient.query('commit');
    } else {
      if (!stripe) {
        await claimClient.query('rollback');
        return { ok: false, reason: 'stripe_not_configured' };
      }
      if (order.payment_operation !== null && order.payment_operation !== 'cancel') {
        await claimClient.query('rollback');
        return { ok: false, reason: 'payment_capture_failed' };
      }
      if (order.payment_operation === null) {
        const { rows: claimedRows } = await claimClient.query<OrderRow>(
          `update orders
              set payment_operation = 'cancel', payment_operation_started_at = now(), updated_at = now()
            where id = $1
            returning *`,
          [order.id],
        );
        claimedOrder = decryptOrderRow(claimedRows[0]!);
      }
      await claimClient.query('commit');
    }
  } catch (error) {
    await claimClient.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    claimClient.release();
  }

  if (locallyCancelled) {
    const itemsByOrder = await attachItems(pool, [locallyCancelled]);
    try {
      await forgetOneTimeCardForOrder(pool, stripe, locallyCancelled);
    } catch (error) {
      console.error('[orders] forget one-time card on customer cancel failed', error);
    }
    return { ok: true, order: locallyCancelled, items: itemsByOrder.get(locallyCancelled.id) ?? [] };
  }

  const paymentResult = await releasePaymentAuthorization(
    stripe,
    claimedOrder,
    `order:${claimedOrder.id}:cancel`,
  );
  if (paymentResult === 'stripe_not_configured') {
    return { ok: false, reason: 'stripe_not_configured' };
  }
  if (paymentResult === 'failed') {
    // Keep payment_operation='cancel': a timeout has an unknown remote
    // outcome. A repeated customer request resumes the same idempotent Stripe
    // cancellation, while capture remains unable to race it.
    return { ok: false, reason: 'payment_capture_failed' };
  }
  if (paymentResult === 'captured') {
    await pool.query(
      `update orders
          set payment_capture_status = 'captured',
              payment_operation = null,
              payment_operation_started_at = null,
              updated_at = now()
        where id = $1 and payment_operation = 'cancel'`,
      [claimedOrder.id],
    );
    return { ok: false, reason: 'payment_capture_failed' };
  }

  const finalizeClient = await pool.connect();
  try {
    await finalizeClient.query('begin');
    const { rows } = await finalizeClient.query<OrderRow>(
      `select * from orders where id = $1 and user_id = $2 for update`,
      [orderId, userId],
    );
    const order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
    if (!order) {
      await finalizeClient.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    if (order.status === 'cancelled') {
      await finalizeClient.query('commit');
      const itemsByOrder = await attachItems(pool, [order]);
      return { ok: true, order, items: itemsByOrder.get(order.id) ?? [] };
    }
    if (order.payment_operation !== 'cancel' || !isCustomerCancellable(order)) {
      await finalizeClient.query('rollback');
      return { ok: false, reason: 'payment_capture_failed' };
    }
    const updated = await applyLocalCancellation(finalizeClient, order);
    await finalizeClient.query('commit');
    const itemsByOrder = await attachItems(pool, [updated]);
    try {
      await forgetOneTimeCardForOrder(pool, stripe, updated);
    } catch (error) {
      console.error('[orders] forget one-time card on customer cancel failed', error);
    }
    return { ok: true, order: updated, items: itemsByOrder.get(updated.id) ?? [] };
  } catch (error) {
    await finalizeClient.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    finalizeClient.release();
  }
}
