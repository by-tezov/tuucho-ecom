import type pg from 'pg';
import {
  ensureShippingLabel,
  supportsAutomatedShippingLabel,
  type ShippingPacket,
} from '../../../shipping/application/shippingLabels.js';
import { bumpRetentionAfterOrderTerminal } from '../../../payments/application/cardRetention.js';
import { type OrderRow, type OrderStatus } from '../../domain/order.js';
import { nextOrderStatus } from '../../domain/orderStatus.js';
import { snapshotOrderFulfillmentStock } from '../../infrastructure/orderFulfillmentStock.js';
import { attachItems, decryptOrderRow } from '../../infrastructure/orderRows.js';
import {
  clearRevisionLockColumns,
  hasRevisionLock,
  isLockActive,
  revisionLockRefusalMessage,
  revisionLockStaleRefusalMessage,
} from '../revisions/orderRevisions.js';
import { cancelStatus } from './cancelStatusOrder.js';
import { ensurePaymentCaptured } from '../orderPaymentCapture.js';
import type { SetStatusResult } from './orderStatusTypes.js';
import { type PaymentClient } from '../../../../platform/stripe/stripeClient.js';

export async function setStatus(
  pool: pg.Pool,
  orderId: string,
  newStatus: OrderStatus,
  packet?: ShippingPacket,
  skipShippingLabel?: boolean,
  options?: {
    noPayment?: boolean;
    /** Ops-only recipient phone used for this generated shipping label. It
     * deliberately does not alter the immutable checkout address snapshot. */
    recipientPhone?: string;
    bypassLockEdit?: boolean;
    stripe?: PaymentClient;
  },
): Promise<SetStatusResult> {
  const noPayment = options?.noPayment === true;
  const recipientPhone = options?.recipientPhone;
  const bypassLockEdit = options?.bypassLockEdit === true;
  const stripe = options?.stripe;

  if (newStatus === 'cancelled') {
    if (bypassLockEdit) {
      await clearRevisionLockColumns(pool, orderId);
    }
    return cancelStatus(pool, orderId, stripe);
  }

  if (noPayment && newStatus !== 'in_preparation') {
    return {
      ok: false,
      reason: 'invalid_transition',
      message: 'noPayment is only allowed when moving to in_preparation.',
    };
  }

  const { rows } = await pool.query<OrderRow>(`select * from orders where id = $1`, [orderId]);
  let order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
  if (!order) return { ok: false, reason: 'not_found' };

  if (hasRevisionLock(order)) {
    if (!bypassLockEdit) {
      if (isLockActive(order)) {
        return {
          ok: false,
          reason: 'order_revision_locked',
          order,
          message: revisionLockRefusalMessage(order),
        };
      }
      return {
        ok: false,
        reason: 'order_revision_lock_stale',
        order,
        message: revisionLockStaleRefusalMessage(order),
      };
    }
    await clearRevisionLockColumns(pool, orderId);
    const { rows: clearedRows } = await pool.query<OrderRow>(`select * from orders where id = $1`, [orderId]);
    order = clearedRows[0] ? decryptOrderRow(clearedRows[0]) : undefined;
    if (!order) return { ok: false, reason: 'not_found' };
  }

  if (order.status === newStatus) {
    const itemsByOrder = await attachItems(pool, [order]);
    return { ok: true, changed: false, order, items: itemsByOrder.get(order.id) ?? [] };
  }
  if (nextOrderStatus(order) !== newStatus) {
    return {
      ok: false,
      reason: 'invalid_transition',
      message: `Order ${order.order_number} is ${order.status}; expected next status ${nextOrderStatus(order) ?? 'none'}, not ${newStatus}.`,
    };
  }

  const mustCapture = (newStatus === 'in_preparation' && !noPayment) || newStatus === 'to_send';
  if (mustCapture && order.payment_capture_status === 'authorized') {
    if (!stripe) {
      return {
        ok: false,
        reason: 'stripe_not_configured',
        order,
        message: `Order ${order.order_number} needs payment capture but Stripe is not configured.`,
      };
    }
    const captured = await ensurePaymentCaptured(pool, stripe, order);
    if (!captured.ok) {
      return {
        ok: false,
        reason: captured.reason,
        order: captured.order,
        message: captured.message,
      };
    }
    order = captured.order;
  }

  // skipShippingLabel is an explicit ops override for when the automated
  // carrier call itself can't proceed (a real Mondial Relay account/routing
  // error, for example — see shippingLabels.service.ts's ShippingLabelError)
  // but the order still genuinely needs to move to to_send because it's
  // being shipped by some other means. It bypasses ensureShippingLabel
  // entirely rather than retrying or working around the carrier error, so
  // no packet is required either in that case. Couriers with no automated
  // label adapter (e.g. Chronopost home) are treated the same way.
  if (newStatus === 'to_send' && !skipShippingLabel && supportsAutomatedShippingLabel(order)) {
    if (!packet) {
      return {
        ok: false,
        reason: 'shipping_packet_missing',
        message: `Order ${order.order_number} needs packet measurements for its nail quantity before generating a Mondial Relay label.`,
      };
    }
    await ensureShippingLabel(pool, order, packet, recipientPhone);
  }

  // Re-check under row lock: a customer may have acquired an edit lock
  // (or the status may have moved) while a shipping label was generating.
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: lockedRows } = await client.query<OrderRow>(
      `select * from orders where id = $1 for update`,
      [orderId],
    );
    const locked = lockedRows[0] ? decryptOrderRow(lockedRows[0]) : undefined;
    if (!locked) {
      await client.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    if (hasRevisionLock(locked) && !bypassLockEdit) {
      await client.query('rollback');
      return {
        ok: false,
        reason: isLockActive(locked) ? 'order_revision_locked' : 'order_revision_lock_stale',
        order: locked,
        message: isLockActive(locked)
          ? revisionLockRefusalMessage(locked)
          : revisionLockStaleRefusalMessage(locked),
      };
    }
    if (hasRevisionLock(locked) && bypassLockEdit) {
      await clearRevisionLockColumns(client, orderId);
    }
    if (locked.payment_operation !== null) {
      await client.query('rollback');
      return {
        ok: false,
        reason: 'payment_capture_failed',
        order: locked,
        message: `Order ${locked.order_number} has a ${locked.payment_operation} payment operation in progress.`,
      };
    }
    if (locked.status === newStatus) {
      await client.query('commit');
      const itemsByOrder = await attachItems(pool, [locked]);
      return { ok: true, changed: false, order: locked, items: itemsByOrder.get(locked.id) ?? [] };
    }
    if (nextOrderStatus(locked) !== newStatus) {
      await client.query('rollback');
      return {
        ok: false,
        reason: 'invalid_transition',
        message: `Order ${locked.order_number} is ${locked.status}; expected next status ${nextOrderStatus(locked) ?? 'none'}, not ${newStatus}.`,
      };
    }

    if (newStatus === 'sent') {
      await snapshotOrderFulfillmentStock(client, orderId);
      await client.query(
        `delete from product_availability pa
         using stock_reservation_items sri, stock_reservations sr
         where sr.id = sri.reservation_id
           and sr.order_id = $1
           and sr.state = 'consumed'
           and sri.product_id = pa.product_id
           and sri.shape_key = pa.shape_key
           and sri.length_key = pa.length_key
           and sri.size = pa.size
           and pa.quantity <= sri.quantity`,
        [orderId],
      );
      await client.query(
        `update product_availability pa
         set quantity = pa.quantity - sri.quantity
         from stock_reservation_items sri, stock_reservations sr
         where sr.id = sri.reservation_id
           and sr.order_id = $1
           and sr.state = 'consumed'
           and sri.product_id = pa.product_id
           and sri.shape_key = pa.shape_key
           and sri.length_key = pa.length_key
           and sri.size = pa.size
           and pa.quantity > sri.quantity`,
        [orderId],
      );
      await client.query(`delete from stock_reservations where order_id = $1 and state = 'consumed'`, [
        orderId,
      ]);
    }

    const { rows: updatedRows } = await client.query<OrderRow>(
      `update orders
         set status = $2,
             status_updated_at = now(),
             updated_at = now(),
             sent_at = case when $2 = 'sent' then now() else sent_at end
       where id = $1
       returning *`,
      [orderId, newStatus],
    );
    await client.query('commit');
    const updated = decryptOrderRow(updatedRows[0]!);
    const itemsByOrder = await attachItems(pool, [updated]);
    if (newStatus === 'received') {
      try {
        await bumpRetentionAfterOrderTerminal(pool, stripe, updated);
      } catch (error) {
        console.error('[orders] card retention bump on received failed', error);
      }
    }
    return { ok: true, changed: true, order: updated, items: itemsByOrder.get(updated.id) ?? [] };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
