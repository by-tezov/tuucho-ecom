import type pg from 'pg';
import { bumpRetentionAfterOrderTerminal } from '../../../payments/application/cardRetention.js';
import { refundConsumedLoyaltyForOrder, voidPendingOrderEarn } from '../../../plugins/application/pluginBridges.js';
import { type OrderItemRow, type OrderRow, type OrderStatus } from '../../domain/order.js';
import { attachItems, decryptOrderRow } from '../../infrastructure/orderRows.js';
import { getById } from '../queries/adminOrderQueries.js';
import { cancelPaymentIntent, createRefund, listRefunds, retrievePaymentIntent, type PaymentClient } from '../../../../platform/stripe/stripeClient.js';

export type NeedReviewResolution = 'continue' | 'cancel';

export interface StripeResolutionAudit {
  decision: NeedReviewResolution;
  action: 'verified' | 'canceled' | 'refunded' | 'already_refunded';
  paymentIntentId: string;
  paymentIntentStatus: string;
  refundId?: string;
  refundStatus?: string | null;
}

export type ResolveNeedReviewOrderResult =
  | {
      ok: true;
      changed: boolean;
      order: OrderRow;
      items: OrderItemRow[];
      stripeResolution: StripeResolutionAudit;
    }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'invalid_status'
        | 'review_blocked'
        | 'stripe_not_configured'
        | 'stripe_state_invalid'
        | 'stripe_action_failed'
        | 'stripe_refund_pending';
    };

async function successfulRefundTotal(
  stripe: PaymentClient,
  paymentIntentId: string,
): Promise<{ total: number; pending: boolean; latestId?: string; latestStatus?: string | null }> {
  let total = 0;
  let pending = false;
  let latestId: string | undefined;
  let latestStatus: string | null | undefined;
  let startingAfter: string | undefined;
  do {
    const refunds = await listRefunds(stripe, {
      payment_intent: paymentIntentId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (!latestId && refunds.data[0]) {
      latestId = refunds.data[0].id;
      latestStatus = refunds.data[0].status;
    }
    for (const refund of refunds.data) {
      if (refund.status === 'succeeded') total += refund.amount;
      if (refund.status === 'pending') pending = true;
    }
    startingAfter = refunds.has_more ? refunds.data.at(-1)?.id : undefined;
    if (refunds.has_more && !startingAfter) {
      throw new Error('Stripe refund pagination returned an empty page');
    }
  } while (startingAfter);
  return {
    total,
    pending,
    latestId,
    latestStatus,
  };
}

/** Execute the operator's explicit Stripe decision, then persist the local
 * transition and audit actor. No worker or cron cancels an authorization or
 * refunds captured funds: both actions start with this admin request. Stable
 * Stripe idempotency keys make the same operator request safe to repeat if its
 * HTTP response is lost after Stripe accepted the action. */
async function resolveNeedReviewOrderLocked(
  pool: pg.Pool,
  stripe: PaymentClient | undefined,
  orderId: string,
  resolution: NeedReviewResolution,
  actorUserId: string,
): Promise<ResolveNeedReviewOrderResult> {
  const initial = await getById(pool, orderId);
  if (!initial) return { ok: false, reason: 'not_found' };
  if (initial.status !== 'need_review') {
    if (initial.need_review_resolution === resolution && initial.stripe_resolution) {
      const itemsByOrder = await attachItems(pool, [initial]);
      return {
        ok: true,
        changed: false,
        order: initial,
        items: itemsByOrder.get(initial.id) ?? [],
        stripeResolution: initial.stripe_resolution as StripeResolutionAudit,
      };
    }
    return { ok: false, reason: 'invalid_status' };
  }
  if (resolution === 'continue' && initial.need_review_blocked) {
    return { ok: false, reason: 'review_blocked' };
  }
  if (!stripe) return { ok: false, reason: 'stripe_not_configured' };
  const piId = initial.stripe_payment_intent_id;
  if (!piId || piId.startsWith('free:')) return { ok: false, reason: 'stripe_state_invalid' };

  let stripeAudit: StripeResolutionAudit;
  try {
    let paymentIntent = await retrievePaymentIntent(stripe, piId);
    if (resolution === 'continue') {
      if (paymentIntent.status !== 'requires_capture' && paymentIntent.status !== 'succeeded') {
        return { ok: false, reason: 'stripe_state_invalid' };
      }
      const refunded = await successfulRefundTotal(stripe, piId);
      if (refunded.total > 0 || refunded.pending) {
        return { ok: false, reason: refunded.pending ? 'stripe_refund_pending' : 'stripe_state_invalid' };
      }
      stripeAudit = {
        decision: resolution,
        action: 'verified',
        paymentIntentId: piId,
        paymentIntentStatus: paymentIntent.status,
      };
    } else if (paymentIntent.status === 'succeeded') {
      const priorRefunds = await successfulRefundTotal(stripe, piId);
      if (priorRefunds.pending) return { ok: false, reason: 'stripe_refund_pending' };
      const remaining = Math.max(0, paymentIntent.amount_received - priorRefunds.total);
      if (remaining > 0) {
        const refund = await createRefund(stripe, 
          { payment_intent: piId, amount: remaining },
          { idempotencyKey: `need-review:${orderId}:refund` },
        );
        if (refund.status === 'pending') return { ok: false, reason: 'stripe_refund_pending' };
        if (refund.status !== 'succeeded') return { ok: false, reason: 'stripe_action_failed' };
        stripeAudit = {
          decision: resolution,
          action: 'refunded',
          paymentIntentId: piId,
          paymentIntentStatus: paymentIntent.status,
          refundId: refund.id,
          refundStatus: refund.status,
        };
      } else {
        stripeAudit = {
          decision: resolution,
          action: 'already_refunded',
          paymentIntentId: piId,
          paymentIntentStatus: paymentIntent.status,
          refundId: priorRefunds.latestId,
          refundStatus: priorRefunds.latestStatus,
        };
      }
    } else if (paymentIntent.status === 'canceled') {
      stripeAudit = {
        decision: resolution,
        action: 'canceled',
        paymentIntentId: piId,
        paymentIntentStatus: paymentIntent.status,
      };
    } else if (
      [
        'requires_payment_method',
        'requires_confirmation',
        'requires_action',
        'processing',
        'requires_capture',
      ].includes(paymentIntent.status)
    ) {
      paymentIntent = await cancelPaymentIntent(stripe, 
        piId,
        {},
        { idempotencyKey: `need-review:${orderId}:cancel` },
      );
      if (paymentIntent.status !== 'canceled') return { ok: false, reason: 'stripe_action_failed' };
      stripeAudit = {
        decision: resolution,
        action: 'canceled',
        paymentIntentId: piId,
        paymentIntentStatus: paymentIntent.status,
      };
    } else {
      return { ok: false, reason: 'stripe_state_invalid' };
    }
  } catch (error) {
    console.error(`[orders] Stripe need-review resolution failed for ${initial.order_number}`, error);
    return { ok: false, reason: 'stripe_action_failed' };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<OrderRow>(`select * from orders where id = $1 for update`, [orderId]);
    const order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
    if (!order) {
      await client.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    if (order.status !== 'need_review') {
      await client.query('rollback');
      if (order.need_review_resolution === resolution && order.stripe_resolution) {
        const itemsByOrder = await attachItems(pool, [order]);
        return {
          ok: true,
          changed: false,
          order,
          items: itemsByOrder.get(order.id) ?? [],
          stripeResolution: order.stripe_resolution as StripeResolutionAudit,
        };
      }
      return { ok: false, reason: 'invalid_status' };
    }
    if (resolution === 'continue' && order.need_review_blocked) {
      await client.query('rollback');
      return { ok: false, reason: 'review_blocked' };
    }

    if (resolution === 'cancel') {
      await client.query(`delete from stock_reservations where order_id = $1 and state = 'consumed'`, [
        order.id,
      ]);
      await refundConsumedLoyaltyForOrder(client, order.id);
      await voidPendingOrderEarn(client, order.id);
    }
    const nextStatus: OrderStatus = resolution === 'cancel' ? 'cancelled' : 'confirmed';
    const captureStatus =
      resolution === 'cancel' && stripeAudit.action === 'canceled'
        ? 'canceled'
        : stripeAudit.paymentIntentStatus === 'succeeded'
          ? 'captured'
          : order.payment_capture_status;
    const { rows: updatedRows } = await client.query<OrderRow>(
      `update orders
          set status = $2,
              payment_capture_status = $3,
              need_review_resolved_at = now(),
              need_review_resolved_by = $4,
              need_review_resolution = $5,
              stripe_resolution = $6::jsonb,
              status_updated_at = now(),
              updated_at = now()
        where id = $1
        returning *`,
      [order.id, nextStatus, captureStatus, actorUserId, resolution, JSON.stringify(stripeAudit)],
    );
    await client.query('commit');
    const updated = decryptOrderRow(updatedRows[0]!);
    const itemsByOrder = await attachItems(pool, [updated]);
    if (resolution === 'cancel') {
      try {
        await bumpRetentionAfterOrderTerminal(pool, stripe, updated);
      } catch (error) {
        console.error('[orders] card retention bump on need-review cancel failed', error);
      }
    }
    return {
      ok: true,
      changed: true,
      order: updated,
      items: itemsByOrder.get(updated.id) ?? [],
      stripeResolution: stripeAudit,
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Serialize the complete human decision, including its Stripe call. Stable
 * idempotency keys make identical retries safe; this session lock additionally
 * prevents two administrators from racing conflicting Continue/Cancel choices
 * into an inconsistent Stripe/local outcome. PostgreSQL releases it if the
 * process or connection dies. */
export async function resolveNeedReviewOrder(
  pool: pg.Pool,
  stripe: PaymentClient | undefined,
  orderId: string,
  resolution: NeedReviewResolution,
  actorUserId: string,
): Promise<ResolveNeedReviewOrderResult> {
  const lockClient = await pool.connect();
  const lockKey = `need-review-resolution:${orderId}`;
  try {
    await lockClient.query(`select pg_advisory_lock(87218, hashtext($1))`, [lockKey]);
    return await resolveNeedReviewOrderLocked(pool, stripe, orderId, resolution, actorUserId);
  } finally {
    await lockClient
      .query(`select pg_advisory_unlock(87218, hashtext($1))`, [lockKey])
      .catch(() => undefined);
    lockClient.release();
  }
}

/** Strictly sequential, forward-only (confirmed -> in_preparation -> to_send
 * -> sent -> received for home delivery; Point Relais orders insert
 * `disponible` between `sent` and `received`) — no skipping or backwards transitions. `cancelled`
 * is the sole admin-only terminal branch from the pre-shipment states;
 * re-sending the current status is a harmless no-op (changed: false).
 *
 * Payment capture: default path captures an `authorized` hold before
 * advancing to `in_preparation` or `to_send`. Pass `noPayment: true` only
 * for `in_preparation` to skip capture (hold remains until a later
 * to_send / prep without the flag).
 *
 * Stock: the `sent` transition is also where the order's reservation stops
 * being a live deduction and becomes a permanent one — product_availability
 * .quantity is decremented by the order's items and the now-redundant
 * `consumed` reservation is deleted, since cancellation is impossible past
 * this point (see CANCELLABLE_ORDER_STATUSES) and order_items already keeps the
 * permanent record. */
