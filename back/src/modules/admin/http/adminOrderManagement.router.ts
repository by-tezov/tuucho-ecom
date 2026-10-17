import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requestLanguage } from '../../../utils/language.js';
import { findUserById } from '../../identity/application/users.js';
import {
  getById,
  getAdminOrderById,
  resolveNeedReviewOrder,
  verifyAdminOrder,
} from '../../orders/application/ordersFacade.js';
import { getStripe } from '../../../platform/stripe/stripeClient.js';
import { getShippingLabel, shippingLabelPath } from '../../shipping/application/shippingLabels.js';
import {
  getOrderTracking,
  ShippingTrackingError,
} from '../../orders/application/tracking/shippingTracking.js';
import { recordAdminActivityBestEffort } from '../../activity/application/recordAdminActivity.js';
import { activityChangeDetail } from '../../activity/application/changeDetail.js';
import { toAdminOrder } from './adminOrderSupport.js';

export const adminOrderManagementRouter = Router();

// Also opened read-only from a customer's card in the Users section.
adminOrderManagementRouter.get('/orders/:id', requireAuth, requirePermission('orders', 'users'), async (req, res) => {
  const { id } = req.params as { id: string };
  const result = await getAdminOrderById(pool, id);
  if (!result) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const language = requestLanguage(req);
  res.json({
    success: true,
    order: await toAdminOrder(
      result.order,
      result.items,
      language,
      result.order.user_email ?? result.order.guest_email,
    ),
  });
});

/** Human-triggered resolution of a `need_review` payment exception. Continue
 * verifies Stripe without mutating it; cancel releases an authorization or
 * refunds captured funds before changing the local order. */
adminOrderManagementRouter.post(
  '/orders/:id/need-review-resolution',
  requireAuth,
  requirePermission('orders'),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const decision = req.body?.decision;
    if ((decision !== 'continue' && decision !== 'cancel') || req.body?.confirmed !== true) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const beforeOrder = await getById(pool, id);
    const result = await resolveNeedReviewOrder(pool, getStripe(), id, decision, req.user!.id);
    if (!result.ok) {
      const status =
        result.reason === 'not_found'
          ? 404
          : result.reason === 'stripe_not_configured'
            ? 503
            : result.reason === 'stripe_action_failed'
              ? 502
              : 409;
      res.status(status).json({ success: false, error: { code: result.reason } });
      return;
    }
    const language = requestLanguage(req);
    const resolvedUser = result.order.user_id ? await findUserById(pool, result.order.user_id) : null;
    const { changes, changeSummary, detail } = activityChangeDetail(
      {
        orderNumber: result.order.order_number,
        decision,
        changed: result.changed,
        stripeResolution: result.stripeResolution,
      },
      { status: beforeOrder?.status ?? 'need_review' },
      { status: result.order.status },
    );
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'orders',
      action: 'orders.need_review.resolve',
      summary:
        changes.length === 0
          ? `Need-review ${result.order.order_number} (${decision}): aucun changement`
          : `Need-review ${result.order.order_number} (${decision}): ${changeSummary}`,
      targetType: 'order',
      targetId: result.order.order_number,
      detail,
    });
    res.json({
      success: true,
      changed: result.changed,
      stripeResolution: result.stripeResolution,
      order: await toAdminOrder(
        result.order,
        result.items,
        language,
        resolvedUser?.email ?? result.order.guest_email,
      ),
    });
  },
);

adminOrderManagementRouter.post('/orders/:id/verify', requireAuth, requirePermission('orders'), async (req, res) => {
  const { id } = req.params as { id: string };
  const beforeOrder = await getById(pool, id);
  const result = await verifyAdminOrder(pool, id);
  if (!result.ok) {
    const statusCode = result.reason === 'not_found' ? 404 : 409;
    res.status(statusCode).json({ success: false, error: { code: result.reason } });
    return;
  }
  const language = requestLanguage(req);
  const { detail } = activityChangeDetail(
    { orderNumber: result.order.order_number, status: result.order.status },
    { adminVerified: Boolean(beforeOrder?.admin_verified_at) },
    { adminVerified: true },
    { adminVerified: 'Verifie' },
  );
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'orders',
    action: 'orders.verify',
    summary: `Verification de la commande ${result.order.order_number}`,
    targetType: 'order',
    targetId: result.order.order_number,
    detail,
  });
  res.json({
    success: true,
    order: await toAdminOrder(
      result.order,
      result.items,
      language,
      result.order.user_email ?? result.order.guest_email,
    ),
  });
});

adminOrderManagementRouter.get('/orders/:id/sticker', requireAuth, requirePermission('orders'), async (req, res) => {
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

adminOrderManagementRouter.get('/orders/:id/tracking', requireAuth, requirePermission('orders'), async (req, res) => {
  const { id } = req.params as { id: string };
  const order = await getById(pool, id);
  if (!order) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  try {
    res.json({ success: true, tracking: await getOrderTracking(pool, order, requestLanguage(req)) });
  } catch (error) {
    if (error instanceof ShippingTrackingError) {
      res
        .status(error.code === 'shipment_not_found' ? 404 : 409)
        .json({ success: false, error: { code: error.code } });
      return;
    }
    throw error;
  }
});
