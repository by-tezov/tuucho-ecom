import { Router } from 'express';
import { requirePermission } from '@kernel/back/middleware/requirePermission';
import { requireAuth } from '@kernel/back/middleware/requireAuth';
import type { AdminCronLogTail } from '@kernel/back/contract/admin/cronLogs';
import {
  clearAdminCronLog,
  readAdminCronLog,
} from '@kernel/back/modules/admin/application/cronLogs';

export const adminCronLogsRouter = Router();

adminCronLogsRouter.use('/cron-logs', requireAuth, requirePermission('cron_logs'));

adminCronLogsRouter.get('/cron-logs/:kind', async (req, res) => {
  const result = await readAdminCronLog(req.params.kind ?? '', req.query.lines);
  if (!result.ok) {
    res.status(result.status).json({ success: false, error: { code: result.code } });
    return;
  }
  const body: { success: true } & AdminCronLogTail = { success: true, ...result.data };
  res.json(body);
});

adminCronLogsRouter.post('/cron-logs/:kind/clear', async (req, res) => {
  const result = await clearAdminCronLog(req.params.kind ?? '');
  if (!result.ok) {
    res.status(result.status).json({ success: false, error: { code: result.code } });
    return;
  }
  res.json({ success: true, clearedFiles: result.clearedFiles });
});
