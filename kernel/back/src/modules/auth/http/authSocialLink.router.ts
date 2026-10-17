import { Router } from 'express';
import { authRateLimiter, loginRateLimiter } from '../../../middleware/rateLimiters.js';
import { isBoolean } from '../../../utils/validate.js';
import { boundedEmail, boundedOtpCode, boundedToken } from '../../../utils/fieldLimits.js';
import { pool } from '../../../db/pool.js';
import { isCurrentlyLocked } from '../../identity/application/loginAttempts.js';
import {
  createUser,
  findUserByEmailLower,
  findUserByAppleSub,
  findUserByFacebookUserId,
  findUserByGoogleSub,
  findUserByAnyEmailLower,
} from '../../identity/application/users.js';
import { authOtpEmail, accountCreatedSpyEmail, sendMail } from '../../messaging/application/email.js';
import { isLanguage, requestLanguage } from '../../../utils/language.js';
import { consumeAuthOtp, issueAuthOtp, waitAuthOtpVerifyDelay } from '../../identity/application/authOtp.js';
import { GDPR_CONSENT_VERSION } from '../../../config/gdpr.js';
import {
  consumeSocialAuthPending,
  peekSocialAuthPending,
} from '../../identity/application/socialAuthHandshake.js';
import { rejectUnavailableShopSignIn } from '../../identity/application/signInMethodGate.js';
import { notifyRateLimitedFromRequest } from '../../../platform/http/rateLimitSpy.js';

import {
  connectExistingAppleUser,
  connectExistingFacebookUser,
  connectExistingGoogleUser,
  issueUserSession,
  sendSpy,
} from './authSessionSupport.js';

export const authSocialLinkRouter = Router();

authSocialLinkRouter.post('/social/create', authRateLimiter, loginRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const socialPendingToken = boundedToken(body.socialPendingToken);
  const gdprAccepted = body.gdprConsent?.accepted === true;
  const rememberMe = isBoolean(body.rememberMe) ? body.rememberMe : false;

  if (!socialPendingToken || !gdprAccepted) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const peeked = await peekSocialAuthPending(pool, socialPendingToken);
  if (!peeked) {
    res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }
  if (await rejectUnavailableShopSignIn(res, peeked.provider)) return;

  if (!peeked.email) {
    res.status(400).json({
      success: false,
      error: { code: peeked.provider === 'apple' ? 'apple_email_required' : 'invalid_request' },
    });
    return;
  }

  const pending = await consumeSocialAuthPending(pool, socialPendingToken);
  if (!pending || !pending.email) {
    res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }

  const language = isLanguage(pending.language) ? pending.language : 'en';

  if (pending.provider === 'google') {
    const existingSub = await findUserByGoogleSub(pool, pending.providerSubject);
    if (existingSub) {
      const handled = await connectExistingGoogleUser(
        req,
        res,
        existingSub,
        pending.providerSubject,
        pending.email,
        rememberMe,
      );
      if (handled) return;
    }
    const existingEmail = await findUserByEmailLower(pool, pending.email);
    if (existingEmail) {
      const handled = await connectExistingGoogleUser(
        req,
        res,
        existingEmail,
        pending.providerSubject,
        pending.email,
        rememberMe,
      );
      if (handled) return;
    }
    const user = await createUser(pool, {
      email: pending.email,
      passwordHash: null,
      gdprConsentVersion: GDPR_CONSENT_VERSION,
      language,
      emailVerified: true,
      googleSub: pending.providerSubject,
      googleEmail: pending.email,
    });
    await sendSpy('account_created', async (to) => {
      await sendMail({ to, ...accountCreatedSpyEmail({ email: user.email, userId: user.id }) });
    });
    await issueUserSession(req, res, user, { rememberMe, created: true, status: 201 });
    return;
  }

  if (pending.provider === 'facebook') {
    const existingSub = await findUserByFacebookUserId(pool, pending.providerSubject);
    if (existingSub) {
      const handled = await connectExistingFacebookUser(
        req,
        res,
        existingSub,
        pending.providerSubject,
        pending.email,
        rememberMe,
      );
      if (handled) return;
    }
    const existingEmail = await findUserByEmailLower(pool, pending.email);
    if (existingEmail) {
      const handled = await connectExistingFacebookUser(
        req,
        res,
        existingEmail,
        pending.providerSubject,
        pending.email,
        rememberMe,
      );
      if (handled) return;
    }
    const user = await createUser(pool, {
      email: pending.email,
      passwordHash: null,
      gdprConsentVersion: GDPR_CONSENT_VERSION,
      language,
      emailVerified: true,
      facebookUserId: pending.providerSubject,
      facebookEmail: pending.email,
    });
    await sendSpy('account_created', async (to) => {
      await sendMail({ to, ...accountCreatedSpyEmail({ email: user.email, userId: user.id }) });
    });
    await issueUserSession(req, res, user, { rememberMe, created: true, status: 201 });
    return;
  }

  // apple
  const existingSub = await findUserByAppleSub(pool, pending.providerSubject);
  if (existingSub) {
    const handled = await connectExistingAppleUser(
      req,
      res,
      existingSub,
      pending.providerSubject,
      pending.email,
      rememberMe,
    );
    if (handled) return;
  }
  const existingEmail = await findUserByEmailLower(pool, pending.email);
  if (existingEmail) {
    const handled = await connectExistingAppleUser(
      req,
      res,
      existingEmail,
      pending.providerSubject,
      pending.email,
      rememberMe,
    );
    if (handled) return;
  }
  const user = await createUser(pool, {
    email: pending.email,
    passwordHash: null,
    gdprConsentVersion: GDPR_CONSENT_VERSION,
    language,
    emailVerified: true,
    appleSub: pending.providerSubject,
    appleEmail: pending.email,
  });
  await sendSpy('account_created', async (to) => {
    await sendMail({ to, ...accountCreatedSpyEmail({ email: user.email, userId: user.id }) });
  });
  await issueUserSession(req, res, user, { rememberMe, created: true, status: 201 });
});

/** Send OTP to prove ownership of an existing Shop email before linking. */
authSocialLinkRouter.post('/social/link/request-otp', authRateLimiter, loginRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const socialPendingToken = boundedToken(body.socialPendingToken);
  const email = boundedEmail(body.email);

  if (!socialPendingToken || !email) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const pending = await peekSocialAuthPending(pool, socialPendingToken);
  if (!pending) {
    res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }
  if (await rejectUnavailableShopSignIn(res, pending.provider)) return;

  if (pending.provider === 'google') {
    const bySub = await findUserByGoogleSub(pool, pending.providerSubject);
    if (bySub) {
      res.status(409).json({ success: false, error: { code: 'google_already_linked' } });
      return;
    }
  } else if (pending.provider === 'facebook') {
    const bySub = await findUserByFacebookUserId(pool, pending.providerSubject);
    if (bySub) {
      res.status(409).json({ success: false, error: { code: 'facebook_already_linked' } });
      return;
    }
  } else {
    const bySub = await findUserByAppleSub(pool, pending.providerSubject);
    if (bySub) {
      res.status(409).json({ success: false, error: { code: 'apple_already_linked' } });
      return;
    }
  }

  if (pending.email) {
    const emailOwner = await findUserByAnyEmailLower(pool, pending.email);
    const target = await findUserByEmailLower(pool, email);
    if (emailOwner && (!target || emailOwner.id !== target.id)) {
      res.status(409).json({ success: false, error: { code: 'email_already_used' } });
      return;
    }
  }

  const user = await findUserByEmailLower(pool, email);
  if (!user || user.status === 'deleted' || user.status === 'locked') {
    res.status(404).json({ success: false, error: { code: 'account_not_found' } });
    return;
  }

  // Target already linked to a *different* provider subject — refuse before OTP.
  if (pending.provider === 'google') {
    if (user.google_sub != null && user.google_sub !== pending.providerSubject) {
      res.status(409).json({ success: false, error: { code: 'google_already_linked' } });
      return;
    }
  } else if (pending.provider === 'facebook') {
    if (user.facebook_user_id != null && user.facebook_user_id !== pending.providerSubject) {
      res.status(409).json({ success: false, error: { code: 'facebook_already_linked' } });
      return;
    }
  } else if (user.apple_sub != null && user.apple_sub !== pending.providerSubject) {
    res.status(409).json({ success: false, error: { code: 'apple_already_linked' } });
    return;
  }

  const issued = await issueAuthOtp(pool, {
    email: user.email,
    purpose: 'social_link',
    userId: user.id,
  });
  if (!issued.ok) {
    notifyRateLimitedFromRequest(req, 'rate_limit_otp_email', {
      userId: user.id,
      userEmail: user.email,
      reason: 'cooldown',
    });
    res.status(429).json({ success: false, error: { code: 'resend_limit_exceeded' } });
    return;
  }
  await sendMail({ to: user.email, ...authOtpEmail(issued.otp, requestLanguage(req)) });
  res.json({ success: true });
});

/** Verify OTP and attach the pending social identity to that account. */
authSocialLinkRouter.post('/social/link/verify', authRateLimiter, loginRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const socialPendingToken = boundedToken(body.socialPendingToken);
  const email = boundedEmail(body.email);
  const code = boundedOtpCode(body.code);
  const rememberMe = isBoolean(body.rememberMe) ? body.rememberMe : false;

  if (!socialPendingToken || !email || !code) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const startedAt = Date.now();
  const reply = async (status: number, payload: object) => {
    await waitAuthOtpVerifyDelay(startedAt);
    res.status(status).json(payload);
  };

  const peeked = await peekSocialAuthPending(pool, socialPendingToken);
  if (!peeked) {
    await reply(400, { success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }
  if (await rejectUnavailableShopSignIn(res, peeked.provider)) return;

  const user = await findUserByEmailLower(pool, email);
  if (!user || user.status === 'deleted') {
    await reply(404, { success: false, error: { code: 'account_not_found' } });
    return;
  }
  if (user.status === 'locked') {
    await reply(403, { success: false, error: { code: 'account_security_locked' } });
    return;
  }
  const wasTemporarilyLocked = await isCurrentlyLocked(pool, user.id);

  // Target already linked to a different provider subject — refuse before
  // consuming OTP / pending (link*IfEmpty would otherwise no-op and still log in).
  if (peeked.provider === 'google') {
    if (user.google_sub != null && user.google_sub !== peeked.providerSubject) {
      await reply(409, { success: false, error: { code: 'google_already_linked' } });
      return;
    }
  } else if (peeked.provider === 'facebook') {
    if (user.facebook_user_id != null && user.facebook_user_id !== peeked.providerSubject) {
      await reply(409, { success: false, error: { code: 'facebook_already_linked' } });
      return;
    }
  } else if (user.apple_sub != null && user.apple_sub !== peeked.providerSubject) {
    await reply(409, { success: false, error: { code: 'apple_already_linked' } });
    return;
  }

  const consumedOtp = await consumeAuthOtp(pool, user.email, code, 'social_link', {
    userId: user.id,
  });
  if (!consumedOtp) {
    if (wasTemporarilyLocked) {
      await reply(423, { success: false, error: { code: 'account_locked' } });
      return;
    }
    await reply(400, { success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }

  const pending = await consumeSocialAuthPending(pool, socialPendingToken);
  if (!pending) {
    await reply(400, { success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }

  if (pending.provider === 'google') {
    const bySub = await findUserByGoogleSub(pool, pending.providerSubject);
    if (bySub && bySub.id !== user.id) {
      await reply(409, { success: false, error: { code: 'google_already_linked' } });
      return;
    }
    if (pending.email) {
      const emailOwner = await findUserByAnyEmailLower(pool, pending.email);
      if (emailOwner && emailOwner.id !== user.id) {
        await reply(409, { success: false, error: { code: 'email_already_used' } });
        return;
      }
    }
    const handled = await connectExistingGoogleUser(
      req,
      res,
      user,
      pending.providerSubject,
      pending.email ?? user.email,
      rememberMe,
    );
    if (!handled) {
      await reply(400, { success: false, error: { code: 'invalid_request' } });
    }
    return;
  }

  if (pending.provider === 'facebook') {
    const bySub = await findUserByFacebookUserId(pool, pending.providerSubject);
    if (bySub && bySub.id !== user.id) {
      await reply(409, { success: false, error: { code: 'facebook_already_linked' } });
      return;
    }
    if (pending.email) {
      const emailOwner = await findUserByAnyEmailLower(pool, pending.email);
      if (emailOwner && emailOwner.id !== user.id) {
        await reply(409, { success: false, error: { code: 'email_already_used' } });
        return;
      }
    }
    const handled = await connectExistingFacebookUser(
      req,
      res,
      user,
      pending.providerSubject,
      pending.email ?? user.email,
      rememberMe,
    );
    if (!handled) {
      await reply(400, { success: false, error: { code: 'invalid_request' } });
    }
    return;
  }

  const bySub = await findUserByAppleSub(pool, pending.providerSubject);
  if (bySub && bySub.id !== user.id) {
    await reply(409, { success: false, error: { code: 'apple_already_linked' } });
    return;
  }
  if (pending.email) {
    const emailOwner = await findUserByAnyEmailLower(pool, pending.email);
    if (emailOwner && emailOwner.id !== user.id) {
      await reply(409, { success: false, error: { code: 'email_already_used' } });
      return;
    }
  }
  const handled = await connectExistingAppleUser(
    req,
    res,
    user,
    pending.providerSubject,
    pending.email ?? undefined,
    rememberMe,
  );
  if (!handled) {
    await reply(400, { success: false, error: { code: 'invalid_request' } });
  }
});
