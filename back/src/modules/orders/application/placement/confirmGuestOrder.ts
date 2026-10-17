import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { consumeVoucherHoldForGuest } from '../../../vouchers/application/vouchers.js';
import { emailLookupHash, encryptPii } from '../../../../platform/security/piiCrypto.js';
import type { Language } from '../../../../utils/language.js';
import { type OrderRow } from '../../domain/order.js';
import { attachItems, decryptOrderRow } from '../../infrastructure/orderRows.js';
import { type StockReservation } from '../pricing/checkoutPricing.js';
import {
  loadCheckoutReservationSnapshot,
  reservationMatchesPricedItems,
} from '../reservation/checkoutReservation.js';
import {
  type ConfirmOrderResult,
  type OrderPaymentMethodSnapshot,
  type PaymentCaptureStatus,
  insertOrderItems,
  sealOrderIntegrity,
} from './orderConfirmationSupport.js';

export async function confirmGuestOrder(
  pool: pg.Pool,
  guestEmail: string,
  express: boolean,
  stripePaymentIntentId: string,
  reservationId: string,
  paymentCaptureStatus: PaymentCaptureStatus = 'authorized',
  paymentMethod?: OrderPaymentMethodSnapshot | null,
  language: Language = 'en',
): Promise<ConfirmOrderResult> {
  const { rows: existingRows } = await pool.query<OrderRow>(
    `select * from orders where stripe_payment_intent_id = $1`,
    [stripePaymentIntentId],
  );
  const existing = existingRows[0] ? decryptOrderRow(existingRows[0]) : undefined;
  if (existing) {
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

    const { rows: reservationRows } = await client.query<StockReservation>(
      `select id, user_id, stripe_payment_intent_id, state, expires_at
       from stock_reservations
       where id = $1 and user_id is null and stripe_payment_intent_id = $2
       for update`,
      [reservationId, stripePaymentIntentId],
    );
    const reservation = reservationRows[0];
    if (
      !reservation ||
      reservation.state !== 'held' ||
      new Date(reservation.expires_at).getTime() <= Date.now()
    ) {
      await client.query('rollback');
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

    // Unlike confirmOrder, there is no pre-snapshot-migration compatibility
    // path here — reserveGuestCart always saves one, since guest checkout
    // shipped well after checkout_reservation_snapshots existed.
    const reservationSnapshot = await loadCheckoutReservationSnapshot(client, reservationId);
    if (!reservationSnapshot) {
      await client.query('rollback');
      return { ok: false, reason: 'size_unavailable' };
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
      voucher,
      loyaltyCredit,
      loyaltyEarn,
      loyaltyEarnStatus,
      total,
    } = reservationSnapshot.priced;

    if (!(await reservationMatchesPricedItems(client, reservationId, items))) {
      await client.query('rollback');
      return { ok: false, reason: 'size_unavailable' };
    }

    const orderId = randomUUID();
    const methodType = paymentMethod?.type ?? null;
    const methodBrand = paymentMethod?.type === 'card' ? (paymentMethod.brand ?? null) : null;
    const methodLast4 = paymentMethod?.type === 'card' ? (paymentMethod.last4 ?? null) : null;

    const { rows: orderRows } = await client.query<OrderRow>(
      `insert into orders (
         id, user_id, guest_email, recipient_name, company_name, line1, line2, delivery_notes, postal_code, city, country_code, phone, address_id,
         network_code, pickup_point, courier_id, courier_code, courier_name, packet_key, express, shipping_fee,
         shipping_list_fee, rules_item_discount, cart_rules_snapshot,
         voucher_code, voucher_item_discount, voucher_shipping_discount,
         loyalty_credit, loyalty_earn, loyalty_earn_status,
         total, stripe_payment_intent_id,
         payment_capture_status, payment_method_type, payment_card_brand, payment_card_last4,
         billing_address_id, billing_recipient_name, billing_company_name, billing_line1, billing_line2,
         billing_postal_code, billing_city, billing_country_code, billing_phone, billing_same_as_shipping,
         customer_type, placed_as_guest, language, guest_email_lookup
       )
       values (
         $1, null, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, null, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb,
         $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, null, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, true, $45, $46
       )
       returning *`,
      [
        orderId,
        encryptPii(guestEmail),
        encryptPii(address.recipient_name),
        encryptPii(address.company_name),
        encryptPii(address.line1),
        encryptPii(address.line2),
        encryptPii(address.delivery_notes),
        encryptPii(address.postal_code),
        encryptPii(address.city),
        address.country_code,
        encryptPii(address.phone),
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
        voucher?.code ?? null,
        voucher?.itemDiscount ?? 0,
        voucher?.shippingDiscount ?? 0,
        loyaltyCredit,
        loyaltyEarn,
        loyaltyEarnStatus,
        total,
        stripePaymentIntentId,
        paymentCaptureStatus,
        methodType,
        methodBrand,
        methodLast4,
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
        language,
        emailLookupHash(guestEmail),
      ],
    );
    let order = decryptOrderRow(orderRows[0]!);

    if (voucher) {
      const consumed = await consumeVoucherHoldForGuest(client, reservationId, voucher, orderId);
      if (!consumed) {
        await client.query('rollback');
        return { ok: false, reason: 'voucher_depleted' };
      }
    }

    const insertedItems = await insertOrderItems(client, orderId, items);

    await sealOrderIntegrity(client, order, insertedItems);

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
    return {
      ok: true,
      order,
      items: insertedItems,
      created: true,
      guestSaved: reservationSnapshot.guestSaved ?? null,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
