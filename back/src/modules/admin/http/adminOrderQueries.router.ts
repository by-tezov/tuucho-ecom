import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { getAdminOrderAttentionCounts, listAdminOrdersPage } from '../../orders/application/ordersFacade.js';

import { requestedOrderPageSize, requestedPage } from './adminPagination.js';
import { isOrderStatus, toAdminOrderSummary } from './adminOrderSupport.js';

export const adminOrderQueriesRouter = Router();

/** Admin-dashboard order queue. This deliberately does not use the
 * operations endpoints: an admin's bearer token must never receive OPS_TOKEN
 * capabilities such as destructive imports or database administration. */
adminOrderQueriesRouter.get('/orders/attention-counts', requireAuth, requirePermission('orders'), async (_req, res) => {
  const counts = await getAdminOrderAttentionCounts(pool);
  res.json({ success: true, counts });
});

adminOrderQueriesRouter.get('/orders', requireAuth, requirePermission('orders'), async (req, res) => {
  const status = isOrderStatus(req.query.status) ? req.query.status : undefined;
  if (!status) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const verifiedRaw = req.query.verified;
  let verified: boolean | undefined;
  if (verifiedRaw === 'true' || verifiedRaw === 'false') {
    if (status !== 'received' && status !== 'cancelled') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    verified = verifiedRaw === 'true';
  } else if (verifiedRaw !== undefined) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const page = requestedPage(req.query.page);
  const pageSize = requestedOrderPageSize(req.query.limit);
  const result = await listAdminOrdersPage(pool, status, page, pageSize, verified);
  res.json({
    success: true,
    orders: result.orders.map(toAdminOrderSummary),
    pagination: {
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    },
  });
});
