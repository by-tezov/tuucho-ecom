import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { languageFromPreference, requestLanguage } from '../../../utils/language.js';
import { findUserById } from '../../identity/application/users.js';
import { getById, getAdminOrderById, setStatus } from '../../orders/application/ordersFacade.js';
import { applyOrderStatusEffects } from '../../orders/application/status/orderStatusEffects.js';
import { getStripe } from '../../../platform/stripe/stripeClient.js';
import { ShippingLabelError } from '../../shipping/application/shippingLabels.js';
import { orderStatusUpdateEmail, sendMail } from '../../messaging/application/email.js';
import {
  maybeIssueGuestOrderManageUrl,
  orderCheckoutLanguage,
} from '../../orders/application/guestOrderManage.js';
import { getUserPreference } from '../../identity/application/userPreferences.js';
import { recordAdminActivityBestEffort } from '../../activity/application/recordAdminActivity.js';
import { giftReceiverMailTarget, sameGiftMailAddress } from '../../orders/application/giftSnapshot.js';
import {
  advanceAdminOrderBeyondSent,
  isOrderStatus,
  orderNeedsAutomatedShippingLabel,
  shippingPacketForOrder,
  toAdminOrder,
} from './adminOrderSupport.js';

export const adminOrderStatusRouter = Router();

adminOrderStatusRouter.patch('/orders/:id/status', requireAuth, requirePermission('orders'), async (req, res) => {
  const { id } = req.params as { id: string };
  const status = isOrderStatus(req.body?.status) ? req.body.status : undefined;
  const advanceToReceived = req.body?.advanceToReceived === true;
  const advanceToReturnReview = req.body?.advanceToReturnReview === true;
  if (!status && !advanceToReceived && !advanceToReturnReview) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (status && !['in_preparation', 'to_send', 'sent'].includes(status)) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (advanceToReceived && advanceToReturnReview) {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
      message: 'advanceToReceived and advanceToReturnReview are mutually exclusive.',
    });
    return;
  }
  if ((advanceToReceived || advanceToReturnReview) && status) {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
      message: 'advanceToReceived and advanceToReturnReview must be sent without status.',
    });
    return;
  }
  if (req.body?.advanceToSent === true) {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
      message: 'advanceToSent is no longer supported; use status sent from to_send.',
    });
    return;
  }
  const noPayment = req.body?.noPayment === true;
  if (noPayment && status !== 'in_preparation') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const skipShippingLabel = status === 'to_send' && req.body?.skipShippingLabel === true;
  if (req.body?.skipShippingLabel === true && status !== 'to_send') {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
      message: 'skipShippingLabel is only allowed when moving to to_send.',
    });
    return;
  }
  const current = await getById(pool, id);
  if (!current) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const language = requestLanguage(req);

  if (!status && (advanceToReceived || advanceToReturnReview)) {
    if (current.status !== 'sent' && current.status !== 'disponible') {
      res.status(409).json({
        success: false,
        error: { code: 'invalid_transition' },
        message: `Order ${current.order_number} must be sent before marking received or return review (current: ${current.status}).`,
      });
      return;
    }
    const detail = await getAdminOrderById(pool, id);
    if (!detail) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    const target = advanceToReceived ? 'received' : 'return_review';
    const advanced = await advanceAdminOrderBeyondSent(
      pool,
      id,
      detail.order,
      detail.items,
      target,
      req.user!.id,
    );
    if (!advanced.ok) {
      const statusCode =
        advanced.reason === 'not_found' ? 404 : advanced.reason === 'stripe_not_configured' ? 501 : 409;
      res.status(statusCode).json({
        success: false,
        error: { code: advanced.reason },
        message: advanced.message,
      });
      return;
    }
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'orders',
      action: 'orders.status',
      summary: `Changement de statut de la commande ${current.order_number} (${current.status} vers ${advanced.order.status})`,
      targetType: 'order',
      targetId: current.order_number,
      detail: {
        orderNumber: current.order_number,
        fromStatus: current.status,
        toStatus: advanced.order.status,
      },
    });
    res.json({
      success: true,
      order: await toAdminOrder(advanced.order, advanced.items, language, null),
    });
    return;
  }

  if (status === 'sent') {
    if (current.status !== 'to_send') {
      res.status(409).json({
        success: false,
        error: { code: 'invalid_transition' },
        message: `Order ${current.order_number} must be ready to send before marking shipped (current: ${current.status}).`,
      });
      return;
    }
    try {
      const sentResult = await setStatus(pool, id, 'sent', undefined, false, { stripe: getStripe() });
      if (!sentResult.ok) {
        const statusCode =
          sentResult.reason === 'not_found' ? 404 : sentResult.reason === 'stripe_not_configured' ? 501 : 409;
        res
          .status(statusCode)
          .json({ success: false, error: { code: sentResult.reason }, message: sentResult.message });
        return;
      }
      if (sentResult.changed) await applyOrderStatusEffects(pool, 'sent', sentResult.order, sentResult.items);
      if (sentResult.changed) {
        await recordAdminActivityBestEffort(pool, req.user!, {
          category: 'orders',
          action: 'orders.status',
          summary: `Changement de statut de la commande ${current.order_number} (${current.status} vers sent)`,
          targetType: 'order',
          targetId: current.order_number,
          detail: {
            orderNumber: current.order_number,
            fromStatus: current.status,
            toStatus: 'sent',
          },
        });
      }
      res.json({
        success: true,
        order: await toAdminOrder(sentResult.order, sentResult.items, language, null),
      });
    } catch (error) {
      if (error instanceof ShippingLabelError) {
        res.status(409).json({ success: false, error: { code: error.code }, message: error.message });
        return;
      }
      throw error;
    }
    return;
  }

  if (status === 'to_send' && current.status === 'to_send') {
    res.status(409).json({
      success: false,
      error: { code: 'invalid_transition' },
      message: `Order ${current.order_number} is already ready to send; use status sent to mark shipped.`,
    });
    return;
  }

  const enteringToSend = status === 'to_send' && current.status !== 'to_send';
  const needsAutomatedLabel =
    enteringToSend && !skipShippingLabel && (await orderNeedsAutomatedShippingLabel(id));
  const packet = needsAutomatedLabel ? await shippingPacketForOrder(id) : undefined;
  if (needsAutomatedLabel && !packet) {
    res.status(400).json({
      success: false,
      error: { code: 'shipping_packet_missing' },
      message:
        'No shipping packet measurements match this order nail quantity. Configure courier packet tiers in admin shipping catalog.',
    });
    return;
  }
  try {
    const result = await setStatus(pool, id, status!, packet, skipShippingLabel, {
      noPayment,
      stripe: getStripe(),
    });
    if (!result.ok) {
      const statusCode =
        result.reason === 'not_found' ? 404 : result.reason === 'stripe_not_configured' ? 501 : 409;
      res
        .status(statusCode)
        .json({ success: false, error: { code: result.reason }, message: result.message });
      return;
    }
    if (result.changed) await applyOrderStatusEffects(pool, status!, result.order, result.items);
    const customerNotifyStatus = status === 'in_preparation' || status === 'to_send' ? status : null;
    if (result.changed && req.body?.notifyCustomer === true && customerNotifyStatus) {
      const user = result.order.user_id ? await findUserById(pool, result.order.user_id) : null;
      const email = user?.email ?? result.order.guest_email;
      if (email) {
        const notifyLanguage = user
          ? languageFromPreference(await getUserPreference(pool, user.id, 'language'))
          : orderCheckoutLanguage(result.order.language);
        const manageOrderUrl = await maybeIssueGuestOrderManageUrl(pool, result.order, email, notifyLanguage);
        await sendMail({
          to: email,
          ...orderStatusUpdateEmail(
            result.order.order_number,
            customerNotifyStatus,
            notifyLanguage,
            manageOrderUrl,
          ),
        });
        const giftReceiver = await giftReceiverMailTarget(pool, result.order);
        if (giftReceiver && !sameGiftMailAddress(giftReceiver.email, email)) {
          await sendMail({
            to: giftReceiver.email,
            ...orderStatusUpdateEmail(
              result.order.order_number,
              customerNotifyStatus,
              giftReceiver.language,
            ),
          });
        }
      }
    }
    if (result.changed) {
      await recordAdminActivityBestEffort(pool, req.user!, {
        category: 'orders',
        action: 'orders.status',
        summary: `Changement de statut de la commande ${current.order_number} (${current.status} vers ${status})`,
        targetType: 'order',
        targetId: current.order_number,
        detail: {
          orderNumber: current.order_number,
          fromStatus: current.status,
          toStatus: status,
          noPayment: noPayment || null,
          skipShippingLabel: skipShippingLabel || null,
          notifyCustomer: req.body?.notifyCustomer === true,
        },
      });
    }
    res.json({
      success: true,
      order: await toAdminOrder(result.order, result.items, language, null),
    });
  } catch (error) {
    if (error instanceof ShippingLabelError) {
      res.status(409).json({ success: false, error: { code: error.code }, message: error.message });
      return;
    }
    throw error;
  }
});
