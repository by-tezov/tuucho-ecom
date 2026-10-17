import { pool } from '../../../db/pool.js';
import { localize, requestLanguage } from '../../../utils/language.js';
import { config } from '../../../config/env.js';
import { modalPhotoMatches } from '../../../media/photoHash.js';
import type pg from 'pg';
import { applyOrderStatusEffects } from '../../orders/application/status/orderStatusEffects.js';
import { getStripe } from '../../../platform/stripe/stripeClient.js';
import {
  ORDER_STATUSES,
  formatIntegrityToken,
  parseOrderItemPhotos,
  setStatus,
  type OrderItemRow,
  type OrderRow,
  type OrderStatus,
} from '../../orders/application/ordersFacade.js';
import {
  type ShippingPacket,
  supportsAutomatedShippingLabel,
} from '../../shipping/application/shippingLabels.js';
import {
  getOrderReturnReview,
  markOrderReturnReview,
} from '../../orders/application/returns/orderReturnReview.js';
import { getAdminOrderById } from '../../orders/application/queries/adminOrderQueries.js';
import { loadCopyVocabulary, resolveLocalizedCopy } from '../../catalog/application/productCopyResolution.js';
import { readOrderGiftSnapshot } from '../../orders/application/giftSnapshot.js';

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

interface ResolvedShippingPacket extends ShippingPacket {
  quantity: number;
}

export async function shippingPacketForOrder(orderId: string): Promise<ResolvedShippingPacket | undefined> {
  const { rows } = await pool.query<{
    quantity: number;
    weight: number;
    length: number;
    width: number;
    depth: number;
  }>(
    `select m.quantity, m.weight, m.length, m.width, m.depth
     from shipping_packet_measurements m
     where m.quantity = (select coalesce(sum(quantity), 0) from order_items where order_id = $1 and origin = 'user' and product_type in ('nail', 'composition'))`,
    [orderId],
  );
  const packet = rows[0];
  return packet
    ? {
        quantity: packet.quantity,
        weight: packet.weight,
        size: { length: packet.length, width: packet.width, depth: packet.depth },
      }
    : undefined;
}

export async function orderNeedsAutomatedShippingLabel(orderId: string): Promise<boolean> {
  const { rows } = await pool.query<{ courier_code: string | null; network_code: string | null }>(
    `select courier_code, network_code from orders where id = $1`,
    [orderId],
  );
  const order = rows[0];
  return order ? supportsAutomatedShippingLabel(order) : false;
}

type AdminAdvanceFailure = { ok: false; reason: string; message?: string };

type AdminAdvanceSuccess = {
  ok: true;
  order: OrderRow;
  items: OrderItemRow[];
  status: OrderStatus;
};

/** After an order has reached `sent`, continue the admin send chain. */
export async function advanceAdminOrderBeyondSent(
  pool: pg.Pool,
  orderId: string,
  order: OrderRow,
  items: OrderItemRow[],
  target: 'received' | 'return_review',
  actorUserId: string,
): Promise<AdminAdvanceSuccess | AdminAdvanceFailure> {
  if (target === 'return_review') {
    if (order.status !== 'sent' && order.status !== 'disponible') {
      return {
        ok: false,
        reason: 'invalid_transition',
        message: `Order ${order.order_number} must be sent before moving to return review (current: ${order.status}).`,
      };
    }
    const result = await markOrderReturnReview(pool, orderId, {
      returnType: 'other',
      detectionSource: 'admin',
      evidence: { manualAdminAdvance: true },
      actorUserId,
    });
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === 'invalid_status'
            ? `Order ${order.order_number} cannot enter return review from ${order.status}.`
            : undefined,
      };
    }
    const detail = await getAdminOrderById(pool, orderId);
    if (!detail) return { ok: false, reason: 'not_found' };
    return { ok: true, order: detail.order, items: detail.items, status: 'return_review' };
  }

  let current = order;
  let currentItems = items;
  const steps: OrderStatus[] = [];
  if (current.status === 'sent' && current.pickup_point) steps.push('disponible');
  if (current.status === 'sent' || current.status === 'disponible') steps.push('received');
  if (steps.length === 0) {
    return {
      ok: false,
      reason: 'invalid_transition',
      message: `Order ${order.order_number} must be sent before marking received (current: ${order.status}).`,
    };
  }

  for (const step of steps) {
    const result = await setStatus(pool, orderId, step, undefined, false, { stripe: getStripe() });
    if (!result.ok) {
      return { ok: false, reason: result.reason, message: result.message };
    }
    if (result.changed) await applyOrderStatusEffects(pool, step, result.order, result.items);
    current = result.order;
    currentItems = result.items;
  }
  return { ok: true, order: current, items: currentItems, status: 'received' };
}

/** The browser needs fulfillment information, not the OPS_TOKEN-only archive
 * representation. Keep gift lines so an admin can inspect the full order,
 * while the UI calculates its list count from `origin === 'user'`. */
export async function toAdminOrder(
  order: OrderRow,
  items: OrderItemRow[],
  language: ReturnType<typeof requestLanguage>,
  userEmail: string | null,
) {
  const [packet, shipment, returnReview, vocabulary] = await Promise.all([
    shippingPacketForOrder(order.id),
    pool.query<{ shipment_number: string | null }>(
      'select shipment_number from order_shipping_labels where order_id = $1',
      [order.id],
    ),
    getOrderReturnReview(pool, order.id),
    loadCopyVocabulary(pool),
  ]);
  const giftSnap = readOrderGiftSnapshot(order.gift_snapshot);
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    statusReason: order.status_reason,
    needReviewBlocked: order.need_review_blocked,
    needReviewResolvedAt: order.need_review_resolved_at,
    needReviewResolvedBy: order.need_review_resolved_by,
    needReviewResolution: order.need_review_resolution,
    stripeResolution: order.stripe_resolution,
    returnReview,
    stripePaymentIntentId: order.stripe_payment_intent_id,
    userEmail,
    /** Giver email from the frozen gift snapshot when present; else null. */
    giftGiverEmail: giftSnap?.giverEmail || null,
    /** Recipient email from the frozen gift snapshot when present; else null. */
    giftReceiverEmail: giftSnap?.receiverEmail ?? null,
    integrityToken: order.content_hash ? formatIntegrityToken(order.content_hash) : null,
    sentAt: order.sent_at,
    statusUpdatedAt: order.status_updated_at,
    total: Number(order.total),
    shippingFee: Number(order.shipping_fee),
    shippingListFee: Number(order.shipping_list_fee ?? order.shipping_fee),
    rulesItemDiscount: Number(order.rules_item_discount ?? 0),
    voucherCode: order.voucher_code,
    voucherDiscount: order.voucher_code
      ? Number(order.voucher_item_discount) + Number(order.voucher_shipping_discount)
      : null,
    loyaltyCredit: Number(order.loyalty_credit ?? 0),
    loyaltyEarn: Number(order.loyalty_earn ?? 0),
    loyaltyEarnStatus: order.loyalty_earn_status ?? 'void',
    confirmedAt: order.confirmed_at,
    placedAsGuest: order.placed_as_guest === true,
    adminVerified: order.admin_verified_at != null,
    adminVerifiedAt: order.admin_verified_at,
    paymentCaptureStatus: order.payment_capture_status,
    paymentMethod: order.payment_method_type
      ? { type: order.payment_method_type, brand: order.payment_card_brand, last4: order.payment_card_last4 }
      : null,
    recipientName: order.recipient_name,
    companyName: order.company_name,
    line1: order.line1,
    line2: order.line2,
    postalCode: order.postal_code,
    city: order.city,
    countryCode: order.country_code,
    phone: order.phone,
    courierName: order.courier_name ? localize(order.courier_name, language) : null,
    packet: packet ? { quantity: packet.quantity, weight: packet.weight, size: packet.size } : null,
    shipmentNumber: shipment.rows[0]?.shipment_number ?? null,
    items: await Promise.all(
      items.map(async (item) => {
        const primaryPhoto = parseOrderItemPhotos(item.photos)[0];
        const photo =
          primaryPhoto && (await modalPhotoMatches(primaryPhoto.modalPath, primaryPhoto.hash))
            ? `${config.publicMediaUrl}/${primaryPhoto.smallPath.replace(/^\/+/, '')}`
            : item.photo_path
              ? `${config.publicMediaUrl}/${item.photo_path.replace(/^\/+/, '')}`
              : null;
        return {
          id: item.id,
          productUid: item.product_uid,
          productId: item.product_id,
          productType: item.product_type,
          title: localize(item.title, language),
          desc: item.desc
            ? resolveLocalizedCopy(item.desc, vocabulary, item.shape_key, item.length_key, language)
            : null,
          shapeLabel: item.shape_label ? localize(item.shape_label, language) : item.shape_key,
          shapeKey: item.shape_key,
          lengthKey: item.length_key,
          lengthLabel: item.length_label ? localize(item.length_label, language) : item.length_key,
          size: item.size,
          packLabel: item.pack_label ? localize(item.pack_label, language) : item.pack_key,
          photo,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          lineTotal: Number(item.line_total),
          origin: item.origin,
          comment: item.comment ?? null,
          nails: (item.nails ?? []).map((nail) => ({
            productId: nail.product_id,
            productUid: nail.product_uid,
            title: localize(nail.title, language),
            shapeKey: nail.shape_key,
            shapeLabel: nail.shape_label ? localize(nail.shape_label, language) : nail.shape_key,
            lengthKey: nail.length_key,
            lengthLabel: nail.length_label ? localize(nail.length_label, language) : nail.length_key,
            finger: nail.finger,
            variationKey: nail.variation_key ?? '',
            variationLabel: nail.variation_label ? localize(nail.variation_label, language) : '',
            variationAxisLabel: nail.variation_axis_label ? localize(nail.variation_axis_label, language) : '',
            photo: nail.photo_path
              ? `${config.publicMediaUrl}/${nail.photo_path.replace(/^\/+/, '')}`
              : null,
            unitPrice: Number(nail.unit_price),
          })),
        };
      }),
    ),
  };
}

export function toAdminOrderSummary(order: {
  id: string;
  order_number: string;
  user_email: string | null;
  guest_email: string | null;
  placed_as_guest: boolean;
  total: string;
  item_count: string;
  admin_verified_at: string | null;
}) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    userEmail: order.user_email ?? order.guest_email,
    placedAsGuest: order.placed_as_guest === true,
    itemCount: Number(order.item_count),
    total: Number(order.total),
    adminVerified: order.admin_verified_at != null,
  };
}
