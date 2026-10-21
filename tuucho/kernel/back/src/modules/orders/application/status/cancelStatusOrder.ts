import type pg from 'pg';
import { bumpRetentionAfterOrderTerminal } from '../../../payments/application/cardRetention.js';
import { type OrderRow } from '../../domain/order.js';
import { CANCELLABLE_ORDER_STATUSES } from '../../domain/orderStatus.js';
import { attachItems, decryptOrderRow } from '../../infrastructure/orderRows.js';
import {
  isLockActive,
  isLockStale,
  revisionLockRefusalMessage,
  revisionLockStaleRefusalMessage,
} from '../revisions/orderRevisions.js';
import { applyLocalCancellation } from './cancelCustomerOrder.js';
import { releasePaymentAuthorization } from '../orderPaymentCapture.js';
import type { SetStatusResult } from './orderStatusTypes.js';
import { type PaymentClient } from '../../../../platform/stripe/stripeClient.js';

export async function cancelStatus(
  pool: pg.Pool,
  orderId: string,
  stripe?: PaymentClient,
): Promise<SetStatusResult> {
  let claimedOrder: OrderRow;
  let locallyCancelled: OrderRow | undefined;
  const claimClient = await pool.connect();
  try {
    await claimClient.query('begin');
    const { rows } = await claimClient.query<OrderRow>(`select * from orders where id = $1 for update`, [
      orderId,
    ]);
    const order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
    if (!order) {
      await claimClient.query('commit');
      return { ok: false, reason: 'not_found' };
    }
    claimedOrder = order;
    if (order.status === 'cancelled') {
      await claimClient.query('commit');
      const itemsByOrder = await attachItems(pool, [order]);
      return { ok: true, changed: false, order, items: itemsByOrder.get(order.id) ?? [] };
    }
    if (!CANCELLABLE_ORDER_STATUSES.has(order.status)) {
      await claimClient.query('commit');
      return { ok: false, reason: 'invalid_transition' };
    }
    if (isLockActive(order)) {
      await claimClient.query('commit');
      return {
        ok: false,
        reason: 'order_revision_locked',
        order,
        message: revisionLockRefusalMessage(order),
      };
    }
    if (isLockStale(order)) {
      await claimClient.query('commit');
      return {
        ok: false,
        reason: 'order_revision_lock_stale',
        order,
        message: revisionLockStaleRefusalMessage(order),
      };
    }

    if (order.payment_capture_status === 'captured') {
      await claimClient.query('commit');
      return {
        ok: false,
        reason: 'payment_capture_failed',
        order,
        message: `Order ${order.order_number} payment was already captured; this path does not issue refunds.`,
      };
    }

    if (order.payment_capture_status !== 'authorized') {
      locallyCancelled = await applyLocalCancellation(claimClient, order);
      await claimClient.query('commit');
    } else {
      if (!stripe) {
        await claimClient.query('rollback');
        return {
          ok: false,
          reason: 'stripe_not_configured',
          order,
          message: `Order ${order.order_number} needs Stripe authorization cancellation.`,
        };
      }
      if (order.payment_operation !== null && order.payment_operation !== 'cancel') {
        await claimClient.query('rollback');
        return {
          ok: false,
          reason: 'payment_capture_failed',
          order,
          message: `Order ${order.order_number} payment capture is already in progress.`,
        };
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
      await bumpRetentionAfterOrderTerminal(pool, stripe, locallyCancelled);
    } catch (error) {
      console.error('[orders] card retention bump on cancel failed', error);
    }
    return {
      ok: true,
      changed: true,
      order: locallyCancelled,
      items: itemsByOrder.get(locallyCancelled.id) ?? [],
    };
  }

  const paymentResult = await releasePaymentAuthorization(
    stripe,
    claimedOrder,
    `order:${claimedOrder.id}:cancel`,
  );
  if (paymentResult === 'failed' || paymentResult === 'stripe_not_configured') {
    return {
      ok: false,
      reason: paymentResult === 'stripe_not_configured' ? 'stripe_not_configured' : 'payment_capture_failed',
      order: claimedOrder,
      message:
        paymentResult === 'stripe_not_configured'
          ? `Order ${claimedOrder.order_number} needs Stripe authorization cancellation.`
          : `Order ${claimedOrder.order_number} payment authorization could not be canceled; retry resumes the same operation.`,
    };
  }
  if (paymentResult === 'captured') {
    const { rows } = await pool.query<OrderRow>(
      `update orders
          set payment_capture_status = 'captured',
              payment_operation = null,
              payment_operation_started_at = null,
              updated_at = now()
        where id = $1 and payment_operation = 'cancel'
        returning *`,
      [claimedOrder.id],
    );
    const current = rows[0] ? decryptOrderRow(rows[0]) : claimedOrder;
    return {
      ok: false,
      reason: 'payment_capture_failed',
      order: current,
      message:
        `Order ${claimedOrder.order_number} payment was captured before cancellation. ` +
        `The order was not canceled because this path does not issue refunds.`,
    };
  }

  const finalizeClient = await pool.connect();
  try {
    await finalizeClient.query('begin');
    const { rows } = await finalizeClient.query<OrderRow>(`select * from orders where id = $1 for update`, [
      orderId,
    ]);
    const order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
    if (!order) {
      await finalizeClient.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    if (order.status === 'cancelled') {
      await finalizeClient.query('commit');
      const itemsByOrder = await attachItems(pool, [order]);
      return { ok: true, changed: false, order, items: itemsByOrder.get(order.id) ?? [] };
    }
    if (order.payment_operation !== 'cancel' || !CANCELLABLE_ORDER_STATUSES.has(order.status)) {
      await finalizeClient.query('rollback');
      return {
        ok: false,
        reason: 'payment_capture_failed',
        order,
        message: `Order ${order.order_number} changed while its payment authorization was being canceled.`,
      };
    }
    const updated = await applyLocalCancellation(finalizeClient, order);
    await finalizeClient.query('commit');
    const itemsByOrder = await attachItems(pool, [updated]);
    try {
      await bumpRetentionAfterOrderTerminal(pool, stripe, updated);
    } catch (error) {
      console.error('[orders] card retention bump on cancel failed', error);
    }
    return { ok: true, changed: true, order: updated, items: itemsByOrder.get(updated.id) ?? [] };
  } catch (error) {
    await finalizeClient.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    finalizeClient.release();
  }
}
