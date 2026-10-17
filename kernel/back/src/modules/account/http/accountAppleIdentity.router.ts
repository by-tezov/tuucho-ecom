import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { authRateLimiter } from '../../../middleware/rateLimiters.js';
import {
  consumeUnlockToken,
  isUnlockTokenValid,
  socialUnlockActions,
} from '../../identity/application/accountUnlock.js';
import { verifyAppleIdentityToken } from '../../identity/application/appleAuth.js';
import { consumeLinkToken, issueLinkToken } from '../../identity/application/socialProviders.js';
import {
  clearAppleSub,
  findUserByAnyEmailLower,
  findUserByAppleSub,
  findUserById,
  linkAppleKeepEmail,
  linkAppleSwitchEmail,
  toPublicUser,
} from '../../identity/application/users.js';
import { boundedAppleIdentityToken, boundedAppleNonce, boundedToken } from '../../../utils/fieldLimits.js';
import { rejectUnavailableShopSignIn } from '../../identity/application/signInMethodGate.js';
import { notifySocialEmailSwitch } from '../application/notifySocialEmailSwitch.js';

export const accountAppleIdentityRouter = Router();

/** Link Sign in with Apple. Match → link immediately. Mismatch → needsEmailChoice. */
accountAppleIdentityRouter.post('/link-apple', requireAuth, authRateLimiter, async (req, res) => {
  if (await rejectUnavailableShopSignIn(res, 'apple')) return;

  const body = req.body ?? {};
  const idToken = boundedAppleIdentityToken(body.idToken);
  const nonce = boundedAppleNonce(body.nonce);
  const unlockToken = boundedToken(body.unlockToken);
  if (!idToken || !nonce || !unlockToken) {
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
    profile = await verifyAppleIdentityToken(idToken, nonce);
  } catch {
    res.status(400).json({ success: false, error: { code: 'invalid_apple_token' } });
    return;
  }

  if (!profile.email) {
    res.status(400).json({ success: false, error: { code: 'apple_email_required' } });
    return;
  }

  if (user.apple_sub != null && user.apple_sub !== profile.sub) {
    res.status(409).json({ success: false, error: { code: 'apple_already_linked' } });
    return;
  }

  const bySub = await findUserByAppleSub(pool, profile.sub);
  if (bySub && bySub.id !== user.id) {
    res.status(409).json({ success: false, error: { code: 'apple_already_linked' } });
    return;
  }

  const emailsMatch = profile.email === user.email.trim().toLowerCase();

  if (!emailsMatch) {
    const emailOwner = await findUserByAnyEmailLower(pool, profile.email);
    if (emailOwner && emailOwner.id !== user.id) {
      res.status(409).json({ success: false, error: { code: 'email_already_used' } });
      return;
    }

    if (!(await isUnlockTokenValid(pool, user.id, socialUnlockActions('apple'), unlockToken))) {
      res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
      return;
    }

    // Unlock stays valid for /link-apple/complete — do not consume here.
    const pending = await issueLinkToken(pool, 'apple', {
      userId: user.id,
      providerSubject: profile.sub,
      providerEmail: profile.email,
    });
    res.json({
      success: true,
      needsEmailChoice: true,
      appleLinkToken: pending.rawToken,
      currentEmail: user.email,
      providerEmail: profile.email,
    });
    return;
  }

  if (!(await consumeUnlockToken(pool, user.id, socialUnlockActions('apple'), unlockToken))) {
    res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
    return;
  }

  const refreshed = await linkAppleKeepEmail(pool, user.id, profile.sub, profile.email);
  if (!refreshed) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, user: toPublicUser(refreshed) });
});

/** Finish Account Apple link after a keep/switch choice. */
accountAppleIdentityRouter.post('/link-apple/complete', requireAuth, authRateLimiter, async (req, res) => {
  if (await rejectUnavailableShopSignIn(res, 'apple')) return;

  const body = req.body ?? {};
  const appleLinkToken = boundedToken(body.appleLinkToken);
  const unlockToken = boundedToken(body.unlockToken);
  const choice = body.choice === 'keep' || body.choice === 'switch' ? body.choice : undefined;
  if (!appleLinkToken || !unlockToken || !choice) {
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

  const pending = await consumeLinkToken(pool, 'apple', appleLinkToken, user.id);
  if (!pending) {
    res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }

  if (user.apple_sub != null && user.apple_sub !== pending.providerSubject) {
    res.status(409).json({ success: false, error: { code: 'apple_already_linked' } });
    return;
  }

  const bySub = await findUserByAppleSub(pool, pending.providerSubject);
  if (bySub && bySub.id !== user.id) {
    res.status(409).json({ success: false, error: { code: 'apple_already_linked' } });
    return;
  }

  if (choice === 'switch') {
    const emailOwner = await findUserByAnyEmailLower(pool, pending.providerEmail);
    if (emailOwner && emailOwner.id !== user.id) {
      res.status(409).json({ success: false, error: { code: 'email_already_used' } });
      return;
    }
  }

  if (!(await consumeUnlockToken(pool, user.id, socialUnlockActions('apple'), unlockToken))) {
    res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
    return;
  }

  const oldEmail = user.email;
  let refreshed;
  if (choice === 'keep') {
    refreshed = await linkAppleKeepEmail(pool, user.id, pending.providerSubject, pending.providerEmail);
  } else {
    refreshed = await linkAppleSwitchEmail(pool, user.id, pending.providerSubject, pending.providerEmail);
    if (refreshed)
      await notifySocialEmailSwitch({
        provider: 'apple',
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

/** Unlink Apple — clears apple_sub + apple_email; main email stays. */
accountAppleIdentityRouter.post('/unlink-apple', requireAuth, authRateLimiter, async (req, res) => {
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
  if (!(await consumeUnlockToken(pool, user.id, socialUnlockActions('apple'), unlockToken))) {
    res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
    return;
  }

  if (user.apple_sub == null) {
    res.json({ success: true, user: toPublicUser(user) });
    return;
  }

  await clearAppleSub(pool, user.id);
  const refreshed = await findUserById(pool, user.id);
  if (!refreshed) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, user: toPublicUser(refreshed) });
});
