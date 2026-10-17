import { Router } from 'express';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import type { AdminApiLogTail } from '../../../contract/admin/apiLog.js';
import { clearAdminApiLog, readAdminApiLog } from '../application/apiLog.js';
import { isPluginEffectivelyEnabled } from '../../plugins/application/pluginStore.js';

export const adminApiLogRouter = Router();

adminApiLogRouter.use('/api-log', async (_req, res, next) => {
  if (!(await isPluginEffectivelyEnabled('journal-admin'))) {
    res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
    return;
  }
  next();
});

// Scoped to its own paths: this router is mounted on /admin without a
// prefix, and an unscoped use() would gate every later /admin route too.
adminApiLogRouter.use('/api-log', requireAuth, requirePermission('api_log'));

/** Tail of the private API diagnostic journal. */
adminApiLogRouter.get('/api-log', async (req, res) => {
  const data = await readAdminApiLog(req.query as Record<string, unknown>);
  const body: { success: true } & AdminApiLogTail = { success: true, ...data };
  res.json(body);
});

/** Erase the current file and every rotated generation. */
adminApiLogRouter.post('/api-log/clear', async (_req, res) => {
  res.json({ success: true, clearedFiles: await clearAdminApiLog() });
});
