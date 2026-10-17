import { Router } from 'express';
import { requirePermission } from '@kernel/back/middleware/requirePermission';
import { requireAuth } from '@kernel/back/middleware/requireAuth';
import type { AdminApiLogTail } from '@kernel/back/contract/admin/apiLog';
import {
  clearAdminApiLog,
  readAdminApiLog,
} from '@kernel/back/modules/admin/application/apiLog';

export const adminApiLogRouter = Router();

adminApiLogRouter.use('/api-log', requireAuth, requirePermission('api_log'));

adminApiLogRouter.get('/api-log', async (req, res) => {
  const data = await readAdminApiLog(req.query as Record<string, unknown>);
  const body: { success: true } & AdminApiLogTail = { success: true, ...data };
  res.json(body);
});

adminApiLogRouter.post('/api-log/clear', async (_req, res) => {
  res.json({ success: true, clearedFiles: await clearAdminApiLog() });
});
