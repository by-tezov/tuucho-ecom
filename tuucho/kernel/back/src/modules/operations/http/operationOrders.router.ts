import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { pool } from '../../../db/pool.js';
import { applyOrderStatusEffects } from '../../orders/application/status/orderStatusEffects.js';
import {
  deleteAll,
  deleteByOrderNumber,
  formatIntegrityToken,
  getById,
  listAllOrders,
  ORDER_STATUSES,
  setStatus,
} from '../../orders/application/ordersFacade.js';
import { getStripe } from '../../../platform/stripe/stripeClient.js';
import type { OrderItemRow, OrderRow, OrderStatus } from '../../orders/application/ordersFacade.js';
import {
  getShippingLabel,
  setManualTrackingNumber,
  shippingLabelPath,
  ShippingLabelError,
  supportsAutomatedShippingLabel,
  type ShippingPacket,
} from '../../shipping/application/shippingLabels.js';
import { boundedPhone } from '../../../utils/fieldLimits.js';
import { loadOrderCopyResolver, type OrderCopyResolver } from '../../catalog/application/productCopyResolution.js';
import { recordOperatorActivityBestEffort } from '../../activity/application/recordOperatorActivity.js';

export const operationOrdersRouter = Router();

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

function shippingPacketFromBody(value: unknown): ShippingPacket | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const packet = value as { weight?: unknown; size?: { length?: unknown; width?: unknown; depth?: unknown } };
  if (!packet.size || typeof packet.size !== 'object') return undefined;
  const values = [packet.weight, packet.size.length, packet.size.width, packet.size.depth];
  if (!values.every((number) => typeof number === 'number' && Number.isSafeInteger(number) && number > 0))
    return undefined;
  return {
    weight: packet.weight as number,
    size: {
      length: packet.size.length as number,
      width: packet.size.width as number,
      depth: packet.size.depth as number,
    },
  };
}

function toAdminOrder(order: OrderRow, items: OrderItemRow[], resolveCopy: OrderCopyResolver) {
  return {
    id: order.id,
    userId: order.user_id,
    orderNumber: order.order_number,
    status: order.status,
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
    shippingFee: Number(order.shipping_fee),
    total: Number(order.total),
    confirmedAt: order.confirmed_at,
    statusUpdatedAt: order.status_updated_at,
    integrityToken: order.content_hash ? formatIntegrityToken(order.content_hash) : null,
    paymentCaptureStatus: order.payment_capture_status,
    paymentMethod: order.payment_method_type
      ? {
          type: order.payment_method_type,
          brand: order.payment_card_brand,
          last4: order.payment_card_last4,
        }
      : null,
    billingSameAsShipping: order.billing_same_as_shipping,
    billingRecipientName: order.billing_recipient_name,
    billingCompanyName: order.billing_company_name,
    customerType: order.customer_type,
    billingLine1: order.billing_line1,
    billingLine2: order.billing_line2,
    billingPostalCode: order.billing_postal_code,
    billingCity: order.billing_city,
    billingCountryCode: order.billing_country_code,
    billingPhone: order.billing_phone,
    placedAsGuest: order.placed_as_guest === true,
    items: items.map((item) => ({
      id: item.id,
      productUid: item.product_uid,
      productType: item.product_type,
      title: item.title,
      desc: item.desc && resolveCopy(item.desc, item.shape_key, item.length_key),
      shapeKey: item.shape_key,
      size: item.size,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
      origin: item.origin,
      comment: item.comment ?? null,
    })),
  };
}

/** Backs `npm run order -- seed` — there is no admin backoffice, so this
 * (and the status-update route below) is the only way to see what needs
 * fulfillment action, same OPS_TOKEN gate as everything else under
 * /operation. */
operationOrdersRouter.get('/orders', async (req, res) => {
  const status = isOrderStatus(req.query.status) ? req.query.status : undefined;
  const [rows, resolveCopy] = await Promise.all([listAllOrders(pool, status), loadOrderCopyResolver(pool)]);
  res.json({
    success: true,
    orders: rows.map(({ order, items }) => ({
      ...toAdminOrder(order, items, resolveCopy),
      user: {
        // A guest order has no users row. Its immutable guest_email remains
        // the operations contact address and must survive the local archive.
        email: order.user_email ?? order.guest_email,
        firstName: order.user_first_name,
        lastName: order.user_last_name,
        phone: order.user_phone,
      },
    })),
  });
});

/** Permanently deletes one order and releases its consumed stock allocation.
 * This changes only the database; it never cancels/refunds Stripe. */
operationOrdersRouter.delete('/orders/:orderNumber', async (req, res) => {
  const { orderNumber } = req.params as { orderNumber: string };
  const result = await deleteByOrderNumber(pool, orderNumber);
  if (!result.ok) {
    res
      .status(result.reason === 'not_found' ? 404 : 409)
      .json({ success: false, error: { code: result.reason } });
    return;
  }
  res.json({ success: true, deleted: true, orderNumber });
});

/** Requires a body confirmation as a second safety barrier beyond the
 * OPS_TOKEN, because this permanently clears every order. */
operationOrdersRouter.delete('/orders', async (req, res) => {
  if (req.body?.confirm !== true) {
    res.status(400).json({ success: false, error: { code: 'confirm_required' } });
    return;
  }
  const result = await deleteAll(pool);
  if (!result.ok) {
    res.status(409).json({
      success: false,
      error: { code: result.reason },
      reviewCount: result.reviewCount,
    });
    return;
  }
  res.json({ success: true, deletedCount: result.deletedCount });
});

/** Backs `npm run order -- set-status`. Strictly sequential, forward-only
 * transitions (see orders.service.ts's setStatus) — sends the "shipped"
 * email the moment an order reaches `sent`. By default captures an
 * authorized PaymentIntent before advancing to in_preparation or to_send;
 * pass noPayment:true only for in_preparation to skip capture. */
operationOrdersRouter.patch('/orders/:id/status', async (req, res) => {
  const { id } = req.params as { id: string };
  const status = isOrderStatus(req.body?.status) ? req.body.status : undefined;
  if (!status || status === 'need_review' || status === 'return_review') {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
      message:
        'The need_review and return_review exception statuses are resolved from the browser admin dashboard.',
    });
    return;
  }

  const noPayment = req.body?.noPayment === true;
  if (noPayment && status !== 'in_preparation') {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
      message: 'noPayment is only allowed when moving to in_preparation.',
    });
    return;
  }

  const skipShippingLabel = status === 'to_send' && req.body?.skipShippingLabel === true;
  if (req.body?.phone !== undefined && status !== 'to_send') {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
      message: 'phone is only allowed when moving to to_send.',
    });
    return;
  }
  const recipientPhone = req.body?.phone === undefined ? undefined : boundedPhone(req.body.phone);
  if (req.body?.phone !== undefined && !recipientPhone) {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
      message: 'phone must be a valid phone number.',
    });
    return;
  }
  let needsAutomatedLabel = false;
  if (status === 'to_send' && !skipShippingLabel) {
    const { rows } = await pool.query<{ courier_code: string | null; network_code: string | null }>(
      `select courier_code, network_code from orders where id = $1`,
      [id],
    );
    needsAutomatedLabel = rows[0] ? supportsAutomatedShippingLabel(rows[0]) : false;
  }
  const packet = needsAutomatedLabel ? shippingPacketFromBody(req.body?.packet) : undefined;
  if (needsAutomatedLabel && !packet) {
    res.status(400).json({
      success: false,
      error: { code: 'packet_required' },
    });
    return;
  }
  const before = await getById(pool, id);
  let result;
  try {
    result = await setStatus(pool, id, status, packet, skipShippingLabel, {
      noPayment,
      recipientPhone,
      bypassLockEdit: req.body?.bypassLockEdit === true,
      stripe: getStripe(),
    });
  } catch (error) {
    if (error instanceof ShippingLabelError) {
      res.status(409).json({ success: false, error: { code: error.code }, message: error.message });
      return;
    }
    throw error;
  }
  if (!result.ok) {
    if (
      result.reason === 'order_revision_locked' ||
      result.reason === 'order_revision_lock_stale' ||
      result.reason === 'payment_capture_failed'
    ) {
      res.status(409).json({
        success: false,
        error: { code: result.reason },
        message: result.message,
        orderNumber: result.order?.order_number,
        ...(result.reason === 'order_revision_locked' || result.reason === 'order_revision_lock_stale'
          ? { lockUntil: result.order?.revision_lock_until }
          : {}),
      });
      return;
    }
    if (result.reason === 'stripe_not_configured') {
      res.status(501).json({
        success: false,
        error: { code: result.reason },
        message: result.message,
      });
      return;
    }
    res.status(result.reason === 'not_found' ? 404 : 409).json({
      success: false,
      error: { code: result.reason },
      ...(result.message ? { message: result.message } : {}),
    });
    return;
  }

  if (result.changed) await applyOrderStatusEffects(pool, status, result.order, result.items);
  if (result.changed) {
    await recordOperatorActivityBestEffort(pool, {
      category: 'orders',
      action: 'order.status',
      summary: `Commande ${result.order.order_number}: ${before?.status ?? '?'} -> ${status}`,
      targetType: 'order',
      targetId: result.order.id,
      detail: {
        orderNumber: result.order.order_number,
        fromStatus: before?.status ?? null,
        toStatus: status,
        noPayment,
        skipShippingLabel,
      },
    });
  }

  const resolveCopy = await loadOrderCopyResolver(pool);
  res.json({ success: true, order: toAdminOrder(result.order, result.items, resolveCopy) });
});

const SHIPPED_STATUSES: OrderStatus[] = ['to_send', 'sent', 'disponible', 'received'];

/** Backs `npm run order -- set-tracking` — an ops override for recording
 * (or correcting) a carrier tracking reference by hand, most commonly after
 * `--skip-shipment-label` left an order with no automated shipment number
 * but it has since actually shipped by some other means. Requires the order
 * to have already reached `to_send` (or later): tracking a reference before
 * the order has even notionally shipped doesn't make sense, and earlier-
 * stage/`cancelled` orders should use the normal status flow instead. */
operationOrdersRouter.patch('/orders/:id/tracking', async (req, res) => {
  const { id } = req.params as { id: string };
  const trackingNumber = typeof req.body?.trackingNumber === 'string' ? req.body.trackingNumber.trim() : '';
  if (!trackingNumber) {
    res.status(400).json({ success: false, error: { code: 'tracking_number_required' } });
    return;
  }
  const order = await getById(pool, id);
  if (!order) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (!SHIPPED_STATUSES.includes(order.status)) {
    res.status(409).json({ success: false, error: { code: 'order_not_shipped' } });
    return;
  }
  if (!order.courier_code) {
    res.status(409).json({ success: false, error: { code: 'courier_not_set' } });
    return;
  }
  await setManualTrackingNumber(pool, order.id, order.courier_code, trackingNumber);
  res.json({ success: true });
});

/** Downloads the immutable PDF generated when the order entered to_send.
 * The operations CLI owns the manager archive write; the server never
 * depends on that sibling repository at runtime. */
operationOrdersRouter.get('/orders/:id/sticker', async (req, res) => {
  const { id } = req.params as { id: string };
  const label = await getShippingLabel(pool, id);
  if (!label) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const content = await readFile(shippingLabelPath(label));
  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `attachment; filename="${id}.pdf"`);
  res.send(content);
});
