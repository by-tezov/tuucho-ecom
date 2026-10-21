import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { computeOrderEarnRetention } from '../../../plugins/application/pluginBridges.js';
import type { OrderRow } from '../../domain/order.js';
import { decryptOrderRow } from '../../infrastructure/orderRows.js';
import { listRefunds, retrievePaymentIntent, type PaymentClient } from '../../../../platform/stripe/stripeClient.js';
import {
  type FulfillmentStockRow,
  type OrderReturnDetectionSource,
  type OrderReturnType,
  latestReturnCase,
  moneyCents,
  returnOrderById,
} from './orderReturnReviewStore.js';

export type MarkOrderReturnReviewResult =
  { ok: true; changed: boolean; order: OrderRow } | { ok: false; reason: 'not_found' | 'invalid_status' };

export async function markOrderReturnReview(
  pool: pg.Pool,
  orderId: string,
  input: {
    returnType: OrderReturnType;
    detectionSource: OrderReturnDetectionSource;
    evidence?: unknown;
    actorUserId?: string;
  },
): Promise<MarkOrderReturnReviewResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const order = await returnOrderById(client, orderId, true);
    if (!order) {
      await client.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    if (order.status === 'return_review') {
      const active = await latestReturnCase(client, orderId, true);
      await client.query('commit');
      return active ? { ok: true, changed: false, order } : { ok: false, reason: 'invalid_status' };
    }
    if (order.status !== 'sent' && order.status !== 'disponible') {
      await client.query('rollback');
      return { ok: false, reason: 'invalid_status' };
    }
    const evidence = JSON.stringify(input.evidence ?? {});
    if (input.detectionSource === 'carrier') {
      const dismissed = await client.query<{ id: string }>(
        `select id from order_return_cases
          where order_id = $1 and detection_source = 'carrier'
            and resolution_state = 'dismissed' and carrier_evidence = $2::jsonb
          limit 1`,
        [order.id, evidence],
      );
      if (dismissed.rows[0]) {
        await client.query('commit');
        return { ok: true, changed: false, order };
      }
    }
    await client.query(
      `insert into order_return_cases (
         id, order_id, previous_status, return_type, detection_source,
         carrier_evidence, detected_by
       ) values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        randomUUID(),
        order.id,
        order.status,
        input.returnType,
        input.detectionSource,
        evidence,
        input.actorUserId ?? null,
      ],
    );
    const { rows } = await client.query<OrderRow>(
      `update orders
          set status = 'return_review', status_reason = $2,
              admin_verified_at = null, status_updated_at = now(), updated_at = now()
        where id = $1
        returning *`,
      [order.id, `shipment_return:${input.returnType}`],
    );
    await client.query('commit');
    return { ok: true, changed: true, order: decryptOrderRow(rows[0]!) };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function returnStockLines(pool: pg.Pool, orderId: string) {
  const { rows: ledger } = await pool.query<FulfillmentStockRow>(
    `select * from order_fulfillment_stock where order_id = $1
      order by product_uid, shape_key, length_key, size`,
    [orderId],
  );
  if (ledger.length > 0) {
    return {
      stockLedgerComplete: true,
      stockLines: ledger.map((line) => ({
        productId: line.product_id,
        productUid: line.product_uid,
        shapeKey: line.shape_key,
        lengthKey: line.length_key,
        size: line.size,
        shippedUnits: line.shipped_quantity,
        restockedUnits: line.restocked_quantity,
        maxRestockUnits: line.shipped_quantity - line.restocked_quantity,
        productAvailable: line.product_id !== null,
      })),
    };
  }
  const { rows } = await pool.query<{
    product_id: string | null;
    product_uid: string;
    shape_key: string;
    length_key: string;
    size: string;
    display_quantity: string;
  }>(
    `select max(oi.product_id::text)::uuid as product_id, oi.product_uid,
            oi.shape_key, oi.length_key, oi.size,
            sum(oi.quantity)::text as display_quantity
       from order_items oi
      where oi.order_id = $1
      group by oi.product_uid, oi.shape_key, oi.length_key, oi.size
      order by oi.product_uid, oi.shape_key, oi.length_key, oi.size`,
    [orderId],
  );
  return {
    stockLedgerComplete: false,
    stockLines: rows.map((line) => ({
      productId: line.product_id,
      productUid: line.product_uid,
      shapeKey: line.shape_key,
      lengthKey: line.length_key,
      size: line.size,
      shippedUnits: null,
      restockedUnits: 0,
      maxRestockUnits: null,
      displayQuantity: Number(line.display_quantity),
      productAvailable: line.product_id !== null,
    })),
  };
}

export async function getOrderReturnReview(pool: pg.Pool, orderId: string) {
  const review = await latestReturnCase(pool, orderId);
  if (!review) return null;
  return {
    id: review.id,
    previousStatus: review.previous_status,
    returnType: review.return_type,
    detectionSource: review.detection_source,
    carrierEvidence: review.carrier_evidence,
    detectedAt: review.detected_at,
    resolutionState: review.resolution_state,
    decisionReason: review.decision_reason,
    refundMode: review.refund_mode,
    refundAmountCents: review.refund_amount_cents,
    courierRetainedCents: review.courier_retained_cents,
    courierDefaultCents: review.courier_default_cents,
    loyaltyEarnRetainedCents: review.loyalty_earn_retained_cents ?? 0,
    courierOverrideReason: review.courier_override_reason,
    stripeRefundId: review.stripe_refund_id,
    stripeRefundStatus: review.stripe_refund_status,
    resolvedAt: review.resolved_at,
    emailStatus: review.email_status,
    emailSentAt: review.email_sent_at,
    emailError: review.email_error,
    ...(await returnStockLines(pool, orderId)),
  };
}

export async function successfulOrderRefundTotal(
  stripe: PaymentClient,
  paymentIntentId: string,
): Promise<{ total: number; pending: boolean }> {
  let total = 0;
  let pending = false;
  let startingAfter: string | undefined;
  do {
    const refunds = await listRefunds(stripe, {
      payment_intent: paymentIntentId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const refund of refunds.data) {
      if (refund.status === 'succeeded') total += refund.amount;
      if (refund.status === 'pending') pending = true;
    }
    startingAfter = refunds.has_more ? refunds.data.at(-1)?.id : undefined;
    if (refunds.has_more && !startingAfter) throw new Error('Stripe returned an empty refund page.');
  } while (startingAfter);
  return { total, pending };
}

export type OrderReturnFinancialPreviewResult =
  | {
      ok: true;
      totalPaidCents: number;
      alreadyRefundedCents: number;
      remainingRefundableCents: number;
      courierDefaultCents: number;
      loyaltyEarnRetainedCents: number;
      refundPending: boolean;
    }
  | {
      ok: false;
      reason: 'not_found' | 'invalid_status' | 'stripe_not_configured' | 'stripe_action_failed';
    };

export async function getOrderReturnFinancialPreview(
  pool: pg.Pool,
  stripe: PaymentClient | undefined,
  orderId: string,
): Promise<OrderReturnFinancialPreviewResult> {
  const [order, review] = await Promise.all([
    returnOrderById(pool, orderId),
    latestReturnCase(pool, orderId, true),
  ]);
  if (!order) return { ok: false, reason: 'not_found' };
  if (order.status !== 'return_review' || !review) return { ok: false, reason: 'invalid_status' };
  const courierDefaultCents = moneyCents(order.shipping_list_fee ?? order.shipping_fee);
  const earnRetention = await computeOrderEarnRetention(pool, order.id);
  const loyaltyEarnRetainedCents = moneyCents(earnRetention.spentEuro);
  const paymentIntentId = order.stripe_payment_intent_id;
  if (
    !paymentIntentId ||
    paymentIntentId.startsWith('free:') ||
    order.payment_capture_status === 'not_required'
  ) {
    return {
      ok: true,
      totalPaidCents: 0,
      alreadyRefundedCents: 0,
      remainingRefundableCents: 0,
      courierDefaultCents,
      loyaltyEarnRetainedCents,
      refundPending: false,
    };
  }
  if (!stripe) return { ok: false, reason: 'stripe_not_configured' };
  try {
    const paymentIntent = await retrievePaymentIntent(stripe, paymentIntentId);
    const refunds = await successfulOrderRefundTotal(stripe, paymentIntentId);
    const totalPaidCents = paymentIntent.amount_received;
    return {
      ok: true,
      totalPaidCents,
      alreadyRefundedCents: refunds.total,
      remainingRefundableCents: Math.max(0, totalPaidCents - refunds.total),
      courierDefaultCents,
      loyaltyEarnRetainedCents,
      refundPending: refunds.pending,
    };
  } catch (error) {
    console.error(`[orderReturnReview] Stripe preview failed for ${order.order_number}`, error);
    return { ok: false, reason: 'stripe_action_failed' };
  }
}
