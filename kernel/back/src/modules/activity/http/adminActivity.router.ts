import { Router } from 'express';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { clearActivityLog, listActivity, listActivityActors } from '../application/listActivity.js';

export const adminActivityRouter = Router();

// Scoped to its own paths: this router is mounted on /admin without a
// prefix, and an unscoped use() would gate every later /admin route too.
adminActivityRouter.use('/activity', requireAuth, requirePermission('activity'));

adminActivityRouter.get('/activity/actors', async (_req, res) => {
  const actors = await listActivityActors();
  res.json({ success: true, actors });
});

adminActivityRouter.post('/activity/clear', async (_req, res) => {
  const clearedFiles = await clearActivityLog();
  res.json({ success: true, clearedFiles });
});

adminActivityRouter.get('/activity', async (req, res) => {
  const result = await listActivity({
    page: req.query.page as string | undefined,
    pageSize: req.query.pageSize as string | undefined,
    category: req.query.category,
    origin: req.query.origin,
    actorUserId: req.query.actorUserId,
    q: req.query.q,
  });
  res.json({
    success: true,
    entries: result.entries,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
    },
  });
});
