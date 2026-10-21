import { Router } from 'express';
import { pool } from '@kernel/back/db/pool';
import { requirePermission } from '@kernel/back/middleware/requirePermission';
import { requireAuth } from '@kernel/back/middleware/requireAuth';
import { config } from '@kernel/back/config/env';
import { productRequestReplyTo } from '../infrastructure/productRequestSettings.js';
import { sendMail } from '@kernel/back/modules/messaging/application/email';
import {
  productRequestReplyLanguage,
  getProductRequestByPublicId,
  getAdminProductRequestAttentionCounts,
  isProductRequestStatus,
  listProductRequestMessages,
  listProductRequestsPage,
  productRequestReplyToken,
  setProductRequestStatus,
} from '../application/productRequest.js';
import { productRequestResponseEmail } from '@kernel/back/modules/messaging/application/email';

import { recordAdminActivityBestEffort } from '@kernel/back/modules/activity/application/recordAdminActivity';
import { ADMIN_PRODUCT_REQUEST_PAGE_SIZE, requestedPage } from '@kernel/back/modules/admin/http/adminPagination';
import { requirePluginEnabled } from '@kernel/back/middleware/requirePluginEnabled';

function adminProductRequest<T extends { photoPath?: string | null }>(request: T | null | undefined) {
  if (!request) return request;
  return {
    ...request,
    photoPath: request.photoPath ? `${config.publicMediaUrl}/${request.photoPath.replace(/^\/+/, '')}` : null,
  };
}

export const adminProductRequestsRouter = Router();
adminProductRequestsRouter.use('/product-requests', requirePluginEnabled('tuucho-commerce-product-requests'));

adminProductRequestsRouter.get(
  '/product-requests/attention-counts',
  requireAuth,
  requirePermission('product_requests'),
  async (_req, res) => {
    const counts = await getAdminProductRequestAttentionCounts(pool);
    res.json({ success: true, counts });
  },
);

adminProductRequestsRouter.get('/product-requests', requireAuth, requirePermission('product_requests'), async (req, res) => {
  const status = isProductRequestStatus(req.query.status) ? req.query.status : undefined;
  if (!status) return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
  const page = requestedPage(req.query.page);
  const result = await listProductRequestsPage(pool, status, page, ADMIN_PRODUCT_REQUEST_PAGE_SIZE);
  res.json({
    success: true,
    requests: result.requests.map((request) => adminProductRequest(request)),
    pagination: {
      page,
      pageSize: ADMIN_PRODUCT_REQUEST_PAGE_SIZE,
      total: result.total,
      totalPages: Math.ceil(result.total / ADMIN_PRODUCT_REQUEST_PAGE_SIZE),
    },
  });
});

adminProductRequestsRouter.get('/product-requests/:publicId', requireAuth, requirePermission('product_requests'), async (req, res) => {
  const request = await getProductRequestByPublicId(pool, String(req.params.publicId).toUpperCase());
  if (!request) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  res.json({
    success: true,
    request: adminProductRequest(request),
    messages: await listProductRequestMessages(pool, request.id),
  });
});

adminProductRequestsRouter.patch(
  '/product-requests/:publicId',
  requireAuth,
  requirePermission('product_requests'),
  async (req, res) => {
    const publicId = String(req.params.publicId).toUpperCase();
    const status = req.body?.status;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const price = Number(req.body?.price);
    if ((status !== 'accepted' && status !== 'refused') || !message || !Number.isFinite(price) || price <= 0)
      return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    const current = await getProductRequestByPublicId(pool, publicId);
    if (!current) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
    const result = await setProductRequestStatus(
      pool,
      publicId,
      status,
      status === 'refused' ? message : null,
    );
    if (!result.ok) return void res.status(400).json({ success: false, error: { code: result.reason } });
    await pool.query(`update product_requests set response_price = $2, response_message = $3 where id = $1`, [
      current.id,
      price,
      (await import('@kernel/back/platform/security/piiCrypto')).encryptPii(message),
    ]);
    await pool.query(
      `insert into product_request_messages (request_id, direction, body) values ($1, 'admin', $2)`,
      [current.id, (await import('@kernel/back/platform/security/piiCrypto')).encryptPii(message)],
    );
    await sendMail({
      to: current.email,
      replyTo: productRequestReplyTo() ?? config.smtp.user,
      ...productRequestResponseEmail({
        publicId,
        token: productRequestReplyToken(publicId),
        title: current.title,
        size: current.size,
        quantity: current.quantity,
        price,
        message,
        accepted: status === 'accepted',
        language: await productRequestReplyLanguage(pool, current),
      }),
    });
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'messaging',
      action: status === 'accepted' ? 'messaging.product_request.accept' : 'messaging.product_request.refuse',
      summary:
        status === 'accepted'
          ? `Acceptation de la demande produit ${publicId}`
          : `Refus de la demande produit ${publicId}`,
      targetType: 'product_request',
      targetId: publicId,
      detail: {
        publicId,
        status,
        price,
        size: current.size,
        quantity: current.quantity,
        messageLength: message.length,
      },
    });
    res.json({ success: true });
  },
);

/** Browser admins use their own bearer identity here; /operation/chat remains
 * reserved for the server-side mailbox pipe and its OPS_TOKEN. */
