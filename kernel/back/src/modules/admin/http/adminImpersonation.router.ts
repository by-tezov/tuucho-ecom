import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { boundedEmail } from '../../../utils/fieldLimits.js';
import { signAccessToken, accessTokenExpiresAt } from '../../../platform/security/token.js';
import { findUserByEmailLower, toPublicUser } from '../../identity/application/users.js';
import { recordAdminActivityBestEffort } from '../../activity/application/recordAdminActivity.js';

export const adminImpersonationRouter = Router();

adminImpersonationRouter.post('/impersonate', requireAuth, requirePermission('impersonate'), async (req, res) => {
  const email = boundedEmail(req.body?.email);
  if (!email) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const target = await findUserByEmailLower(pool, email);
  if (!target) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (target.status === 'locked' || target.status === 'deleted' || target.role !== 'user') {
    // Customers only: a staff account (administrator or otherwise) is never
    // impersonated, so impersonation cannot borrow another staff role's grants.
    res.status(409).json({ success: false, error: { code: 'impersonation_not_allowed' } });
    return;
  }
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'accounts',
    action: 'accounts.impersonate',
    summary: `Debut d'usurpation du compte ${target.email}`,
    targetType: 'user',
    targetId: target.id,
    detail: { userId: target.id, email: target.email },
  });
  res.json({
    success: true,
    user: toPublicUser(target),
    accessToken: signAccessToken({ sub: target.id, email: target.email, impersonatorId: req.user!.id }),
    accessTokenExpiresAt: accessTokenExpiresAt(),
  });
});
