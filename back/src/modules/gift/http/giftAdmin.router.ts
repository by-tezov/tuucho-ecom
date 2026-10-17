import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requirePluginEnabled } from '../../../middleware/requirePluginEnabled.js';
import { enterAdminGiftOffer } from '../application/enterAdminGift.js';
import { presentAdminGiftOffer } from '../application/presenters.js';
import { listActiveGiftOffers } from '../infrastructure/giftAdminOfferRepo.js';
import { withGiftErrors } from './giftErrors.js';
import {
  giftAdminEnterBodySchema,
  giftAdminEnterParamsSchema,
  giftAdminOffersQuerySchema,
  parseGiftSchema,
} from './giftSchemas.js';

export const giftAdminRouter = Router();
giftAdminRouter.use(requirePluginEnabled('commerce-gift'));
giftAdminRouter.use(requireAuth, requirePermission('gift'));

giftAdminRouter.get('/offers', async (req, res) => {
  const query = parseGiftSchema(giftAdminOffersQuerySchema, req.query) ?? {};
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
  const result = await listActiveGiftOffers(pool, page, pageSize);
  res.json({
    success: true,
    offers: result.rows.map(presentAdminGiftOffer),
    pagination: {
      page,
      pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
    },
  });
});

giftAdminRouter.post('/offers/:id/enter', requirePermission('impersonate'), async (req, res) => {
  await withGiftErrors(res, async () => {
    const params = parseGiftSchema(giftAdminEnterParamsSchema, req.params);
    const body = parseGiftSchema(giftAdminEnterBodySchema, req.body ?? {});
    if (!params || !body || !req.user) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const entered = await enterAdminGiftOffer(pool, req.user, params.id, body.role);
    res.json({ success: true, ...entered });
  });
});
