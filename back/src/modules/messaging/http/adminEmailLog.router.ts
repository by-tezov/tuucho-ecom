import { Router } from 'express';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import type { AdminEmailLogTail } from '../../../contract/admin/emailLog.js';
import { clearAdminEmailLog, readAdminEmailLog } from '../application/emailJournal.js';
import { isPluginEffectivelyEnabled } from '../../plugins/application/pluginStore.js';

export const adminEmailLogRouter = Router();

adminEmailLogRouter.use('/email-log', async (_req, res, next) => {
  if (!(await isPluginEffectivelyEnabled('journal-email'))) {
    res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
    return;
  }
  next();
});

// Scoped to its own paths: this router is mounted on /admin without a
// prefix, and an unscoped use() would gate every later /admin route too.
adminEmailLogRouter.use('/email-log', requireAuth, requirePermission('email_log'));

/** Tail of the private sent-mail journal. */
adminEmailLogRouter.get('/email-log', async (req, res) => {
  const data = await readAdminEmailLog(req.query as Record<string, unknown>);
  const body: { success: true } & AdminEmailLogTail = { success: true, ...data };
  res.json(body);
});

/** Erase the current file and every rotated generation. */
adminEmailLogRouter.post('/email-log/clear', async (_req, res) => {
  res.json({ success: true, clearedFiles: await clearAdminEmailLog() });
});
