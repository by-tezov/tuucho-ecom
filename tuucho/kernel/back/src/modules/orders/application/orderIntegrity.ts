import { createHmac } from 'node:crypto';
import { config } from '../../../config/env.js';
import {
  parseOrderItemColors,
  parseOrderItemPhotos,
  type OrderItemRow,
  type OrderRow,
} from '../domain/order.js';

function orderIntegrityPayload(order: OrderRow, items: OrderItemRow[]) {
  return {
    orderNumber: order.order_number,
    recipientName: order.recipient_name,
    companyName: order.company_name,
    line1: order.line1,
    line2: order.line2,
    postalCode: order.postal_code,
    city: order.city,
    countryCode: order.country_code,
    phone: order.phone,
    networkCode: order.network_code,
    pickupPoint: order.pickup_point,
    courierCode: order.courier_code,
    courierName: order.courier_name,
    packetKey: order.packet_key,
    express: order.express,
    shippingFee: order.shipping_fee,
    shippingListFee: order.shipping_list_fee,
    rulesItemDiscount: order.rules_item_discount,
    cartRulesSnapshot: order.cart_rules_snapshot,
    voucherCode: order.voucher_code,
    voucherItemDiscount: order.voucher_item_discount,
    voucherShippingDiscount: order.voucher_shipping_discount,
    total: order.total,
    confirmedAt: order.confirmed_at,
    billingAddressId: order.billing_address_id,
    billingRecipientName: order.billing_recipient_name,
    billingCompanyName: order.billing_company_name,
    billingLine1: order.billing_line1,
    billingLine2: order.billing_line2,
    billingPostalCode: order.billing_postal_code,
    billingCity: order.billing_city,
    billingCountryCode: order.billing_country_code,
    billingPhone: order.billing_phone,
    billingSameAsShipping: order.billing_same_as_shipping,
    customerType: order.customer_type,
    items: items.map((item) => ({
      productId: item.product_id,
      productUid: item.product_uid,
      title: item.title,
      desc: item.desc,
      occasion: item.occasion,
      colors: parseOrderItemColors(item.colors),
      shapeKey: item.shape_key,
      lengthKey: item.length_key,
      shapeLabel: item.shape_label,
      lengthLabel: item.length_label,
      photoPath: item.photo_path,
      photos: parseOrderItemPhotos(item.photos),
      size: item.size,
      ...(item.pack_key ? { packKey: item.pack_key, packLabel: item.pack_label } : {}),
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
      origin: item.origin,
      locked: item.locked,
      ruleCode: item.rule_code,
      // Only when set: orders without a note keep their existing content hash.
      ...(item.comment ? { comment: item.comment } : {}),
    })),
  };
}

/** Complete commercial state retained for an audit/replay. The integrity
 * payload is kept verbatim inside it, while the surrounding fields preserve
 * operational context that is not part of the legacy content-hash contract. */
export function fullOrderSnapshot(order: OrderRow, items: OrderItemRow[]) {
  return {
    version: 1,
    integrity: orderIntegrityPayload(order, items),
    status: order.status,
    statusReason: order.status_reason,
    statusUpdatedAt: order.status_updated_at,
    createdAt: order.created_at,
    deliveryNotes: order.delivery_notes,
    courierId: order.courier_id,
    addressId: order.address_id,
    paymentCaptureStatus: order.payment_capture_status,
    paymentMethodType: order.payment_method_type,
    paymentCardBrand: order.payment_card_brand,
    paymentCardLast4: order.payment_card_last4,
  };
}

export function computeFullOrderSnapshotHash(snapshot: unknown): string {
  return createHmac('sha256', config.jwt.secret).update(JSON.stringify(snapshot)).digest('hex');
}

export function computeOrderContentHash(order: OrderRow, items: OrderItemRow[]): string {
  const canonical = JSON.stringify(orderIntegrityPayload(order, items));
  return createHmac('sha256', config.jwt.secret).update(canonical).digest('hex');
}

/** Truncates the full 256-bit hash to a human-copyable "certificate number"
 * for display (16 hex chars / 64 bits — already infeasible to brute-force
 * blind). The full hash is what's actually stored in content_hash; this is
 * purely a shorter string to put in a UI badge or an email footer. */
export { formatIntegrityToken } from '../../commerce/domain/integrityToken.js';
