import type pg from 'pg';
import { type OrderRow } from '../domain/order.js';
import { decryptOrderRow } from '../infrastructure/orderRows.js';

export type EnsurePaymentCapturedResult =
  | { ok: true; order: OrderRow }
  | {
      ok: false;
      reason: 'payment_capture_failed' | 'stripe_not_configured';
      message: string;
      order: OrderRow;
    };

function paymentErrorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

/** Captures an authorized PaymentIntent if needed. Idempotent for already
 * captured / not_required orders. A durable `payment_operation='capture'`
 * marker serializes this against cancellation across processes; the marker
 * is committed before calling Stripe, so network latency never occupies a
 * row lock or a pool connection. A retry resumes the same operation with the
 * same Stripe idempotency key if the process stopped after the remote call. */
export async function ensurePaymentCaptured(
  pool: pg.Pool,
  stripe: import('stripe').default,
  order: OrderRow,
): Promise<EnsurePaymentCapturedResult> {
  let current: OrderRow;
  const claimClient = await pool.connect();
  try {
    await claimClient.query('begin');
    const { rows } = await claimClient.query<OrderRow>(`select * from orders where id = $1 for update`, [
      order.id,
    ]);
    const found = rows[0] ? decryptOrderRow(rows[0]) : undefined;
    if (!found) {
      await claimClient.query('rollback');
      return {
        ok: false,
        reason: 'payment_capture_failed',
        message: `Order ${order.order_number} no longer exists; cannot capture.`,
        order,
      };
    }
    current = found;
    if (current.payment_capture_status === 'captured' || current.payment_capture_status === 'not_required') {
      if (current.payment_operation === 'capture') {
        const { rows: clearedRows } = await claimClient.query<OrderRow>(
          `update orders
              set payment_operation = null, payment_operation_started_at = null, updated_at = now()
            where id = $1 and payment_operation = 'capture'
            returning *`,
          [current.id],
        );
        if (clearedRows[0]) current = decryptOrderRow(clearedRows[0]);
      }
      await claimClient.query('commit');
      return { ok: true, order: current };
    }
    if (current.payment_capture_status === 'canceled') {
      await claimClient.query('commit');
      return {
        ok: false,
        reason: 'payment_capture_failed',
        message: `Order ${current.order_number} payment authorization was canceled; cannot capture.`,
        order: current,
      };
    }
    if (current.payment_capture_status === 'expired') {
      await claimClient.query('commit');
      return {
        ok: false,
        reason: 'payment_capture_failed',
        message: `Order ${current.order_number} payment authorization expired; cannot capture.`,
        order: current,
      };
    }

    const piId = current.stripe_payment_intent_id;
    if (!piId || piId.startsWith('free:')) {
      const { rows: updatedRows } = await claimClient.query<OrderRow>(
        `update orders
            set payment_capture_status = 'not_required',
                payment_operation = null,
                payment_operation_started_at = null,
                updated_at = now()
          where id = $1
          returning *`,
        [current.id],
      );
      await claimClient.query('commit');
      return { ok: true, order: decryptOrderRow(updatedRows[0]!) };
    }

    if (current.payment_operation !== null && current.payment_operation !== 'capture') {
      await claimClient.query('commit');
      return {
        ok: false,
        reason: 'payment_capture_failed',
        message: `Order ${current.order_number} payment cancellation is already in progress. Status left unchanged.`,
        order: current,
      };
    }
    if (current.payment_operation === null) {
      const { rows: claimedRows } = await claimClient.query<OrderRow>(
        `update orders
            set payment_operation = 'capture', payment_operation_started_at = now(), updated_at = now()
          where id = $1
          returning *`,
        [current.id],
      );
      current = decryptOrderRow(claimedRows[0]!);
    }
    await claimClient.query('commit');
  } catch (error) {
    await claimClient.query('rollback').catch(() => undefined);
    return {
      ok: false,
      reason: 'payment_capture_failed',
      message: `Order ${order.order_number} payment capture preparation failed: ${paymentErrorDetail(error)}. Status left unchanged.`,
      order,
    };
  } finally {
    claimClient.release();
  }

  const piId = current.stripe_payment_intent_id!;
  let paymentIntent: import('stripe').default.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(piId);
    if (paymentIntent.status === 'succeeded') {
      // Already captured outside this path (Dashboard, prior attempt).
    } else if (paymentIntent.status === 'requires_capture') {
      paymentIntent = await stripe.paymentIntents.capture(
        piId,
        {},
        { idempotencyKey: `order:${current.id}:capture` },
      );
    }
  } catch (error) {
    // Keep the durable capture marker. A timeout is an unknown remote result;
    // retrying this action safely resumes with the same idempotency key.
    return {
      ok: false,
      reason: 'payment_capture_failed',
      message: `Order ${order.order_number} payment capture failed: ${paymentErrorDetail(error)}. Status left unchanged.`,
      order,
    };
  }

  const finalizeClient = await pool.connect();
  try {
    await finalizeClient.query('begin');
    const { rows } = await finalizeClient.query<OrderRow>(`select * from orders where id = $1 for update`, [
      current.id,
    ]);
    let latest = rows[0] ? decryptOrderRow(rows[0]) : undefined;
    if (!latest) {
      await finalizeClient.query('rollback');
      return {
        ok: false,
        reason: 'payment_capture_failed',
        message: `Order ${order.order_number} no longer exists after Stripe capture.`,
        order,
      };
    }
    if (latest.payment_capture_status === 'captured') {
      const { rows: clearedRows } = await finalizeClient.query<OrderRow>(
        `update orders
            set payment_operation = null, payment_operation_started_at = null, updated_at = now()
          where id = $1 and payment_operation = 'capture'
          returning *`,
        [latest.id],
      );
      await finalizeClient.query('commit');
      return { ok: true, order: decryptOrderRow(clearedRows[0] ?? rows[0]!) };
    }
    if (latest.payment_operation !== 'capture') {
      await finalizeClient.query('rollback');
      return {
        ok: false,
        reason: 'payment_capture_failed',
        message: `Order ${latest.order_number} payment operation changed during capture. Status left unchanged.`,
        order: latest,
      };
    }

    if (paymentIntent.status === 'succeeded') {
      const { rows: capturedRows } = await finalizeClient.query<OrderRow>(
        `update orders
            set payment_capture_status = 'captured',
                payment_operation = null,
                payment_operation_started_at = null,
                updated_at = now()
          where id = $1
          returning *`,
        [latest.id],
      );
      await finalizeClient.query('commit');
      return { ok: true, order: decryptOrderRow(capturedRows[0]!) };
    }

    const captureStatus = paymentIntent.status === 'canceled' ? 'expired' : latest.payment_capture_status;
    const { rows: releasedRows } = await finalizeClient.query<OrderRow>(
      `update orders
          set payment_capture_status = $2,
              payment_operation = null,
              payment_operation_started_at = null,
              updated_at = now()
        where id = $1
        returning *`,
      [latest.id, captureStatus],
    );
    latest = decryptOrderRow(releasedRows[0]!);
    await finalizeClient.query('commit');
    return {
      ok: false,
      reason: 'payment_capture_failed',
      message:
        paymentIntent.status === 'canceled'
          ? `Order ${latest.order_number} payment authorization expired (PaymentIntent canceled). Status left unchanged.`
          : `Order ${latest.order_number} payment cannot be captured (PaymentIntent status is "${paymentIntent.status}"). Status left unchanged.`,
      order: latest,
    };
  } catch (error) {
    await finalizeClient.query('rollback').catch(() => undefined);
    return {
      ok: false,
      reason: 'payment_capture_failed',
      message: `Order ${order.order_number} payment capture finalization failed: ${paymentErrorDetail(error)}. Status left unchanged.`,
      order,
    };
  } finally {
    finalizeClient.release();
  }
}

/** Marks an order's still-authorized hold as expired when Stripe reports the
 * auth window ended (`charge.expired` / PI canceled). Idempotent: only
 * `authorized` → `expired`. Does not change order lifecycle status. */
export async function markPaymentAuthorizationExpired(
  pool: pg.Pool,
  stripePaymentIntentId: string,
): Promise<OrderRow | undefined> {
  const { rows } = await pool.query<OrderRow>(
    `update orders
        set payment_capture_status = 'expired', updated_at = now()
      where stripe_payment_intent_id = $1
        and payment_capture_status = 'authorized'
      returning *`,
    [stripePaymentIntentId],
  );
  return rows[0] ? decryptOrderRow(rows[0]) : undefined;
}

type PaymentAuthorizationRelease =
  'not_needed' | 'canceled' | 'captured' | 'failed' | 'stripe_not_configured';

/** Releases a pre-capture authorization when ops cancel an order. It reports
 * the Stripe result instead of swallowing it, so the caller never records a
 * canceled order while funds may still be captured. */
export async function releasePaymentAuthorization(
  stripe: import('stripe').default | undefined,
  order: OrderRow,
  idempotencyKey = `order:${order.id}:cancel`,
): Promise<PaymentAuthorizationRelease> {
  if (order.payment_capture_status !== 'authorized') return 'not_needed';
  const piId = order.stripe_payment_intent_id;
  if (!piId || piId.startsWith('free:')) return 'not_needed';
  if (!stripe) return 'stripe_not_configured';
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(piId);
    if (paymentIntent.status === 'requires_capture') {
      await stripe.paymentIntents.cancel(piId, {}, { idempotencyKey });
      return 'canceled';
    }
    if (paymentIntent.status === 'canceled') return 'canceled';
    if (paymentIntent.status === 'succeeded') return 'captured';
    return 'failed';
  } catch (error) {
    console.error(`[order] failed to cancel authorization for ${order.order_number}`, error);
    return 'failed';
  }
}

/** An operations-only cancellation: releasing the consumed reservation makes
 * every ordered shape/size available again. The same durable cancel marker as
 * customer cancellation serializes this against capture without holding a DB
 * connection during Stripe I/O. Captured payments are refused because this
 * operation has no automatic refund policy. */
