import { Router } from 'express';
import { requireAuth } from '@kernel/back/middleware/requireAuth';
import { requirePermission } from '@kernel/back/middleware/requirePermission';
import type { AdminEmailLogTail } from '@kernel/back/contract/admin/emailLog';
import {
  clearAdminEmailLog,
  readAdminEmailLog,
} from '@kernel/back/modules/messaging/application/emailJournal';

export const adminEmailLogRouter = Router();

adminEmailLogRouter.use('/email-log', requireAuth, requirePermission('email_log'));

adminEmailLogRouter.get('/email-log', async (req, res) => {
  const data = await readAdminEmailLog(req.query as Record<string, unknown>);
  const body: { success: true } & AdminEmailLogTail = { success: true, ...data };
  res.json(body);
});

adminEmailLogRouter.post('/email-log/clear', async (_req, res) => {
  res.json({ success: true, clearedFiles: await clearAdminEmailLog() });
});
