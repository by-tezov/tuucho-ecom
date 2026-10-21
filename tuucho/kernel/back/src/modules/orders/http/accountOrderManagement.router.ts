import { readFile } from 'node:fs/promises';
import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import {
  authRateLimiter,
  invoiceDownloadRateLimiter,
  invoiceEmailRateLimiter,
} from '../../../middleware/rateLimiters.js';
import * as couriers from '../../delivery/application/couriers.js';
import { invoiceEmail, sendMail } from '../../messaging/application/email.js';
import { recordInvoiceAction } from '../../invoicing/application/invoiceSendLimits.js';
import { ensureInvoice } from '../../invoicing/application/invoices.js';
import * as orders from '../application/ordersFacade.js';
import type { OrderItemRow, OrderRow } from '../application/ordersFacade.js';
import { getStripe } from '../../../platform/stripe/stripeClient.js';
import { findUserById } from '../../identity/application/users.js';
import { boundedToken } from '../../../utils/fieldLimits.js';
import { requestLanguage, type Language } from '../../../utils/language.js';
import { sendOrderCancellation, sendOrderUpdate } from '../application/orderNotifications.js';
import { toPublicOrder } from '../presentation/orderPresenter.js';

export const accountOrderManagementRouter = Router();

async function trackingFlagForOrder(order: { courier_code: string | null }): Promise<boolean> {
  if (!order.courier_code) return false;
  return (
    (await couriers.trackingAvailableByCode(pool, [order.courier_code])).get(order.courier_code) ?? false
  );
}

async function revisionCountForOrder(orderId: string): Promise<number> {
  return (await orders.revisionCountsByOrderId(pool, [orderId])).get(orderId) ?? 0;
}

async function toPublicOrderWithMeta(order: OrderRow, items: OrderItemRow[], language: Language) {
  return toPublicOrder(
    order,
    items,
    language,
    await trackingFlagForOrder(order),
    await revisionCountForOrder(order.id),
  );
}

/** Acquires (or refreshes the caller's own) edit lock so ops set-status
 * refuses until the customer saves/cancels or ORDER_REVISION_LOCK_TTL elapses. */
accountOrderManagementRouter.post('/orders/:id/revisions/lock', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const result = await orders.acquireRevisionLock(pool, req.user!.id, id);
  if (!result.ok) {
    res
      .status(result.reason === 'not_found' ? 404 : 409)
      .json({ success: false, error: { code: result.reason } });
    return;
  }
  const language = requestLanguage(req);
  res.json({
    success: true,
    lock: result.lock,
    order: await toPublicOrderWithMeta(result.order, result.items, language),
  });
});

accountOrderManagementRouter.post('/orders/:id/revisions/lock/extend', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const lockToken = typeof req.body?.lockToken === 'string' ? req.body.lockToken.trim() : '';
  if (!lockToken) {
    res.status(400).json({ success: false, error: { code: 'invalid_body' } });
    return;
  }
  const result = await orders.extendRevisionLock(pool, req.user!.id, id, lockToken);
  if (!result.ok) {
    res
      .status(result.reason === 'not_found' ? 404 : 409)
      .json({ success: false, error: { code: result.reason } });
    return;
  }
  const language = requestLanguage(req);
  res.json({
    success: true,
    lock: result.lock,
    order: await toPublicOrderWithMeta(result.order, result.items, language),
  });
});

accountOrderManagementRouter.delete('/orders/:id/revisions/lock', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const lockToken =
    typeof req.body?.lockToken === 'string'
      ? req.body.lockToken.trim()
      : typeof req.query.lockToken === 'string'
        ? req.query.lockToken.trim()
        : '';
  if (!lockToken) {
    res.status(400).json({ success: false, error: { code: 'invalid_body' } });
    return;
  }
  const result = await orders.releaseRevisionLock(pool, req.user!.id, id, lockToken);
  if (!result.ok) {
    res
      .status(result.reason === 'not_found' ? 404 : 409)
      .json({ success: false, error: { code: result.reason } });
    return;
  }
  res.json({ success: true });
});

/** Billing-address amendment (confirmed / in_preparation only). Requires an
 * active lock token from POST …/revisions/lock; see updateOrderBilling. */
accountOrderManagementRouter.patch('/orders/:id/billing', requireAuth, authRateLimiter, async (req, res) => {
  const { id } = req.params as { id: string };
  const lockToken = typeof req.body?.lockToken === 'string' ? req.body.lockToken.trim() : '';
  const sameAsShipping = req.body?.sameAsShipping === true;
  const billingAddressId =
    typeof req.body?.billingAddressId === 'string' && req.body.billingAddressId.trim()
      ? req.body.billingAddressId.trim()
      : undefined;
  if (!lockToken) {
    res.status(400).json({ success: false, error: { code: 'invalid_body' } });
    return;
  }
  if (!sameAsShipping && !billingAddressId) {
    res.status(400).json({ success: false, error: { code: 'billing_address_required' } });
    return;
  }
  const result = await orders.updateOrderBilling(
    pool,
    req.user!.id,
    id,
    lockToken,
    sameAsShipping,
    sameAsShipping ? undefined : billingAddressId,
  );
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 409;
    res.status(status).json({ success: false, error: { code: result.reason } });
    return;
  }
  if (result.changed) {
    try {
      await sendOrderUpdate(req.user!.id, result.order, result.items);
    } catch (error) {
      console.error('[order] address-update customer email delivery failed', error);
    }
  }
  const language = requestLanguage(req);
  res.json({
    success: true,
    changed: result.changed,
    order: await toPublicOrderWithMeta(result.order, result.items, language),
  });
});

/** Shipping-address amendment under revision lock. Same courier, same
 * country, same delivery network; refuses if the recomputed shipping fee
 * would change. */
accountOrderManagementRouter.patch('/orders/:id/shipping', requireAuth, authRateLimiter, async (req, res) => {
  const { id } = req.params as { id: string };
  const lockToken = typeof req.body?.lockToken === 'string' ? req.body.lockToken.trim() : '';
  const addressId = boundedToken(req.body?.addressId);
  if (!lockToken || !addressId) {
    res.status(400).json({ success: false, error: { code: 'invalid_body' } });
    return;
  }
  const result = await orders.updateOrderShipping(pool, req.user!.id, id, lockToken, addressId);
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 409;
    res.status(status).json({ success: false, error: { code: result.reason } });
    return;
  }
  if (result.changed) {
    try {
      await sendOrderUpdate(req.user!.id, result.order, result.items);
    } catch (error) {
      console.error('[order] address-update customer email delivery failed', error);
    }
  }
  const language = requestLanguage(req);
  res.json({
    success: true,
    changed: result.changed,
    order: await toPublicOrderWithMeta(result.order, result.items, language),
  });
});

/** Customer cancel while confirmed + payment still authorized (hold not
 * captured), or while a zero-total / payment-not-required order is confirmed
 * or in preparation. Releases any Stripe authorization, frees stock, restores
 * voucher availability, forgets a one-time card, and emails confirmation. */
accountOrderManagementRouter.delete('/orders/:id', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const result = await orders.cancelOrder(pool, req.user!.id, id, getStripe());
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 409;
    res.status(status).json({ success: false, error: { code: result.reason } });
    return;
  }
  try {
    await sendOrderCancellation(req.user!.id, result.order, result.items);
  } catch (error) {
    console.error('[order] cancellation email failed', error);
  }
  const language = requestLanguage(req);
  res.json({
    success: true,
    order: await toPublicOrderWithMeta(result.order, result.items, language),
  });
});

/** Backs the "Ma Facture" modal's "Télécharger" choice. The PDF is
 * generated once and reused on every later call (see ensureInvoice) —
 * clicking again never produces a second document or a new invoice
 * number. No email side effect here — see the /email route below for the
 * modal's other choice. Rate-limited by `invoiceDownloadRateLimiter`
 * (per-IP window+max, own budget), tracked independently from the /email
 * route below. */
accountOrderManagementRouter.get(
  '/orders/:id/invoice',
  requireAuth,
  invoiceDownloadRateLimiter,
  async (req, res) => {
    const { id } = req.params as { id: string };
    const result = await orders.getForUser(pool, req.user!.id, id);
    if (!result) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    if (result.order.status === 'need_review') {
      res.status(409).json({ success: false, error: { code: 'order_payment_review_required' } });
      return;
    }

    const invoice = await ensureInvoice(pool, result.order, result.items);
    const content = await readFile(invoice.absolutePath);
    await recordInvoiceAction(pool, req.user!.id, result.order.id, 'download');
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.send(content);
  },
);

/** Backs the "Ma Facture" modal's "Recevoir par email" choice — same
 * idempotent invoice (see ensureInvoice: never a second document or a new
 * invoice number) sent as an attachment, reusable any number of times as
 * a "resend" with no separate flow needed. Unlike the plain download
 * above, a failure here is the entire point of the request, so — unlike
 * the (removed) best-effort send that used to ride along with every
 * download — it's awaited and surfaced to the customer as a real error
 * rather than swallowed. Rate-limited by `invoiceEmailRateLimiter` (per-IP
 * window+max, own budget), tracked independently (channel: 'email'). */
accountOrderManagementRouter.post(
  '/orders/:id/invoice/email',
  requireAuth,
  invoiceEmailRateLimiter,
  async (req, res) => {
    const { id } = req.params as { id: string };
    const result = await orders.getForUser(pool, req.user!.id, id);
    if (!result) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    if (result.order.status === 'need_review') {
      res.status(409).json({ success: false, error: { code: 'order_payment_review_required' } });
      return;
    }

    const invoice = await ensureInvoice(pool, result.order, result.items);
    const user = await findUserById(pool, req.user!.id);
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }

    await sendMail({
      to: user.email,
      ...invoiceEmail(result.order.order_number, requestLanguage(req)),
      attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, path: invoice.absolutePath }],
    });
    await recordInvoiceAction(pool, req.user!.id, result.order.id, 'email');
    res.json({ success: true });
  },
);
