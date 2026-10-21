import { Router } from 'express';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { normalizeRedirectInput } from '../application/assembleSeo.js';
import { buildSeoHub, deleteStoredRedirect, upsertStoredRedirect } from '../application/seoEngine.js';

export const adminSeoRouter = Router();

adminSeoRouter.use(requireAuth, requirePermission('preferences'));

adminSeoRouter.get('/seo', async (_req, res, next) => {
  try {
    const hub = await buildSeoHub();
    res.json({ success: true, ...hub });
  } catch (error) {
    next(error);
  }
});

adminSeoRouter.post('/seo/redirects', async (req, res, next) => {
  try {
    const parsed = normalizeRedirectInput(req.body?.fromPath, req.body?.toPath, req.body?.status);
    if ('error' in parsed) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    await upsertStoredRedirect(parsed.fromPath, parsed.toPath, parsed.status);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

adminSeoRouter.delete('/seo/redirects/:id', async (req, res, next) => {
  try {
    const ok = await deleteStoredRedirect(String(req.params.id ?? ''));
    if (!ok) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
