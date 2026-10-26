import { Router } from 'express';
import { cancelPasswordOnInboxProof } from '../../identity/application/userAuthGuards.js';
import { config } from '../../../config/env.js';
import { authRateLimiter, loginRateLimiter } from '../../../middleware/rateLimiters.js';
import { serializeRefreshTokenCookie } from '../../../utils/cookies.js';
import { isBoolean } from '../../../utils/validate.js';
import { boundedEmail, boundedOtpCode } from '../../../utils/fieldLimits.js';
import { pool } from '../../../db/pool.js';
import {
  accessTokenExpiresAt,
  createRefreshToken,
  signAccessToken,
} from '../../../platform/security/token.js';
import {
  isCurrentlyLocked,
  recordFailedLogin,
  resetFailedLogin,
} from '../../identity/application/loginAttempts.js';
import {
  createUser,
  findUserByEmailLower,
  reactivateIfPendingDeletion,
  toPublicUser,
} from '../../identity/application/users.js';
import {
  authOtpEmail,
  accountCreatedSpyEmail,
  loginSpyEmail,
  sendMail,
} from '../../messaging/application/email.js';
import { summarizeUserAgent } from '../../../utils/userAgent.js';
import { isLanguage, languageFromHeader, requestLanguage } from '../../../utils/language.js';
import {
  consumeAuthOtp,
  issueAuthOtp,
  waitAuthOtpVerifyDelay,
  type AuthOtpPurpose,
} from '../../identity/application/authOtp.js';
import { GDPR_CONSENT_VERSION } from '../../../config/gdpr.js';
import { notifyRateLimitedFromRequest } from '../../../platform/http/rateLimitSpy.js';

import { recordSuperAdminSignIn } from '../application/recordSuperAdminSignIn.js';
import { requestMeta, sendSpy, spyLoginLocation } from './authSessionSupport.js';

export const authOtpRouter = Router();

function parseAuthOtpPurpose(value: unknown): AuthOtpPurpose | undefined {
  return value === 'signup' || value === 'login' ? value : undefined;
}

authOtpRouter.post('/request-otp', authRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const email = boundedEmail(body.email);
  const purpose = parseAuthOtpPurpose(body.purpose);
  const gdprAccepted = body.gdprConsent?.accepted === true;
  const language =
    typeof body.language === 'string' && isLanguage(body.language)
      ? body.language
      : languageFromHeader(req.header('accept-language'));

  if (!email || !purpose) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  if (purpose === 'signup') {
    // Same split as /login-or-register: GDPR is only for creating an
    // account. A taken address gets a login OTP without re-consenting —
    // the connect form's first request-otp (no tick) must not open CGU.
    const existing = await findUserByEmailLower(pool, email);
    if (existing) {
      if (existing.status !== 'deleted' && existing.status !== 'locked') {
        const issued = await issueAuthOtp(pool, {
          email: existing.email,
          purpose: 'login',
          userId: existing.id,
        });
        if (!issued.ok) {
          notifyRateLimitedFromRequest(req, 'rate_limit_otp_email', {
            userId: existing.id,
            userEmail: existing.email,
            reason: 'cooldown',
          });
        } else {
          await sendMail({ to: existing.email, ...authOtpEmail(issued.otp, requestLanguage(req)) });
        }
      }
      res.json({ success: true });
      return;
    }
    if (!gdprAccepted) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const issued = await issueAuthOtp(pool, {
      email,
      purpose: 'signup',
      gdprConsentVersion: GDPR_CONSENT_VERSION,
      language,
    });
    if (!issued.ok) {
      notifyRateLimitedFromRequest(req, 'rate_limit_otp_email', { reason: 'cooldown' });
      res.status(429).json({
        success: false,
        error: { code: 'resend_limit_exceeded' },
      });
      return;
    }
    await sendMail({ to: email, ...authOtpEmail(issued.otp, requestLanguage(req)) });
    res.json({ success: true });
    return;
  }

  const user = await findUserByEmailLower(pool, email);
  if (user && user.status !== 'deleted' && user.status !== 'locked') {
    const issued = await issueAuthOtp(pool, { email: user.email, purpose: 'login', userId: user.id });
    if (!issued.ok) {
      notifyRateLimitedFromRequest(req, 'rate_limit_otp_email', {
        userId: user.id,
        userEmail: user.email,
        reason: 'cooldown',
      });
    } else {
      await sendMail({ to: user.email, ...authOtpEmail(issued.otp, requestLanguage(req)) });
    }
  }
  res.json({ success: true });
});

authOtpRouter.post('/verify-otp', authRateLimiter, loginRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const email = boundedEmail(body.email);
  const code = boundedOtpCode(body.code);
  const purpose = parseAuthOtpPurpose(body.purpose);
  const rememberMe = isBoolean(body.rememberMe) ? body.rememberMe : false;

  if (!email || !code || !purpose) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const startedAt = Date.now();
  const reply = async (status: number, payload: object) => {
    await waitAuthOtpVerifyDelay(startedAt);
    res.status(status).json(payload);
  };

  if (purpose === 'signup') {
    const consumed = await consumeAuthOtp(pool, email, code, 'signup');
    if (consumed?.gdpr_consent_version) {
      const existing = await findUserByEmailLower(pool, email);
      // Race / taken address: never `email_already_used` — connect instead.
      if (existing && existing.status !== 'deleted') {
        if (existing.status === 'locked') {
          await reply(403, { success: false, error: { code: 'account_security_locked' } });
          return;
        }
        await resetFailedLogin(pool, existing.id);
        const secured = await cancelPasswordOnInboxProof(pool, existing, 'email_verification');
        const reactivated =
          existing.status === 'pending_deletion'
            ? await reactivateIfPendingDeletion(pool, existing.id)
            : false;
        const meta = requestMeta(req);
        const accessToken = signAccessToken({ sub: existing.id, email: existing.email });
        const refresh = await createRefreshToken(pool, existing.id, false, meta);
        res.setHeader(
          'Set-Cookie',
          serializeRefreshTokenCookie(refresh.raw, refresh.expiresAt, false, config.isDevelopment),
        );
        await reply(200, {
          success: true,
          user: toPublicUser(
            reactivated ? { ...secured, status: 'active', deletion_scheduled_for: null } : secured,
          ),
          accessToken,
          accessTokenExpiresAt: accessTokenExpiresAt(),
          reactivated,
        });
        recordSuperAdminSignIn(pool, existing, meta);
        await sendSpy('login', async (to) => {
          await sendMail({
            to,
            ...loginSpyEmail({
              email: existing.email,
              userId: existing.id,
              ip: meta.ip ?? null,
              location: await spyLoginLocation(meta.ip),
              device: summarizeUserAgent(meta.userAgent ?? null),
            }),
          });
        });
        return;
      }

      const language = consumed.language && isLanguage(consumed.language) ? consumed.language : 'en';
      const user = await createUser(pool, {
        email,
        passwordHash: null,
        gdprConsentVersion: consumed.gdpr_consent_version,
        language,
        emailVerified: true,
      });

      await sendSpy('account_created', async (to) => {
        await sendMail({ to, ...accountCreatedSpyEmail({ email: user.email, userId: user.id }) });
      });

      const accessToken = signAccessToken({ sub: user.id, email: user.email });
      const refresh = await createRefreshToken(pool, user.id, false, requestMeta(req));
      res.setHeader(
        'Set-Cookie',
        serializeRefreshTokenCookie(refresh.raw, refresh.expiresAt, false, config.isDevelopment),
      );
      await reply(201, {
        success: true,
        created: true,
        user: toPublicUser(user),
        accessToken,
        accessTokenExpiresAt: accessTokenExpiresAt(),
      });
      return;
    }

    // No pending signup OTP — existing shoppers who used the signup form
    // received a login OTP. Verify it here so a wrong code stays
    // `invalid_or_expired_token` (same as a failed new-signup OTP), not
    // `invalid_credentials`.
    const existingForLogin = await findUserByEmailLower(pool, email);
    if (existingForLogin && existingForLogin.status === 'locked') {
      await reply(403, { success: false, error: { code: 'account_security_locked' } });
      return;
    }
    const existingWasTemporarilyLocked =
      existingForLogin && existingForLogin.status !== 'deleted'
        ? await isCurrentlyLocked(pool, existingForLogin.id)
        : false;
    const loginConsumed = await consumeAuthOtp(
      pool,
      email,
      code,
      'login',
      existingForLogin ? { userId: existingForLogin.id } : undefined,
    );
    if (existingForLogin && existingForLogin.status !== 'deleted' && loginConsumed) {
      await resetFailedLogin(pool, existingForLogin.id);
      const secured = await cancelPasswordOnInboxProof(pool, existingForLogin, 'email_verification');
      const reactivated =
        existingForLogin.status === 'pending_deletion'
          ? await reactivateIfPendingDeletion(pool, existingForLogin.id)
          : false;
      const meta = requestMeta(req);
      const accessToken = signAccessToken({
        sub: existingForLogin.id,
        email: existingForLogin.email,
      });
      const refresh = await createRefreshToken(pool, existingForLogin.id, rememberMe, meta);
      res.setHeader(
        'Set-Cookie',
        serializeRefreshTokenCookie(refresh.raw, refresh.expiresAt, rememberMe, config.isDevelopment),
      );
      await reply(200, {
        success: true,
        user: toPublicUser(
          reactivated ? { ...secured, status: 'active', deletion_scheduled_for: null } : secured,
        ),
        accessToken,
        accessTokenExpiresAt: accessTokenExpiresAt(),
        reactivated,
      });
      recordSuperAdminSignIn(pool, existingForLogin, meta);
      await sendSpy('login', async (to) => {
        await sendMail({
          to,
          ...loginSpyEmail({
            email: existingForLogin.email,
            userId: existingForLogin.id,
            ip: meta.ip ?? null,
            location: await spyLoginLocation(meta.ip),
            device: summarizeUserAgent(meta.userAgent ?? null),
          }),
        });
      });
      return;
    }
    // A wrong code during the lockout window answers like an unknown address
    // (a 423 would confirm the account exists); it just stops counting.
    if (existingForLogin && existingForLogin.status !== 'deleted' && !existingWasTemporarilyLocked) {
      await recordFailedLogin(pool, existingForLogin.id);
    }
    await reply(400, { success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }

  const user = await findUserByEmailLower(pool, email);
  if (user && user.status === 'locked') {
    await reply(403, { success: false, error: { code: 'account_security_locked' } });
    return;
  }
  const wasTemporarilyLocked =
    user && user.status !== 'deleted' ? await isCurrentlyLocked(pool, user.id) : false;

  const consumed = await consumeAuthOtp(pool, email, code, 'login', user ? { userId: user.id } : undefined);
  if (!user || user.status === 'deleted' || !consumed) {
    // Same answer as an unknown address during the lockout window (no 423
    // existence oracle).
    if (user && user.status !== 'deleted' && !wasTemporarilyLocked) {
      await recordFailedLogin(pool, user.id);
    }
    await reply(401, { success: false, error: { code: 'invalid_credentials' } });
    return;
  }

  await resetFailedLogin(pool, user.id);
  const secured = await cancelPasswordOnInboxProof(pool, user, 'email_verification');

  const reactivated =
    user.status === 'pending_deletion' ? await reactivateIfPendingDeletion(pool, user.id) : false;

  const meta = requestMeta(req);
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refresh = await createRefreshToken(pool, user.id, rememberMe, meta);
  res.setHeader(
    'Set-Cookie',
    serializeRefreshTokenCookie(refresh.raw, refresh.expiresAt, rememberMe, config.isDevelopment),
  );
  await reply(200, {
    success: true,
    user: toPublicUser(
      reactivated ? { ...secured, status: 'active', deletion_scheduled_for: null } : secured,
    ),
    accessToken,
    accessTokenExpiresAt: accessTokenExpiresAt(),
    reactivated,
  });
  recordSuperAdminSignIn(pool, user, meta);
  await sendSpy('login', async (to) => {
    await sendMail({
      to,
      ...loginSpyEmail({
        email: user.email,
        userId: user.id,
        ip: meta.ip ?? null,
        location: await spyLoginLocation(meta.ip),
        device: summarizeUserAgent(meta.userAgent ?? null),
      }),
    });
  });
});
