import { Router } from 'express';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import {
  deleteGithubRepositoryAccess,
  GithubAccessError,
  listGithubRepositoryAccess,
  saveGithubRepositoryAccess,
} from '../../plugins/application/githubRepositoryAccess.js';

export const adminGithubAccessRouter = Router();

adminGithubAccessRouter.use('/github-access', requireAuth, requirePermission('preferences'));

function fail(res: { status: (code: number) => { json: (body: unknown) => void } }, error: unknown): void {
  if (error instanceof GithubAccessError) {
    res.status(400).json({ success: false, error: { code: error.code } });
    return;
  }
  res.status(500).json({ success: false, error: { code: 'github_access_failed' } });
}

adminGithubAccessRouter.get('/github-access', async (_req, res) => {
  try {
    const entries = await listGithubRepositoryAccess();
    res.json({ success: true, entries });
  } catch (error) {
    fail(res, error);
  }
});

adminGithubAccessRouter.put('/github-access', requirePermission('plugin_config_import'), async (req, res) => {
  const repository = typeof req.body?.repository === 'string' ? req.body.repository : '';
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  try {
    const entry = await saveGithubRepositoryAccess({
      repository,
      token,
      updatedBy: req.user?.id ?? null,
    });
    res.json({ success: true, entry });
  } catch (error) {
    fail(res, error);
  }
});

adminGithubAccessRouter.delete(
  '/github-access',
  requirePermission('plugin_config_import'),
  async (req, res) => {
    const repository = typeof req.body?.repository === 'string' ? req.body.repository : '';
    try {
      const removed = await deleteGithubRepositoryAccess(repository);
      if (!removed) {
        res.status(404).json({ success: false, error: { code: 'not_found' } });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      fail(res, error);
    }
  },
);
