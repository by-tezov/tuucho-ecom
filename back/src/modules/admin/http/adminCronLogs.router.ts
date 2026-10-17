import { Router } from 'express';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import type { AdminCronLogTail } from '../../../contract/admin/cronLogs.js';
import { clearAdminCronLog, readAdminCronLog } from '../application/cronLogs.js';
import { isPluginEffectivelyEnabled } from '../../plugins/application/pluginStore.js';

export const adminCronLogsRouter = Router();

adminCronLogsRouter.use('/cron-logs', async (_req, res, next) => {
  if (!(await isPluginEffectivelyEnabled('journal-cron'))) {
    res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
    return;
  }
  next();
});

// Scoped to its own paths: this router is mounted on /admin without a
// prefix, and an unscoped use() would gate every later /admin route too.
adminCronLogsRouter.use('/cron-logs', requireAuth, requirePermission('cron_logs'));

/** Tail of one private cron journal. The page lists jobs without calling this. */
adminCronLogsRouter.get('/cron-logs/:kind', async (req, res) => {
  const result = await readAdminCronLog(req.params.kind ?? '', req.query.lines);
  if (!result.ok) {
    res.status(result.status).json({ success: false, error: { code: result.code } });
    return;
  }
  const body: { success: true } & AdminCronLogTail = { success: true, ...result.data };
  res.json(body);
});

/** Erase one private cron journal. The read preference does not apply. */
adminCronLogsRouter.post('/cron-logs/:kind/clear', async (req, res) => {
  const result = await clearAdminCronLog(req.params.kind ?? '');
  if (!result.ok) {
    res.status(result.status).json({ success: false, error: { code: result.code } });
    return;
  }
  res.json({ success: true, clearedFiles: result.clearedFiles });
});
