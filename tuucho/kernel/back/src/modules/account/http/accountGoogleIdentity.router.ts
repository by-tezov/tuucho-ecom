import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { authRateLimiter } from '../../../middleware/rateLimiters.js';
import {
  consumeUnlockToken,
  isUnlockTokenValid,
  socialUnlockActions,
} from '../../identity/application/accountUnlock.js';
import { verifyGoogleIdToken } from '../../identity/application/googleAuth.js';
import { consumeLinkToken, issueLinkToken } from '../../identity/application/socialProviders.js';
import {
  clearGoogleSub,
  findUserByAnyEmailLower,
  findUserByGoogleSub,
  findUserById,
  linkGoogleKeepEmail,
  linkGoogleSwitchEmail,
  toPublicUser,
} from '../../identity/application/users.js';
import { boundedGoogleIdToken, boundedToken } from '../../../utils/fieldLimits.js';
import { rejectUnavailableShopSignIn } from '../../identity/application/signInMethodGate.js';
import { notifySocialEmailSwitch } from '../application/notifySocialEmailSwitch.js';

export const accountGoogleIdentityRouter = Router();

/** Link Sign in with Google. Match → link immediately. Mismatch → return
 * needsEmailChoice + googleLinkToken (unlock not consumed until complete). */
accountGoogleIdentityRouter.post('/link-google', requireAuth, authRateLimiter, async (req, res) => {
  if (await rejectUnavailableShopSignIn(res, 'google')) return;

  const body = req.body ?? {};
  const idToken = boundedGoogleIdToken(body.idToken);
  const unlockToken = boundedToken(body.unlockToken);
  if (!idToken || !unlockToken) {
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
    profile = await verifyGoogleIdToken(idToken);
  } catch {
    res.status(400).json({ success: false, error: { code: 'invalid_google_token' } });
    return;
  }

  if (user.google_sub != null && user.google_sub !== profile.sub) {
    res.status(409).json({ success: false, error: { code: 'google_already_linked' } });
    return;
  }

  const bySub = await findUserByGoogleSub(pool, profile.sub);
  if (bySub && bySub.id !== user.id) {
    res.status(409).json({ success: false, error: { code: 'google_already_linked' } });
    return;
  }

  const emailsMatch = profile.email === user.email.trim().toLowerCase();

  if (!emailsMatch) {
    const emailOwner = await findUserByAnyEmailLower(pool, profile.email);
    if (emailOwner && emailOwner.id !== user.id) {
      res.status(409).json({ success: false, error: { code: 'email_already_used' } });
      return;
    }

    if (!(await isUnlockTokenValid(pool, user.id, socialUnlockActions('google'), unlockToken))) {
      res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
      return;
    }

    // Unlock stays valid for /link-google/complete — do not consume here.
    const pending = await issueLinkToken(pool, 'google', {
      userId: user.id,
      providerSubject: profile.sub,
      providerEmail: profile.email,
    });
    res.json({
      success: true,
      needsEmailChoice: true,
      googleLinkToken: pending.rawToken,
      currentEmail: user.email,
      providerEmail: profile.email,
    });
    return;
  }

  if (!(await consumeUnlockToken(pool, user.id, socialUnlockActions('google'), unlockToken))) {
    res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
    return;
  }

  const refreshed = await linkGoogleKeepEmail(pool, user.id, profile.sub, profile.email);
  if (!refreshed) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, user: toPublicUser(refreshed) });
});

/** Finish Account Google link after a keep/switch choice. */
accountGoogleIdentityRouter.post('/link-google/complete', requireAuth, authRateLimiter, async (req, res) => {
  if (await rejectUnavailableShopSignIn(res, 'google')) return;

  const body = req.body ?? {};
  const googleLinkToken = boundedToken(body.googleLinkToken);
  const unlockToken = boundedToken(body.unlockToken);
  const choice = body.choice === 'keep' || body.choice === 'switch' ? body.choice : undefined;
  if (!googleLinkToken || !unlockToken || !choice) {
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

  const pending = await consumeLinkToken(pool, 'google', googleLinkToken, user.id);
  if (!pending) {
    res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }

  if (user.google_sub != null && user.google_sub !== pending.providerSubject) {
    res.status(409).json({ success: false, error: { code: 'google_already_linked' } });
    return;
  }

  const bySub = await findUserByGoogleSub(pool, pending.providerSubject);
  if (bySub && bySub.id !== user.id) {
    res.status(409).json({ success: false, error: { code: 'google_already_linked' } });
    return;
  }

  if (choice === 'switch') {
    const emailOwner = await findUserByAnyEmailLower(pool, pending.providerEmail);
    if (emailOwner && emailOwner.id !== user.id) {
      res.status(409).json({ success: false, error: { code: 'email_already_used' } });
      return;
    }
  }

  if (!(await consumeUnlockToken(pool, user.id, socialUnlockActions('google'), unlockToken))) {
    res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
    return;
  }

  const oldEmail = user.email;
  let refreshed;
  if (choice === 'keep') {
    refreshed = await linkGoogleKeepEmail(pool, user.id, pending.providerSubject, pending.providerEmail);
  } else {
    refreshed = await linkGoogleSwitchEmail(pool, user.id, pending.providerSubject, pending.providerEmail);
    if (refreshed)
      await notifySocialEmailSwitch({
        provider: 'google',
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
});

/** Unlink Google — clears google_sub + google_email; main email stays. */
accountGoogleIdentityRouter.post('/unlink-google', requireAuth, authRateLimiter, async (req, res) => {
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
  if (!(await consumeUnlockToken(pool, user.id, socialUnlockActions('google'), unlockToken))) {
    res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
    return;
  }

  if (user.google_sub == null) {
    res.json({ success: true, user: toPublicUser(user) });
    return;
  }

  await clearGoogleSub(pool, user.id);
  const refreshed = await findUserById(pool, user.id);
  if (!refreshed) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, user: toPublicUser(refreshed) });
});
