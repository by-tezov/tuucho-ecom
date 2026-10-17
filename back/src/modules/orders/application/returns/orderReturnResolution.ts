import type pg from 'pg';
import type Stripe from 'stripe';
import { bumpRetentionAfterOrderTerminal } from '../../../payments/application/cardRetention.js';
import {
  computeOrderEarnRetention,
  refundConsumedLoyaltyForOrder,
  reverseUnusedOrderEarn,
  voidPendingOrderEarn,
} from '../../../loyalty/application/loyalty.js';
import type { OrderItemRow, OrderRow } from '../../domain/order.js';
import { attachItems, decryptOrderRow } from '../../infrastructure/orderRows.js';
import { getOrderReturnReview, successfulOrderRefundTotal } from './orderReturnReviewQueries.js';
import {
  type CanonicalResolutionInput,
  type FulfillmentStockRow,
  type OrderReturnCaseRow,
  type OrderReturnStockInput,
  type ResolveOrderReturnInput,
  type StoredResolutionRequest,
  canonicalResolutionInput,
  latestReturnCase,
  moneyCents,
  returnOrderById,
  returnStockKey,
  sameCanonicalInput,
} from './orderReturnReviewStore.js';
import { sendOrderReturnResolutionEmail } from './orderReturnReviewWorkflow.js';

function validInput(input: CanonicalResolutionInput, courierDefaultCents: number): boolean {
  if (!['full', 'courier_deduction', 'custom', 'none'].includes(input.refundMode)) return false;
  if (!Number.isSafeInteger(input.courierRetainedCents) || input.courierRetainedCents < 0) return false;
  if (!input.decisionReason || input.decisionReason.length > 2_000) return false;
  if (input.courierOverrideReason && input.courierOverrideReason.length > 2_000) return false;
  if (
    input.refundMode === 'custom' &&
    (!Number.isSafeInteger(input.customRefundAmountCents) || input.customRefundAmountCents! < 0)
  )
    return false;
  if (input.refundMode !== 'custom' && input.customRefundAmountCents !== null) return false;
  if (
    (input.refundMode === 'courier_deduction' ||
      input.refundMode === 'custom' ||
      input.refundMode === 'none') &&
    input.courierRetainedCents !== courierDefaultCents &&
    !input.courierOverrideReason
  )
    return false;
  if (input.stock.length > 100) return false;
  const keys = new Set<string>();
  for (const line of input.stock) {
    if (!line.productUid || line.productUid.length > 200) return false;
    if (line.shapeKey.length > 200 || line.lengthKey.length > 200 || line.size.length > 200) return false;
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 0 || line.quantity > 100_000) return false;
    const key = returnStockKey(line);
    if (keys.has(key)) return false;
    keys.add(key);
  }
  return true;
}

function selectedRefund(
  input: CanonicalResolutionInput,
  remaining: number,
  earnRetainedCents: number,
): number {
  const retain = Math.max(0, earnRetainedCents);
  switch (input.refundMode) {
    case 'full':
      return Math.max(0, remaining - retain);
    case 'courier_deduction':
      return Math.max(0, remaining - input.courierRetainedCents - retain);
    case 'custom':
      return Math.max(0, Math.min(input.customRefundAmountCents ?? 0, remaining - retain));
    case 'none':
      return 0;
  }
}

async function persistPendingRequest(
  pool: pg.Pool,
  review: OrderReturnCaseRow,
  stored: StoredResolutionRequest,
  paymentIntentId: string,
): Promise<number> {
  if (review.resolution_state === 'refund_pending') return review.refund_attempt;
  const attempt = review.refund_attempt + 1;
  await pool.query(
    `update order_return_cases
        set resolution_state = 'refund_pending', resolution_request = $2::jsonb,
            refund_attempt = $3, stripe_payment_intent_id = $4,
            stripe_refund_id = null, stripe_refund_status = null, updated_at = now()
      where id = $1 and resolution_state = 'open'`,
    [review.id, JSON.stringify(stored), attempt, paymentIntentId],
  );
  return attempt;
}

async function restoreSelectedStock(
  client: pg.PoolClient,
  orderId: string,
  returnCaseId: string,
  selected: OrderReturnStockInput[],
): Promise<'ok' | 'stock_selection_invalid' | 'stock_product_missing'> {
  const { rows: ledger } = await client.query<FulfillmentStockRow>(
    `select * from order_fulfillment_stock where order_id = $1 for update`,
    [orderId],
  );
  const exact = ledger.length > 0;
  const allowed = new Map<string, { productId: string | null; max: number | null }>();
  if (exact) {
    for (const line of ledger) {
      allowed.set(
        returnStockKey({
          productUid: line.product_uid,
          shapeKey: line.shape_key,
          lengthKey: line.length_key,
          size: line.size,
        }),
        {
          productId: line.product_id,
          max: line.shipped_quantity - line.restocked_quantity,
        },
      );
    }
  } else {
    const { rows } = await client.query<{
      product_id: string | null;
      product_uid: string;
      shape_key: string;
      length_key: string;
      size: string;
    }>(
      `select max(oi.product_id::text)::uuid as product_id, oi.product_uid,
              oi.shape_key, oi.length_key, oi.size
         from order_items oi
        where oi.order_id = $1
        group by oi.product_uid, oi.shape_key, oi.length_key, oi.size`,
      [orderId],
    );
    for (const line of rows) {
      allowed.set(
        returnStockKey({
          productUid: line.product_uid,
          shapeKey: line.shape_key,
          lengthKey: line.length_key,
          size: line.size,
        }),
        { productId: line.product_id, max: null },
      );
    }
  }

  for (const line of selected) {
    const candidate = allowed.get(returnStockKey(line));
    if (!candidate || (candidate.max !== null && line.quantity > candidate.max)) {
      return 'stock_selection_invalid';
    }
    if (line.quantity === 0) continue;
    if (!candidate.productId) return 'stock_product_missing';
    const product = await client.query<{ id: string }>(
      `select id from products where id = $1 and product_uid = $2`,
      [candidate.productId, line.productUid],
    );
    if (!product.rows[0]) return 'stock_product_missing';
    await client.query(
      `insert into product_availability (product_id, shape_key, length_key, size, quantity)
       values ($1, $2, $3, $4, $5)
       on conflict (product_id, shape_key, length_key, size)
       do update set quantity = product_availability.quantity + excluded.quantity`,
      [candidate.productId, line.shapeKey, line.lengthKey, line.size, line.quantity],
    );
    await client.query(
      `insert into order_return_stock_actions (
         return_case_id, product_id, product_uid, shape_key, length_key, size, quantity
       ) values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        returnCaseId,
        candidate.productId,
        line.productUid,
        line.shapeKey,
        line.lengthKey,
        line.size,
        line.quantity,
      ],
    );
    if (exact) {
      await client.query(
        `update order_fulfillment_stock
            set restocked_quantity = restocked_quantity + $6, updated_at = now()
          where order_id = $1 and product_uid = $2 and shape_key = $3
            and length_key = $4 and size = $5`,
        [orderId, line.productUid, line.shapeKey, line.lengthKey, line.size, line.quantity],
      );
    }
  }
  return 'ok';
}

async function validateStock(
  pool: pg.Pool,
  orderId: string,
  returnCaseId: string,
  selected: OrderReturnStockInput[],
) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await restoreSelectedStock(client, orderId, returnCaseId, selected);
    await client.query('rollback');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type ResolveOrderReturnResult =
  | { ok: true; changed: boolean; order: OrderRow; items: OrderItemRow[]; review: unknown }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'invalid_status'
        | 'invalid_request'
        | 'resolution_conflict'
        | 'stripe_not_configured'
        | 'stripe_action_failed'
        | 'stripe_refund_pending'
        | 'refund_amount_invalid'
        | 'stock_selection_invalid'
        | 'stock_product_missing';
    };

async function resolveLocked(
  pool: pg.Pool,
  stripe: Stripe | undefined,
  orderId: string,
  actorUserId: string,
  rawInput: ResolveOrderReturnInput,
): Promise<ResolveOrderReturnResult> {
  let order = await returnOrderById(pool, orderId);
  if (!order) return { ok: false, reason: 'not_found' };
  let review = await latestReturnCase(pool, orderId, true);
  if (!review || order.status !== 'return_review') {
    const latest = await latestReturnCase(pool, orderId);
    if (order.status === 'cancelled' && latest?.resolution_state === 'resolved') {
      const items = (await attachItems(pool, [order])).get(order.id) ?? [];
      return { ok: true, changed: false, order, items, review: await getOrderReturnReview(pool, order.id) };
    }
    return { ok: false, reason: 'invalid_status' };
  }
  const input = canonicalResolutionInput(rawInput);
  const courierDefaultCents = moneyCents(order.shipping_list_fee ?? order.shipping_fee);
  if (!validInput(input, courierDefaultCents)) return { ok: false, reason: 'invalid_request' };
  const stockValidation = await validateStock(pool, order.id, review.id, input.stock);
  if (stockValidation !== 'ok') return { ok: false, reason: stockValidation };

  let stored = review.resolution_request;
  if (review.resolution_state === 'refund_pending') {
    if (!stored || !sameCanonicalInput(stored.input, input))
      return { ok: false, reason: 'resolution_conflict' };
  }
  const earnRetention = await computeOrderEarnRetention(pool, order.id);
  const loyaltyEarnRetainedCents = stored?.loyaltyEarnRetainedCents ?? moneyCents(earnRetention.spentEuro);
  const piId = order.stripe_payment_intent_id;
  const hasStripePayment =
    !!piId && !piId.startsWith('free:') && order.payment_capture_status !== 'not_required';
  let refundAmountCents = stored?.refundAmountCents ?? 0;
  let stripeRefundId = review.stripe_refund_id;
  let stripeRefundStatus = review.stripe_refund_status;

  if (hasStripePayment) {
    if (!stripe) return { ok: false, reason: 'stripe_not_configured' };
    try {
      let paymentIntent = await stripe.paymentIntents.retrieve(piId!);
      const refunds = await successfulOrderRefundTotal(stripe, piId!);
      if (!stored) {
        if (refunds.pending) return { ok: false, reason: 'stripe_refund_pending' };
        const remaining = Math.max(0, paymentIntent.amount_received - refunds.total);
        refundAmountCents = selectedRefund(input, remaining, loyaltyEarnRetainedCents);
        if (refundAmountCents > remaining) return { ok: false, reason: 'refund_amount_invalid' };
        stored = { input, refundAmountCents, loyaltyEarnRetainedCents };
      }
      if (refundAmountCents > 0) {
        const attempt = await persistPendingRequest(pool, review, stored, piId!);
        review = (await latestReturnCase(pool, orderId, true))!;
        const refund = await stripe.refunds.create(
          {
            payment_intent: piId!,
            amount: refundAmountCents,
            metadata: {
              order_id: order.id,
              return_case_id: review.id,
              loyalty_earn_retained_cents: String(loyaltyEarnRetainedCents),
            },
          },
          { idempotencyKey: `order-return:${review.id}:refund:${attempt}` },
        );
        stripeRefundId = refund.id;
        stripeRefundStatus = refund.status;
        await pool.query(
          `update order_return_cases set stripe_refund_id = $2, stripe_refund_status = $3, updated_at = now() where id = $1`,
          [review.id, refund.id, refund.status],
        );
        if (refund.status === 'pending') return { ok: false, reason: 'stripe_refund_pending' };
        if (refund.status !== 'succeeded') {
          await pool.query(
            `update order_return_cases set resolution_state = 'open', updated_at = now() where id = $1`,
            [review.id],
          );
          return { ok: false, reason: 'stripe_action_failed' };
        }
      } else if (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'canceled') {
        paymentIntent = await stripe.paymentIntents.cancel(
          piId!,
          {},
          { idempotencyKey: `order-return:${review.id}:cancel` },
        );
        if (paymentIntent.status !== 'canceled') return { ok: false, reason: 'stripe_action_failed' };
      }
    } catch (error) {
      console.error(`[orderReturnReview] Stripe resolution failed for ${order.order_number}`, error);
      return { ok: false, reason: 'stripe_action_failed' };
    }
  } else {
    refundAmountCents = selectedRefund(input, 0, loyaltyEarnRetainedCents);
    if (refundAmountCents !== 0) return { ok: false, reason: 'refund_amount_invalid' };
    stored = { input, refundAmountCents, loyaltyEarnRetainedCents };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    order = await returnOrderById(client, orderId, true);
    review = await latestReturnCase(client, orderId, true);
    if (!order || !review) {
      await client.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    if (order.status !== 'return_review') {
      await client.query('rollback');
      return { ok: false, reason: 'invalid_status' };
    }
    const stockResult = await restoreSelectedStock(client, order.id, review.id, input.stock);
    if (stockResult !== 'ok') {
      await client.query('rollback');
      return { ok: false, reason: stockResult };
    }
    await refundConsumedLoyaltyForOrder(client, order.id);
    await voidPendingOrderEarn(client, order.id);
    await reverseUnusedOrderEarn(client, order.id);
    await client.query(
      `update order_return_cases
          set resolution_state = 'resolved', decision_reason = $2, refund_mode = $3,
              refund_amount_cents = $4, courier_retained_cents = $5, courier_default_cents = $6,
              courier_override_reason = $7, resolution_request = $8::jsonb,
              stripe_payment_intent_id = $9, stripe_refund_id = $10, stripe_refund_status = $11,
              loyalty_earn_retained_cents = $12,
              resolved_by = $13, resolved_at = now(), updated_at = now()
        where id = $1`,
      [
        review.id,
        input.decisionReason,
        input.refundMode,
        refundAmountCents,
        input.courierRetainedCents,
        courierDefaultCents,
        input.courierOverrideReason,
        JSON.stringify(stored),
        piId ?? null,
        stripeRefundId,
        stripeRefundStatus,
        loyaltyEarnRetainedCents,
        actorUserId,
      ],
    );
    const { rows } = await client.query<OrderRow>(
      `update orders set status = 'cancelled', admin_verified_at = now(),
              status_updated_at = now(), updated_at = now() where id = $1 returning *`,
      [order.id],
    );
    await client.query('commit');
    const updated = decryptOrderRow(rows[0]!);
    try {
      await bumpRetentionAfterOrderTerminal(pool, stripe, updated);
    } catch (error) {
      console.error('[orderReturnReview] card retention bump failed', error);
    }
    await sendOrderReturnResolutionEmail(pool, updated.id).catch(() => undefined);
    const items = (await attachItems(pool, [updated])).get(updated.id) ?? [];
    return {
      ok: true,
      changed: true,
      order: updated,
      items,
      review: await getOrderReturnReview(pool, updated.id),
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function resolveOrderReturnReview(
  pool: pg.Pool,
  stripe: Stripe | undefined,
  orderId: string,
  actorUserId: string,
  input: ResolveOrderReturnInput,
): Promise<ResolveOrderReturnResult> {
  const lockClient = await pool.connect();
  const key = `order-return-resolution:${orderId}`;
  try {
    await lockClient.query(`select pg_advisory_lock(87219, hashtext($1))`, [key]);
    return await resolveLocked(pool, stripe, orderId, actorUserId, input);
  } finally {
    await lockClient.query(`select pg_advisory_unlock(87219, hashtext($1))`, [key]).catch(() => undefined);
    lockClient.release();
  }
}
