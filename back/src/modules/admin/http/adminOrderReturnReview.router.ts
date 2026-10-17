import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requestLanguage } from '../../../utils/language.js';
import { findUserById } from '../../identity/application/users.js';
import { getById, getAdminOrderById } from '../../orders/application/ordersFacade.js';
import { getStripe } from '../../../platform/stripe/stripeClient.js';
import {
  dismissOrderReturnReview,
  getOrderReturnFinancialPreview,
  resolveOrderReturnReview,
  sendOrderReturnResolutionEmail,
  type OrderReturnRefundMode,
  type OrderReturnStockInput,
} from '../../orders/application/returns/orderReturnReview.js';
import { recordAdminActivityBestEffort } from '../../activity/application/recordAdminActivity.js';
import { activityChangeDetail } from '../../activity/application/changeDetail.js';
import { toAdminOrder } from './adminOrderSupport.js';

export const adminOrderReturnReviewRouter = Router();

function isOrderReturnStockInput(value: unknown): value is OrderReturnStockInput {
  if (!value || typeof value !== 'object') return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.productUid === 'string' &&
    typeof line.shapeKey === 'string' &&
    typeof line.lengthKey === 'string' &&
    typeof line.size === 'string' &&
    Number.isSafeInteger(line.quantity)
  );
}

adminOrderReturnReviewRouter.get(
  '/orders/:id/return-review/financial-preview',
  requireAuth,
  requirePermission('orders'),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const result = await getOrderReturnFinancialPreview(pool, getStripe(), id);
    if (!result.ok) {
      const status =
        result.reason === 'not_found' ? 404 : result.reason === 'stripe_not_configured' ? 503 : 409;
      res.status(status).json({ success: false, error: { code: result.reason } });
      return;
    }
    res.json({ success: true, preview: result });
  },
);

adminOrderReturnReviewRouter.post(
  '/orders/:id/return-review/resolve',
  requireAuth,
  requirePermission('orders'),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const refundMode = req.body?.refundMode as OrderReturnRefundMode | undefined;
    const stock = req.body?.stock as OrderReturnStockInput[] | undefined;
    if (
      req.body?.confirmed !== true ||
      !refundMode ||
      !['full', 'courier_deduction', 'custom', 'none'].includes(refundMode) ||
      !Array.isArray(stock) ||
      !stock.every(isOrderReturnStockInput) ||
      typeof req.body?.decisionReason !== 'string' ||
      !Number.isSafeInteger(req.body?.courierRetainedCents) ||
      (req.body?.customRefundAmountCents !== undefined &&
        !Number.isSafeInteger(req.body.customRefundAmountCents))
    ) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const beforeOrder = await getById(pool, id);
    const result = await resolveOrderReturnReview(pool, getStripe(), id, req.user!.id, {
      refundMode,
      courierRetainedCents: req.body.courierRetainedCents,
      ...(req.body.customRefundAmountCents === undefined
        ? {}
        : { customRefundAmountCents: req.body.customRefundAmountCents }),
      decisionReason: req.body.decisionReason,
      ...(typeof req.body.courierOverrideReason === 'string'
        ? { courierOverrideReason: req.body.courierOverrideReason }
        : {}),
      stock,
    });
    if (!result.ok) {
      const status =
        result.reason === 'not_found'
          ? 404
          : result.reason === 'invalid_request'
            ? 400
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
        refundMode,
        changed: result.changed,
      },
      { status: beforeOrder?.status ?? null },
      { status: result.order.status },
    );
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'orders',
      action: 'orders.return_review.resolve',
      summary:
        changes.length === 0
          ? `Retour ${result.order.order_number}: aucun changement`
          : `Retour ${result.order.order_number}: ${changeSummary}`,
      targetType: 'order',
      targetId: result.order.order_number,
      detail,
    });
    res.json({
      success: true,
      changed: result.changed,
      order: await toAdminOrder(
        result.order,
        result.items,
        language,
        resolvedUser?.email ?? result.order.guest_email,
      ),
    });
  },
);

adminOrderReturnReviewRouter.post(
  '/orders/:id/return-review/dismiss',
  requireAuth,
  requirePermission('orders'),
  async (req, res) => {
    const { id } = req.params as { id: string };
    if (req.body?.confirmed !== true || typeof req.body?.reason !== 'string') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const beforeOrder = await getById(pool, id);
    const result = await dismissOrderReturnReview(pool, id, req.user!.id, req.body.reason);
    if (!result.ok) {
      res
        .status(result.reason === 'not_found' ? 404 : result.reason === 'invalid_request' ? 400 : 409)
        .json({ success: false, error: { code: result.reason } });
      return;
    }
    const orderDetail = await getAdminOrderById(pool, id);
    const language = requestLanguage(req);
    const { changes, changeSummary, detail } = activityChangeDetail(
      { orderNumber: orderDetail!.order.order_number },
      { status: beforeOrder?.status ?? null },
      { status: orderDetail!.order.status },
    );
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'orders',
      action: 'orders.return_review.dismiss',
      summary:
        changes.length === 0
          ? `Cloture sans retour ${orderDetail!.order.order_number}: aucun changement`
          : `Cloture sans retour ${orderDetail!.order.order_number}: ${changeSummary}`,
      targetType: 'order',
      targetId: orderDetail!.order.order_number,
      detail,
    });
    res.json({
      success: true,
      order: await toAdminOrder(
        orderDetail!.order,
        orderDetail!.items,
        language,
        orderDetail!.order.user_email ?? orderDetail!.order.guest_email,
      ),
    });
  },
);

adminOrderReturnReviewRouter.post(
  '/orders/:id/return-review/retry-email',
  requireAuth,
  requirePermission('orders'),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const status = await sendOrderReturnResolutionEmail(pool, id);
    if (status === 'skipped') {
      res.status(409).json({ success: false, error: { code: 'invalid_status' } });
      return;
    }
    const detail = await getAdminOrderById(pool, id);
    if (!detail) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    const language = requestLanguage(req);
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'orders',
      action: 'orders.return_review.retry_email',
      summary: `Renvoi de l'e-mail de resolution retour pour ${detail.order.order_number}`,
      targetType: 'order',
      targetId: detail.order.order_number,
      detail: { orderNumber: detail.order.order_number, emailStatus: status },
    });
    res.json({
      success: true,
      emailStatus: status,
      order: await toAdminOrder(
        detail.order,
        detail.items,
        language,
        detail.order.user_email ?? detail.order.guest_email,
      ),
    });
  },
);
