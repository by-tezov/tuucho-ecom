import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { consumeOneTimeCardForOrder } from '../../../payments/application/cardRetention.js';
import { emailLookupHash, encryptPii } from '../../../../platform/security/piiCrypto.js';
import type { Language } from '../../../../utils/language.js';
import { runCheckoutConfirm, runCheckoutRelease } from '../checkoutOpenings.js';
import { buildOrderPluginSnapshot, leftoverCommerceColumnsFromSnapshot } from '../orderPluginSnapshot.js';
import { type OrderRow } from '../../domain/order.js';
import { attachItems, decryptOrderRow } from '../../infrastructure/orderRows.js';
import { type StockReservation } from '../pricing/checkoutPricing.js';
import { loadCheckoutReservationSnapshot } from '../reservation/checkoutReservation.js';
import {
  type ConfirmOrderResult,
  type OrderPaymentMethodSnapshot,
  type PaymentCaptureStatus,
  finalizeAuthenticatedCartAfterOrder,
  findSettledOrderByPaymentIntent,
  insertOrderItems,
  sealOrderIntegrity,
} from './orderConfirmationSupport.js';

export interface NeedReviewOrderInput {
  userId?: string;
  guestEmail?: string;
  addressId?: string;
  billingAddressId?: string;
  express: boolean;
  stripePaymentIntentId: string;
  reservationId: string;
  paymentCaptureStatus: PaymentCaptureStatus;
  paymentMethod?: OrderPaymentMethodSnapshot | null;
  paymentMethodId?: string | null;
  reason: string;
  blocked?: boolean;
  language?: Language;
}

/** Creates the customer-visible order record used when Stripe has settled but
 * the normal confirmation path cannot finish. A resumable review consumes its
 * commercial holds; a blocked review releases still-held resources because it
 * can only be cancelled. In both cases the payment remains untouched until a
 * human decides what Stripe action is required. The reservation snapshot is
 * the only source of commercial data; the mutable cart/catalog must never
 * change what was already paid for. */
export async function createNeedReviewOrderFromReservation(
  pool: pg.Pool,
  input: NeedReviewOrderInput,
): Promise<ConfirmOrderResult> {
  const { rows: existingRows } = await pool.query<OrderRow>(
    `select * from orders where stripe_payment_intent_id = $1`,
    [input.stripePaymentIntentId],
  );
  let existing = existingRows[0] ? decryptOrderRow(existingRows[0]) : undefined;
  if (existing) {
    if (existing.payment_capture_status === 'authorized' && input.paymentCaptureStatus === 'captured') {
      const { rows: updatedRows } = await pool.query<OrderRow>(
        `update orders set payment_capture_status = 'captured',
                           payment_operation = null,
                           payment_operation_started_at = null,
                           updated_at = now()
          where id = $1 and payment_capture_status = 'authorized'
          returning *`,
        [existing.id],
      );
      if (updatedRows[0]) existing = decryptOrderRow(updatedRows[0]);
    }
    const itemsByOrder = await attachItems(pool, [existing]);
    return { ok: true, order: existing, items: itemsByOrder.get(existing.id) ?? [], created: false };
  }

  const isGuest = !input.userId;
  if (isGuest !== !!input.guestEmail) return { ok: false, reason: 'size_unavailable' };

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: reservationRows } = await client.query<StockReservation & { order_id: string | null }>(
      `select id, user_id, stripe_payment_intent_id, order_id, state, expires_at
       from stock_reservations
       where id = $1
         and stripe_payment_intent_id = $2
         and (($3::uuid is not null and user_id = $3::uuid) or ($3::uuid is null and user_id is null))
       for update`,
      [input.reservationId, input.stripePaymentIntentId, input.userId ?? null],
    );
    const reservation = reservationRows[0];
    if (!reservation) {
      await client.query('rollback');
      return { ok: false, reason: 'size_unavailable' };
    }
    if (reservation.order_id) {
      // The ordinary confirmation or another webhook won the race while this
      // call waited for the reservation lock. Re-read its durable result
      // instead of attempting a second insert for the same PaymentIntent.
      await client.query('rollback');
      return (
        (await findSettledOrderByPaymentIntent(
          pool,
          input.stripePaymentIntentId,
          input.paymentCaptureStatus,
        )) ?? { ok: false, reason: 'size_unavailable' }
      );
    }
    const reservationSnapshot = await loadCheckoutReservationSnapshot(client, input.reservationId);
    if (!reservationSnapshot) {
      await client.query('rollback');
      return { ok: false, reason: 'size_unavailable' };
    }

    const priced = reservationSnapshot.priced;
    const addressIds = [input.addressId, input.billingAddressId].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    const ownedAddressIds = new Set<string>();
    if (input.userId && addressIds.length > 0) {
      const { rows: ownedRows } = await client.query<{ id: string }>(
        `select id from addresses where user_id = $1 and id = any($2::uuid[]) for update`,
        [input.userId, addressIds],
      );
      for (const row of ownedRows) ownedAddressIds.add(row.id);
    }
    const addressId = input.userId && ownedAddressIds.has(input.addressId ?? '') ? input.addressId! : null;
    const billingAddressId =
      input.userId && ownedAddressIds.has(input.billingAddressId ?? '') ? input.billingAddressId! : null;
    const courierId = priced.courier.id;
    const { rows: courierRows } = await client.query<{ id: string }>(
      `select id from couriers where id = $1`,
      [courierId],
    );
    const { rows: networkRows } = await client.query<{ code: string }>(
      `select code from delivery_networks where code = $1`,
      [priced.networkCode],
    );
    const methodType = input.paymentMethod?.type ?? null;
    const methodBrand = input.paymentMethod?.type === 'card' ? (input.paymentMethod.brand ?? null) : null;
    const methodLast4 = input.paymentMethod?.type === 'card' ? (input.paymentMethod.last4 ?? null) : null;
    const pluginSnapshot = await buildOrderPluginSnapshot(
      { plugins: { ...(priced.plugins ?? {}) } },
      { client, priced, extraLines: priced.extraLines ?? [], guest: isGuest },
    );
    const leftover = leftoverCommerceColumnsFromSnapshot(pluginSnapshot);
    const orderId = randomUUID();
    const stockReservationInactive =
      reservation.state !== 'held' || new Date(reservation.expires_at).getTime() <= Date.now();
    let blocked = input.blocked === true || stockReservationInactive;
    let reason = input.reason.trim().slice(0, 500) || 'Payment settled but order confirmation needs review.';
    if (stockReservationInactive) {
      reason = `${reason}; stock reservation was no longer active`.slice(0, 500);
    }
    const guestEmail = isGuest ? encryptPii(input.guestEmail!) : null;
    const { rows: orderRows } = await client.query<OrderRow>(
      `insert into orders (
         id, user_id, guest_email, status, status_reason, need_review_blocked,
         recipient_name, company_name, line1, line2, delivery_notes, postal_code, city, country_code, phone, address_id,
         network_code, pickup_point, courier_id, courier_code, courier_name, packet_key, express, shipping_fee,
         shipping_list_fee, rules_item_discount, cart_rules_snapshot,
         voucher_code, voucher_item_discount, voucher_shipping_discount,
         loyalty_credit, loyalty_earn, loyalty_earn_status,
         total, stripe_payment_intent_id,
         payment_capture_status, payment_method_type, payment_card_brand, payment_card_last4,
         billing_address_id, billing_recipient_name, billing_company_name, billing_line1, billing_line2,
         billing_postal_code, billing_city, billing_country_code, billing_phone, billing_same_as_shipping,
         customer_type, language, guest_email_lookup, plugin_snapshot
       )
       values (
         $1, $2, $3, 'need_review', $4, $5,
         $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
         $16, $17::jsonb, $18, $19, $20, $21, $22, $23,
         $24, $25, $26::jsonb,
         $27, $28, $29, $30, $31, $32,
         $33, $34,
         $35, $36, $37, $38,
         $39, $40, $41, $42, $43,
         $44, $45, $46, $47, $48,
         $49, $50, $51, $52::jsonb
       )
       returning *`,
      [
        orderId,
        input.userId ?? null,
        guestEmail,
        reason,
        blocked,
        encryptPii(priced.address.recipient_name),
        encryptPii(priced.address.company_name),
        encryptPii(priced.address.line1),
        encryptPii(priced.address.line2),
        encryptPii(priced.address.delivery_notes),
        encryptPii(priced.address.postal_code),
        encryptPii(priced.address.city),
        priced.address.country_code,
        encryptPii(priced.address.phone),
        addressId,
        networkRows[0]?.code ?? null,
        JSON.stringify(priced.pickupPoint),
        courierRows[0]?.id ?? null,
        priced.courier.code,
        priced.courier.name,
        priced.packetKey,
        input.express,
        priced.shippingFee,
        priced.shippingListFee,
        priced.rulesItemDiscount,
        JSON.stringify(priced.cartRules.snapshot),
        leftover.voucherCode,
        leftover.voucherItemDiscount,
        leftover.voucherShippingDiscount,
        leftover.loyaltyCredit,
        leftover.loyaltyEarn,
        leftover.loyaltyEarnStatus,
        priced.total,
        input.stripePaymentIntentId,
        input.paymentCaptureStatus,
        methodType,
        methodBrand,
        methodLast4,
        billingAddressId,
        encryptPii(priced.billingAddress.recipient_name),
        encryptPii(priced.billingAddress.company_name),
        encryptPii(priced.billingAddress.line1),
        encryptPii(priced.billingAddress.line2),
        encryptPii(priced.billingAddress.postal_code),
        encryptPii(priced.billingAddress.city),
        priced.billingAddress.country_code,
        encryptPii(priced.billingAddress.phone),
        priced.billingSameAsShipping,
        priced.customerType,
        isGuest ? (input.language ?? 'en') : null,
        isGuest ? emailLookupHash(input.guestEmail!) : null,
        JSON.stringify(pluginSnapshot),
      ],
    );
    const order = decryptOrderRow(orderRows[0]!);

    if (!blocked && input.userId && input.paymentMethodId && methodType === 'card') {
      const consumed = await consumeOneTimeCardForOrder(client, input.userId, input.paymentMethodId);
      if (consumed) {
        await client.query(
          `update customer_card_retention
             set one_time_consumed_order_id = $3, last_order_id = $3, updated_at = now()
           where user_id = $1 and stripe_payment_method_id = $2
             and purpose = 'one_time' and checkout_use_status = 'one_time_consumed'
             and one_time_consumed_order_id is null`,
          [input.userId, input.paymentMethodId, orderId],
        );
      } else {
        blocked = true;
        reason = `${reason}; one-time payment method state could not be consumed`.slice(0, 500);
      }
    }

    if (!blocked) {
      const confirmed = await runCheckoutConfirm({
        client,
        userId: input.userId,
        reservationId: input.reservationId,
        orderId,
        priced,
        snapshot: pluginSnapshot,
        guest: isGuest,
      });
      if (!confirmed.ok) {
        blocked = true;
        reason = `${reason}; ${confirmed.reason ?? 'plugin confirm failed'}`.slice(0, 500);
      }
    }

    if (blocked !== order.need_review_blocked || reason !== order.status_reason) {
      const { rows: updatedRows } = await client.query<OrderRow>(
        `update orders
            set need_review_blocked = $2, status_reason = $3, updated_at = now()
          where id = $1
          returning *`,
        [orderId, blocked, reason],
      );
      Object.assign(order, decryptOrderRow(updatedRows[0]!));
    }

    const insertedItems = await insertOrderItems(client, orderId, priced.items);
    await sealOrderIntegrity(client, order, insertedItems);

    if (input.userId) {
      await finalizeAuthenticatedCartAfterOrder(client, input.userId, reservationSnapshot);
    }

    if (!blocked && !reservation.order_id) {
      await client.query(
        `update stock_reservations set state = 'consumed', order_id = $2, updated_at = now() where id = $1`,
        [input.reservationId, orderId],
      );
    } else if (blocked && !reservation.order_id) {
      // A blocked review can only be cancelled by the operator. Release its
      // still-held commercial resources now instead of hiding stock or
      // promotions until the reservation TTL elapses.
      await runCheckoutRelease({
        client,
        userId: input.userId,
        guest: isGuest,
        reservationId: input.reservationId,
        reservationIds: [input.reservationId],
        purpose: 'checkout.release',
      });
      await client.query(`delete from stock_reservations where id = $1 and order_id is null`, [
        input.reservationId,
      ]);
    }
    await client.query('delete from checkout_reservation_snapshots where reservation_id = $1', [
      input.reservationId,
    ]);
    await client.query('commit');
    return {
      ok: true,
      order,
      items: insertedItems,
      created: true,
      guestSaved: reservationSnapshot.guestSaved ?? null,
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
