import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { authRateLimiter } from '../../../middleware/rateLimiters.js';
import {
  consumeUnlockToken,
  isUnlockTokenValid,
  socialUnlockActions,
} from '../../identity/application/accountUnlock.js';
import { verifyFacebookAccessToken } from '../../identity/application/facebookAuth.js';
import { consumeLinkToken, issueLinkToken } from '../../identity/application/socialProviders.js';
import {
  clearFacebookUserId,
  findUserByAnyEmailLower,
  findUserByFacebookUserId,
  findUserById,
  linkFacebookKeepEmail,
  linkFacebookSwitchEmail,
  toPublicUser,
} from '../../identity/application/users.js';
import { boundedFacebookAccessToken, boundedToken } from '../../../utils/fieldLimits.js';
import { rejectUnavailableShopSignIn } from '../../identity/application/signInMethodGate.js';
import { notifySocialEmailSwitch } from '../application/notifySocialEmailSwitch.js';

export const accountFacebookIdentityRouter = Router();

/** Link Facebook Login. Match → link immediately. Mismatch → needsEmailChoice. */
accountFacebookIdentityRouter.post('/link-facebook', requireAuth, authRateLimiter, async (req, res) => {
  if (await rejectUnavailableShopSignIn(res, 'facebook')) return;

  const body = req.body ?? {};
  const accessToken = boundedFacebookAccessToken(body.accessToken);
  const unlockToken = boundedToken(body.unlockToken);
  if (!accessToken || !unlockToken) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const user = await findUserById(pool, req.user!.id);
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (user.pending_email) {
    res.status(409).json({ success: false, error: { code: 'email_change_pending' } });
    return;
  }

  let profile;
  try {
    profile = await verifyFacebookAccessToken(accessToken);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_facebook_token';
    if (code === 'facebook_email_required') {
      res.status(400).json({ success: false, error: { code: 'facebook_email_required' } });
      return;
    }
    res.status(400).json({ success: false, error: { code: 'invalid_facebook_token' } });
    return;
  }

  if (user.facebook_user_id != null && user.facebook_user_id !== profile.userId) {
    res.status(409).json({ success: false, error: { code: 'facebook_already_linked' } });
    return;
  }

  const byId = await findUserByFacebookUserId(pool, profile.userId);
  if (byId && byId.id !== user.id) {
    res.status(409).json({ success: false, error: { code: 'facebook_already_linked' } });
    return;
  }

  const emailsMatch = profile.email === user.email.trim().toLowerCase();

  if (!emailsMatch) {
    const emailOwner = await findUserByAnyEmailLower(pool, profile.email);
    if (emailOwner && emailOwner.id !== user.id) {
      res.status(409).json({ success: false, error: { code: 'email_already_used' } });
      return;
    }

    if (!(await isUnlockTokenValid(pool, user.id, socialUnlockActions('facebook'), unlockToken))) {
      res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
      return;
    }

    const pending = await issueLinkToken(pool, 'facebook', {
      userId: user.id,
      providerSubject: profile.userId,
      providerEmail: profile.email,
    });
    res.json({
      success: true,
      needsEmailChoice: true,
      facebookLinkToken: pending.rawToken,
      currentEmail: user.email,
      providerEmail: profile.email,
    });
    return;
  }

  if (!(await consumeUnlockToken(pool, user.id, socialUnlockActions('facebook'), unlockToken))) {
    res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
    return;
  }

  const refreshed = await linkFacebookKeepEmail(pool, user.id, profile.userId, profile.email);
  if (!refreshed) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, user: toPublicUser(refreshed) });
});

accountFacebookIdentityRouter.post(
  '/link-facebook/complete',
  requireAuth,
  authRateLimiter,
  async (req, res) => {
    if (await rejectUnavailableShopSignIn(res, 'facebook')) return;

    const body = req.body ?? {};
    const facebookLinkToken = boundedToken(body.facebookLinkToken);
    const unlockToken = boundedToken(body.unlockToken);
    const choice = body.choice === 'keep' || body.choice === 'switch' ? body.choice : undefined;
    if (!facebookLinkToken || !unlockToken || !choice) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }

    const user = await findUserById(pool, req.user!.id);
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    if (user.pending_email) {
      res.status(409).json({ success: false, error: { code: 'email_change_pending' } });
      return;
    }

    const pending = await consumeLinkToken(pool, 'facebook', facebookLinkToken, user.id);
    if (!pending) {
      res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
      return;
    }

    if (user.facebook_user_id != null && user.facebook_user_id !== pending.providerSubject) {
      res.status(409).json({ success: false, error: { code: 'facebook_already_linked' } });
      return;
    }

    const byId = await findUserByFacebookUserId(pool, pending.providerSubject);
    if (byId && byId.id !== user.id) {
      res.status(409).json({ success: false, error: { code: 'facebook_already_linked' } });
      return;
    }

    if (choice === 'switch') {
      const emailOwner = await findUserByAnyEmailLower(pool, pending.providerEmail);
      if (emailOwner && emailOwner.id !== user.id) {
        res.status(409).json({ success: false, error: { code: 'email_already_used' } });
        return;
      }
    }

    if (!(await consumeUnlockToken(pool, user.id, socialUnlockActions('facebook'), unlockToken))) {
      res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
      return;
    }

    const oldEmail = user.email;
    let refreshed;
    if (choice === 'keep') {
      refreshed = await linkFacebookKeepEmail(pool, user.id, pending.providerSubject, pending.providerEmail);
    } else {
      refreshed = await linkFacebookSwitchEmail(
        pool,
        user.id,
        pending.providerSubject,
        pending.providerEmail,
      );
      if (refreshed)
        await notifySocialEmailSwitch({
          provider: 'facebook',
          userId: user.id,
          oldEmail,
          newEmail: pending.providerEmail,
        });
    }

    if (!refreshed) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    res.json({ success: true, user: toPublicUser(refreshed) });
  },
);

/** Unlink Facebook — clears facebook_user_id + facebook_email; main email stays. */
accountFacebookIdentityRouter.post('/unlink-facebook', requireAuth, authRateLimiter, async (req, res) => {
  const unlockToken = boundedToken(req.body?.unlockToken);
  if (!unlockToken) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const user = await findUserById(pool, req.user!.id);
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (!(await consumeUnlockToken(pool, user.id, socialUnlockActions('facebook'), unlockToken))) {
    res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
    return;
  }

  if (user.facebook_user_id == null) {
    res.json({ success: true, user: toPublicUser(user) });
    return;
  }

  await clearFacebookUserId(pool, user.id);
  const refreshed = await findUserById(pool, user.id);
  if (!refreshed) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, user: toPublicUser(refreshed) });
});
