import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { consumeOneTimeCardForOrder } from '../../../payments/application/cardRetention.js';
import { encryptPii } from '../../../../platform/security/piiCrypto.js';
import { runCheckoutConfirm } from '../checkoutOpenings.js';
import { buildOrderPluginSnapshot, leftoverCommerceColumnsFromSnapshot } from '../orderPluginSnapshot.js';
import { type OrderRow } from '../../domain/order.js';
import { attachItems, decryptOrderRow } from '../../infrastructure/orderRows.js';
import {
  type PriceCheckoutResult,
  type StockReservation,
  priceCheckout,
} from '../pricing/checkoutPricing.js';
import {
  loadCheckoutReservationSnapshot,
  reservationMatchesPricedItems,
} from '../reservation/checkoutReservation.js';
import {
  type ConfirmOrderResult,
  type OrderPaymentMethodSnapshot,
  type PaymentCaptureStatus,
  finalizeAuthenticatedCartAfterOrder,
  insertOrderItems,
  sealOrderIntegrity,
} from './orderConfirmationSupport.js';

export async function confirmOrder(
  pool: pg.Pool,
  userId: string,
  addressId: string,
  courierCode: string,
  express: boolean,
  stripePaymentIntentId: string,
  reservationId: string,
  voucherCode?: string,
  billingAddressId?: string,
  paymentCaptureStatus: PaymentCaptureStatus = 'authorized',
  paymentMethod?: OrderPaymentMethodSnapshot | null,
  paymentMethodId?: string,
): Promise<ConfirmOrderResult> {
  const { rows: existingRows } = await pool.query<OrderRow>(
    `select * from orders where stripe_payment_intent_id = $1`,
    [stripePaymentIntentId],
  );
  const existing = existingRows[0] ? decryptOrderRow(existingRows[0]) : undefined;
  if (existing) {
    // Capture webhook after an earlier authorize settle: promote authorized → captured.
    if (existing.payment_capture_status === 'authorized' && paymentCaptureStatus === 'captured') {
      const { rows: updatedRows } = await pool.query<OrderRow>(
        `update orders set payment_capture_status = 'captured',
                           payment_operation = null,
                           payment_operation_started_at = null,
                           updated_at = now()
         where id = $1 and payment_capture_status = 'authorized'
         returning *`,
        [existing.id],
      );
      const updated = updatedRows[0] ? decryptOrderRow(updatedRows[0]) : existing;
      const itemsByOrder = await attachItems(pool, [updated]);
      return { ok: true, order: updated, items: itemsByOrder.get(updated.id) ?? [], created: false };
    }
    const itemsByOrder = await attachItems(pool, [existing]);
    return { ok: true, order: existing, items: itemsByOrder.get(existing.id) ?? [], created: false };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    // Same lock order as reserveCart: the buyer first. Without it this
    // transaction locked its reservation and only reached the buyer row
    // through the orders.user_id foreign key, while the same account's other
    // session held the buyer (reserveCart) and waited on that reservation: a
    // deadlock, surfaced as a 500 on the order the customer had just paid.
    await client.query(`select id from users where id = $1 for update`, [userId]);

    const { rows: reservationRows } = await client.query<StockReservation>(
      `select id, user_id, stripe_payment_intent_id, state, expires_at
       from stock_reservations
       where id = $1 and user_id = $2 and stripe_payment_intent_id = $3
       for update`,
      [reservationId, userId, stripePaymentIntentId],
    );
    const reservation = reservationRows[0];
    if (
      !reservation ||
      reservation.state !== 'held' ||
      new Date(reservation.expires_at).getTime() <= Date.now()
    ) {
      await client.query('rollback');
      // finalize and the Stripe webhook race on purpose (see
      // settlePaymentIntent's own doc comment) — both pass the `existing`
      // check above before either has committed, so the loser only blocks
      // on this row's lock and unblocks once the winner already consumed
      // it. That is not a stock problem, it is this exact checkout having
      // already succeeded under the other caller — re-check for that
      // order specifically before concluding the checkout itself failed
      // (a genuinely expired/foreign reservation still falls through to
      // the size_unavailable failure below).
      const { rows: raceRows } = await pool.query<OrderRow>(
        `select * from orders where stripe_payment_intent_id = $1`,
        [stripePaymentIntentId],
      );
      const raceWinner = raceRows[0] ? decryptOrderRow(raceRows[0]) : undefined;
      if (raceWinner) {
        const itemsByOrder = await attachItems(pool, [raceWinner]);
        return { ok: true, order: raceWinner, items: itemsByOrder.get(raceWinner.id) ?? [], created: false };
      }
      return { ok: false, reason: 'size_unavailable' };
    }

    // Lock the source resources before relying on the immutable reservation
    // snapshot. This makes the transition to one_time_consumed serializable:
    // two tabs cannot turn the same one-time address into two orders.
    const addressIds = [...new Set([addressId, billingAddressId].filter((id): id is string => !!id))];
    const { rows: checkoutAddressRows } = await client.query<{
      id: string;
      saved_for_future: boolean;
      checkout_use_status: 'saved' | 'one_time_available' | 'one_time_consumed';
    }>(
      `select id, saved_for_future, checkout_use_status
       from addresses where user_id = $1 and id = any($2::uuid[])
       for update`,
      [userId, addressIds],
    );
    const addressById = new Map(checkoutAddressRows.map((row) => [row.id, row]));
    const isCheckoutAvailable = (id: string) => {
      const row = addressById.get(id);
      return (
        !!row &&
        ((row.saved_for_future && row.checkout_use_status === 'saved') ||
          (!row.saved_for_future && row.checkout_use_status === 'one_time_available'))
      );
    };
    if (!isCheckoutAvailable(addressId)) {
      await client.query('rollback');
      return { ok: false, reason: 'address_not_found' };
    }
    if (billingAddressId && !isCheckoutAvailable(billingAddressId)) {
      await client.query('rollback');
      return { ok: false, reason: 'billing_address_not_found' };
    }

    // Payment is only attempted after reserveCart atomically validated the
    // address, billing, courier, price, promotions and exact stock rows.
    // Use that immutable snapshot here. Rebuilding from cart after a PayPal
    // redirect could silently see a changed cart/rule/price and reject a
    // payment that was already authorized — the exact failure reported by
    // checkout before this snapshot existed.
    const reservationSnapshot = await loadCheckoutReservationSnapshot(client, reservationId);
    const priceResult: PriceCheckoutResult = reservationSnapshot
      ? { ok: true, priced: reservationSnapshot.priced }
      : await priceCheckout(client, {
          userId,
          addressId,
          courierCode,
          express,
          voucherCode,
          billingAddressId,
          checkAvailability: false,
          excludeUnavailable: true,
          excludeReservationId: reservationId,
          syncGiftLines: false,
        });
    if (!priceResult.ok) {
      await client.query('rollback');
      return priceResult;
    }
    const {
      address,
      billingAddress,
      billingSameAsShipping,
      customerType,
      courier,
      networkCode,
      pickupPoint,
      items,
      packetKey,
      shippingFee,
      shippingListFee,
      rulesItemDiscount,
      cartRules,
      total,
      extraLines,
      plugins,
    } = priceResult.priced;

    if (!(await reservationMatchesPricedItems(client, reservationId, items))) {
      await client.query('rollback');
      return { ok: false, reason: 'size_unavailable' };
    }

    const pluginSnapshot = await buildOrderPluginSnapshot(
      { plugins: { ...plugins } },
      { client, userId, priced: priceResult.priced, extraLines },
    );
    const leftover = leftoverCommerceColumnsFromSnapshot(pluginSnapshot);

    const orderId = randomUUID();
    const methodType = paymentMethod?.type ?? null;
    const methodBrand = paymentMethod?.type === 'card' ? (paymentMethod.brand ?? null) : null;
    const methodLast4 = paymentMethod?.type === 'card' ? (paymentMethod.last4 ?? null) : null;
    if (methodType === 'card') {
      if (!paymentMethodId || !(await consumeOneTimeCardForOrder(client, userId, paymentMethodId))) {
        await client.query('rollback');
        return { ok: false, reason: 'payment_method_not_available' };
      }
    }
    const { rows: orderRows } = await client.query<OrderRow>(
      `insert into orders (
         id, user_id, recipient_name, company_name, line1, line2, delivery_notes, postal_code, city, country_code, phone, address_id,
         network_code, pickup_point, courier_id, courier_code, courier_name, packet_key, express, shipping_fee,
         shipping_list_fee, rules_item_discount, cart_rules_snapshot,
         voucher_code, voucher_item_discount, voucher_shipping_discount,
         loyalty_credit, loyalty_earn, loyalty_earn_status,
         total, stripe_payment_intent_id,
         payment_capture_status, payment_method_type, payment_card_brand, payment_card_last4,
         billing_address_id, billing_recipient_name, billing_company_name, billing_line1, billing_line2,
         billing_postal_code, billing_city, billing_country_code, billing_phone, billing_same_as_shipping,
         customer_type, plugin_snapshot
       )
       values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb,
         $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46,
         $47::jsonb
       )
       returning *`,
      [
        orderId,
        userId,
        encryptPii(address.recipient_name),
        encryptPii(address.company_name),
        encryptPii(address.line1),
        encryptPii(address.line2),
        encryptPii(address.delivery_notes),
        encryptPii(address.postal_code),
        encryptPii(address.city),
        address.country_code,
        encryptPii(address.phone),
        addressId,
        networkCode,
        pickupPoint,
        courier.id,
        courier.code,
        courier.name,
        packetKey,
        express,
        shippingFee,
        shippingListFee,
        rulesItemDiscount,
        JSON.stringify(cartRules.snapshot),
        leftover.voucherCode,
        leftover.voucherItemDiscount,
        leftover.voucherShippingDiscount,
        leftover.loyaltyCredit,
        leftover.loyaltyEarn,
        leftover.loyaltyEarnStatus,
        total,
        stripePaymentIntentId,
        paymentCaptureStatus,
        methodType,
        methodBrand,
        methodLast4,
        billingAddress.id,
        encryptPii(billingAddress.recipient_name),
        encryptPii(billingAddress.company_name),
        encryptPii(billingAddress.line1),
        encryptPii(billingAddress.line2),
        encryptPii(billingAddress.postal_code),
        encryptPii(billingAddress.city),
        billingAddress.country_code,
        encryptPii(billingAddress.phone),
        billingSameAsShipping,
        customerType,
        JSON.stringify(pluginSnapshot),
      ],
    );
    const order = decryptOrderRow(orderRows[0]!);

    // consumeOneTimeCardForOrder deliberately ran before this insert to
    // serialize two concurrent checkouts. Now that the FK target exists,
    // persist the immutable order linkage in the same transaction. Doing it
    // earlier caused every one-time card authorization to be rolled back by
    // customer_card_retention_last_order_id_fkey.
    if (methodType === 'card' && paymentMethodId) {
      await client.query(
        `update customer_card_retention
           set one_time_consumed_order_id = $3,
               last_order_id = $3,
               updated_at = now()
         where user_id = $1
           and stripe_payment_method_id = $2
           and purpose = 'one_time'
           and checkout_use_status = 'one_time_consumed'
           and one_time_consumed_order_id is null`,
        [userId, paymentMethodId, orderId],
      );
    }

    // Consumption is separate from deletion: these encrypted source rows are
    // still required by the completed order, refunds and shipping documents,
    // but are permanently ineligible for another checkout.
    await client.query(
      `update addresses
         set checkout_use_status = 'one_time_consumed',
             one_time_consumed_order_id = $3,
             one_time_consumed_at = now(),
             updated_at = now()
       where user_id = $1 and id = any($2::uuid[])
         and checkout_use_status = 'one_time_available'`,
      [userId, addressIds, orderId],
    );

    const confirmed = await runCheckoutConfirm({
      client,
      userId,
      reservationId,
      orderId,
      priced: priceResult.priced,
      snapshot: pluginSnapshot,
      guest: false,
    });
    if (!confirmed.ok) {
      await client.query('rollback');
      return { ok: false, reason: (confirmed.reason ?? 'size_unavailable') as never };
    }

    const insertedItems = await insertOrderItems(client, orderId, items);

    await sealOrderIntegrity(client, order, insertedItems);

    await finalizeAuthenticatedCartAfterOrder(client, userId, reservationSnapshot);
    await client.query(
      `update stock_reservations
       set state = 'consumed', order_id = $2, updated_at = now()
       where id = $1`,
      [reservationId, orderId],
    );
    await client.query('delete from checkout_reservation_snapshots where reservation_id = $1', [
      reservationId,
    ]);

    await client.query('commit');
    return { ok: true, order, items: insertedItems, created: true };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Guest-checkout sibling of confirmOrder — same idempotency/race handling
 * and reservation→order transition, but: no address locking/consumption
 * (guest addresses are never persisted), no customer_card_retention
 * bookkeeping (guest payments are always one-off),
 * and no cart_items cleanup (guests have no persisted cart). The reservation
 * is looked up by id + user_id IS NULL — possessing the (unguessable) id is
 * the only proof of ownership a guest checkout ever has, exactly as
 * reserveGuestCart created it. The insert is always `placed_as_guest` with
 * `guest_email` as the sole owner field (orders_owner_chk), even when an
 * account already uses that email — the order shows a delivery address, so
 * it must not land on the account until a manage-order token or integrity
 * code claims it. */
