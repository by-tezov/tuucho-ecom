import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { consumeUnlockToken } from '../../identity/application/accountUnlock.js';
import {
  accountDeletionRequestedSpyEmail,
  deletionRequestedEmail,
  sendMail,
  spyRecipient,
} from '../../messaging/application/email.js';
import { revokeAllUserRefreshTokens } from '../../../platform/security/token.js';
import {
  findUserById,
  reactivateIfPendingDeletion,
  requestDeletion,
} from '../../identity/application/users.js';
import { boundedToken } from '../../../utils/fieldLimits.js';
import { requestLanguage } from '../../../utils/language.js';

export const accountLifecycleRouter = Router();

accountLifecycleRouter.post('/request-deletion', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const unlockToken = boundedToken(body.unlockToken);
  if (!unlockToken) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const user = await findUserById(pool, req.user!.id);
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (!(await consumeUnlockToken(pool, user.id, 'deletion', unlockToken))) {
    res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
    return;
  }

  const { deletionScheduledFor } = await requestDeletion(pool, user.id);
  await revokeAllUserRefreshTokens(pool, user.id);
  await sendMail({
    to: user.email,
    ...deletionRequestedEmail(deletionScheduledFor.slice(0, 10), requestLanguage(req)),
  });

  const deletionSpyTo = spyRecipient('account_deletion');
  if (deletionSpyTo) {
    void sendMail({
      to: deletionSpyTo,
      ...accountDeletionRequestedSpyEmail({ email: user.email, userId: user.id, deletionScheduledFor }),
    }).catch((error) => {
      console.error('[account] deletion-requested spy notification failed', error);
    });
  }

  res.json({ success: true, deletionScheduledFor });
});

accountLifecycleRouter.post('/cancel-deletion', requireAuth, async (req, res) => {
  const reactivated = await reactivateIfPendingDeletion(pool, req.user!.id);
  res.json({ success: true, reactivated });
});
