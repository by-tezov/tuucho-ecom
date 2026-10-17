import type Stripe from 'stripe';
import { pool } from '../../../db/pool.js';
import { persistGuestSavedCheckout } from '../../customers/application/guestSavedCheckout.js';
import * as orders from '../../orders/application/ordersFacade.js';
import { isLanguage } from '../../../utils/language.js';
import {
  bindGiftOrderFromPaymentIntent,
  bindGiftOrderFromReservation,
} from '../../gift/application/giftCheckout.js';
import { ensureOrderConfirmationEnqueued } from '../../orders/application/orderMailJob.js';

function paymentMethodSnapshotFromIntent(
  paymentIntent: Stripe.PaymentIntent,
): orders.OrderPaymentMethodSnapshot {
  const types = paymentIntent.payment_method_types ?? [];
  const method = paymentIntent.payment_method;
  const expanded = method && typeof method !== 'string' ? method : null;

  if (expanded?.type === 'paypal' || (types.includes('paypal') && !expanded)) {
    return { type: 'paypal', brand: null, last4: null };
  }
  if (expanded?.type === 'bancontact' || (types.includes('bancontact') && !expanded)) {
    return { type: 'bancontact', brand: null, last4: null };
  }
  if (expanded?.type === 'card' && expanded.card) {
    return {
      type: 'card',
      brand: expanded.card.brand ?? 'unknown',
      last4: expanded.card.last4 ?? null,
    };
  }
  if (
    types.includes('card') ||
    types.includes('link') ||
    (!types.includes('paypal') && !types.includes('bancontact'))
  ) {
    return { type: 'card', brand: null, last4: null };
  }
  if (types.includes('bancontact')) {
    return { type: 'bancontact', brand: null, last4: null };
  }
  return { type: 'paypal', brand: null, last4: null };
}

/** Settlement retries arrive within hours (Stripe webhook retries, finalize
 * racing the webhook); a later replay, such as the capture event days later,
 * must not re-run the post-creation steps. Compared in SQL, see db/pool.ts. */
async function isRecentOrder(orderId: string): Promise<boolean> {
  const { rows } = await pool.query<{ recent: boolean }>(
    `select created_at > now() - interval '1 day' as recent from orders where id = $1`,
    [orderId],
  );
  return rows[0]?.recent === true;
}

async function createNeedReviewOrderAfterSettlementFailure(input: {
  paymentIntent: Stripe.PaymentIntent;
  stripe: Stripe;
  reservationId: string;
  userId?: string;
  guestEmail?: string;
  addressId?: string;
  billingAddressId?: string;
  express: boolean;
  paymentCaptureStatus: orders.PaymentCaptureStatus;
  paymentMethod: orders.OrderPaymentMethodSnapshot | null;
  paymentMethodId?: string | null;
  language?: string;
  reason: string;
  blocked?: boolean;
}): Promise<orders.ConfirmOrderResult | null> {
  let result: orders.ConfirmOrderResult;
  try {
    result = await orders.createNeedReviewOrderFromReservation(pool, {
      userId: input.userId,
      guestEmail: input.guestEmail,
      addressId: input.addressId,
      billingAddressId: input.billingAddressId,
      express: input.express,
      stripePaymentIntentId: input.paymentIntent.id,
      reservationId: input.reservationId,
      paymentCaptureStatus: input.paymentCaptureStatus,
      paymentMethod: input.paymentMethod,
      paymentMethodId: input.paymentMethodId,
      reason: input.reason,
      blocked: input.blocked,
      language: typeof input.language === 'string' && isLanguage(input.language) ? input.language : 'en',
    });
  } catch (error) {
    console.error(`[checkout] payment ${input.paymentIntent.id} need-review order creation failed`, error);
    return null;
  }
  if (!result.ok) {
    console.error(
      `[checkout] payment ${input.paymentIntent.id} need-review order creation failed: ${result.reason}`,
    );
    return null;
  }
  if (result.created) {
    if (!input.userId && result.guestSaved && input.guestEmail) {
      await persistGuestSavedCheckout(pool, input.stripe, {
        email: input.guestEmail,
        orderId: result.order.id,
        intent: result.guestSaved,
        paymentMethodId: input.paymentMethodId ?? null,
      });
    }
    // A need-review order still paid for the gift: bind it, or the offer
    // stays `paying` and keeps sending "pay" reminders.
    await bindGiftOrderFromReservation(pool, input.reservationId, result.order.id);
    await ensureOrderConfirmationEnqueued(pool, {
      userId: result.order.user_id ?? undefined,
      orderId: result.order.id,
      guestLanguage:
        !input.userId && typeof input.language === 'string' && isLanguage(input.language)
          ? input.language
          : undefined,
    });
  }
  return result;
}

/** Turn a settled Stripe PaymentIntent into exactly one durable order.
 *
 * Both the browser finalize endpoint and Stripe webhook call this use case.
 * The reservation/order constraints provide idempotency; settlement anomalies
 * become operator-visible `need_review` orders instead of being hidden in an
 * HTTP controller.
 */
export async function settlePaymentIntent(stripe: Stripe, paymentIntent: Stripe.PaymentIntent) {
  const metadata = paymentIntent.metadata as Record<string, string | undefined>;
  const { addressId, billingAddressId, courierCode, voucherCode, language } = metadata;
  const express = metadata.express === 'true';

  let paymentCaptureStatus: orders.PaymentCaptureStatus;
  if (paymentIntent.status === 'requires_capture') {
    paymentCaptureStatus = 'authorized';
  } else if (paymentIntent.status === 'succeeded') {
    paymentCaptureStatus = 'captured';
  } else {
    console.error(
      `[checkout] payment ${paymentIntent.id} has unexpected status ${paymentIntent.status} — cannot create order.`,
    );
    return { ok: false as const, reason: 'payment_not_completed', retryable: false };
  }

  const existingOrder = await orders.findSettledOrderByPaymentIntent(
    pool,
    paymentIntent.id,
    paymentCaptureStatus,
  );
  if (existingOrder) {
    // Replay of a settlement whose order already exists. The steps after
    // order creation are not in its transaction, so a crash or error there
    // was never retried: re-run them, both idempotent, for a recent order.
    if (existingOrder.ok && (await isRecentOrder(existingOrder.order.id))) {
      await bindGiftOrderFromPaymentIntent(pool, paymentIntent.id, existingOrder.order.id);
      await ensureOrderConfirmationEnqueued(pool, {
        userId: existingOrder.order.user_id ?? undefined,
        orderId: existingOrder.order.id,
        guestLanguage:
          !existingOrder.order.user_id && typeof language === 'string' && isLanguage(language)
            ? language
            : undefined,
      });
    }
    return existingOrder;
  }

  const settlement = await orders.findPaymentSettlementReservation(pool, paymentIntent.id);
  if (!settlement) {
    console.error(`[checkout] payment ${paymentIntent.id} has no linked checkout reservation.`);
    return { ok: false as const, reason: 'missing_reservation', retryable: true };
  }
  const reservationId = settlement.reservationId;
  const userId = settlement.userId ?? undefined;
  const guestEmail = settlement.userId ? undefined : (settlement.guestEmail ?? metadata.guestEmail);
  const isGuest = !userId;
  if (isGuest && !guestEmail) {
    console.error(`[checkout] payment ${paymentIntent.id} has no recoverable guest owner.`);
    return { ok: false as const, reason: 'missing_metadata', retryable: true };
  }

  const reviewReasons: string[] = [];
  let reviewBlocked = false;
  if (metadata.reservationId !== reservationId) {
    reviewReasons.push('Stripe reservation metadata did not match the database link');
    reviewBlocked = true;
  }
  if (userId && metadata.userId !== userId) {
    reviewReasons.push('Stripe account metadata did not match the reservation owner');
    reviewBlocked = true;
  }
  if (
    isGuest &&
    metadata.guestEmail &&
    guestEmail &&
    metadata.guestEmail.trim().toLowerCase() !== guestEmail.trim().toLowerCase()
  ) {
    reviewReasons.push('Stripe guest email metadata did not match the encrypted reservation owner');
    reviewBlocked = true;
  }
  if (settlement.expectedAmountCents !== null && paymentIntent.amount !== settlement.expectedAmountCents) {
    reviewReasons.push(
      `Stripe amount ${paymentIntent.amount} did not match reserved amount ${settlement.expectedAmountCents}`,
    );
    reviewBlocked = true;
  }
  if (paymentIntent.currency.toLowerCase() !== 'eur') {
    reviewReasons.push(`unexpected Stripe currency ${paymentIntent.currency}`);
    reviewBlocked = true;
  }

  let paymentMethod: orders.OrderPaymentMethodSnapshot | null = null;
  let confirmedPaymentMethodId: string | null = null;
  try {
    const expanded = await stripe.paymentIntents.retrieve(paymentIntent.id, {
      expand: ['payment_method'],
    });
    paymentMethod = paymentMethodSnapshotFromIntent(expanded);
    const expandedMethod = expanded.payment_method;
    confirmedPaymentMethodId =
      typeof expandedMethod === 'string' ? expandedMethod : (expandedMethod?.id ?? null);
  } catch (error) {
    console.error(`[checkout] payment ${paymentIntent.id} method snapshot failed`, error);
    paymentMethod = paymentMethodSnapshotFromIntent(paymentIntent);
    const unexpandedMethod = paymentIntent.payment_method;
    confirmedPaymentMethodId =
      typeof unexpandedMethod === 'string' ? unexpandedMethod : (unexpandedMethod?.id ?? null);
  }
  if (metadata.paymentMethodId && confirmedPaymentMethodId !== metadata.paymentMethodId) {
    reviewReasons.push('PaymentIntent used an unexpected PaymentMethod');
    reviewBlocked = true;
  }
  if (isGuest ? !metadata.guestEmail || !courierCode : !metadata.userId || !addressId || !courierCode) {
    reviewReasons.push('settled payment had incomplete checkout metadata');
  }

  if (reviewReasons.length > 0) {
    const reviewOrder = await createNeedReviewOrderAfterSettlementFailure({
      paymentIntent,
      stripe,
      reservationId,
      userId,
      guestEmail,
      addressId,
      billingAddressId,
      express,
      paymentCaptureStatus,
      paymentMethod,
      paymentMethodId: confirmedPaymentMethodId,
      language,
      reason: reviewReasons.join('; '),
      blocked: reviewBlocked,
    });
    if (reviewOrder) return reviewOrder;
    return { ok: false as const, reason: 'payment_not_completed', retryable: true };
  }

  let result: Awaited<ReturnType<typeof orders.confirmOrder>>;
  try {
    result = isGuest
      ? await orders.confirmGuestOrder(
          pool,
          guestEmail!,
          express,
          paymentIntent.id,
          reservationId,
          paymentCaptureStatus,
          paymentMethod,
          typeof language === 'string' && isLanguage(language) ? language : 'en',
        )
      : await orders.confirmOrder(
          pool,
          userId!,
          addressId!,
          courierCode!,
          express,
          paymentIntent.id,
          reservationId,
          voucherCode,
          billingAddressId,
          paymentCaptureStatus,
          paymentMethod,
          confirmedPaymentMethodId ?? undefined,
        );
  } catch (error) {
    const reviewOrder = await createNeedReviewOrderAfterSettlementFailure({
      paymentIntent,
      stripe,
      reservationId,
      userId: isGuest ? undefined : userId,
      guestEmail: isGuest ? guestEmail : undefined,
      addressId,
      billingAddressId,
      express,
      paymentCaptureStatus,
      paymentMethod,
      paymentMethodId: confirmedPaymentMethodId,
      language,
      reason: `order creation threw: ${error instanceof Error ? error.message : String(error)}`,
    });
    if (reviewOrder) return reviewOrder;
    console.error(`[checkout] payment ${paymentIntent.id} settled but order creation threw`, error);
    return { ok: false as const, reason: 'payment_not_completed', retryable: true };
  }
  if (!result.ok) {
    const reviewOrder = await createNeedReviewOrderAfterSettlementFailure({
      paymentIntent,
      stripe,
      reservationId,
      userId: isGuest ? undefined : userId,
      guestEmail: isGuest ? guestEmail : undefined,
      addressId,
      billingAddressId,
      express,
      paymentCaptureStatus,
      paymentMethod,
      paymentMethodId: confirmedPaymentMethodId,
      language,
      reason: `order creation failed: ${result.reason}`,
    });
    if (reviewOrder) return reviewOrder;
    return { ok: false as const, reason: 'payment_not_completed', retryable: true };
  }

  if (result.created) {
    await bindGiftOrderFromReservation(pool, reservationId, result.order.id);
    const { rows: giftRows } = await pool.query<{ gift_offer_id: string | null; gift_snapshot: unknown }>(
      `select gift_offer_id, gift_snapshot from orders where id = $1`,
      [result.order.id],
    );
    if (giftRows[0]) {
      result.order.gift_offer_id = giftRows[0].gift_offer_id;
      result.order.gift_snapshot = giftRows[0].gift_snapshot;
    }
    if (isGuest && result.guestSaved) {
      // new_card remember is applied inside persist via allow_redisplay when
      // the snapshot still has rememberCard: false (opt-in is pay-sheet only).
      await persistGuestSavedCheckout(pool, stripe, {
        email: guestEmail!,
        orderId: result.order.id,
        intent: result.guestSaved,
        paymentMethodId: confirmedPaymentMethodId,
      });
    }
    await ensureOrderConfirmationEnqueued(pool, {
      userId: result.order.user_id ?? undefined,
      orderId: result.order.id,
      guestLanguage: isGuest && typeof language === 'string' && isLanguage(language) ? language : undefined,
    });
  }
  return result;
}
