import { Router } from 'express';
import { cancelPasswordOnInboxProof, updatePasswordHash } from '../../identity/application/userAuthGuards.js';
import { config } from '../../../config/env.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { authRateLimiter } from '../../../middleware/rateLimiters.js';
import {
  clearRefreshTokenCookie,
  getRefreshTokenCookie,
  serializeRefreshTokenCookie,
} from '../../../utils/cookies.js';
import { boundedEmail, boundedOtpCode, boundedPassword, boundedToken } from '../../../utils/fieldLimits.js';
import { pool } from '../../../db/pool.js';
import { hashPassword, validatePasswordComplexity } from '../../identity/application/password.js';
import {
  accessTokenExpiresAt,
  createRefreshToken,
  revokeAllUserRefreshTokens,
  revokeRefreshToken,
  signAccessToken,
} from '../../../platform/security/token.js';
import {
  findUserByCurrentEmail,
  findUserByEmailLower,
  findUserById,
  insertUser,
  reactivateIfPendingDeletion,
  toPublicUser,
} from '../../identity/application/users.js';
import {
  checkResendLimit,
  confirmEmailOtp,
  confirmEmailOtpToken,
  confirmEmailToken,
  issueEmailConfirmationToken,
  recordConfirmationSend,
} from '../../identity/application/emailConfirmation.js';
import {
  checkPasswordResetLimit,
  consumePasswordResetToken,
  issuePasswordResetToken,
  recordPasswordResetSend,
} from '../application/passwordReset.js';
import {
  emailConfirmationEmail,
  passwordResetEmail,
  accountCreatedSpyEmail,
  sendMail,
} from '../../messaging/application/email.js';
import { consumeAccountLockToken } from '../../identity/application/accountSecurityLock.js';
import {
  consumeGuestOrderManageToken,
  markGuestOrderManageTokensUsed,
} from '../../orders/application/guestOrderManage.js';
import { attachUnlinkedGuestOrdersForEmail } from '../../orders/application/ordersFacade.js';
import { attachUnclaimedGuestSavedCheckout } from '../../customers/application/guestSavedCheckout.js';
import { getStripe } from '../../../platform/stripe/stripeClient.js';
import { notifyRateLimitedFromRequest } from '../../../platform/http/rateLimitSpy.js';

import { requestMeta, sendSpy } from './authSessionSupport.js';
import { recordSystemActivityBestEffort } from '../../activity/application/recordSystemActivity.js';
import { requestLanguage } from '../../../utils/language.js';

export const authRecoveryRouter = Router();

authRecoveryRouter.post('/request-password-reset', authRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const email = boundedEmail(body.email);
  if (!email) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  // Always the same response whether or not the address exists, or even
  // whether it exists but just hit its rate limit — no account-enumeration
  // oracle on this endpoint, so a limited request silently skips the send
  // rather than returning a distinguishable 429 like the other resend-limit
  // routes do. The response also goes out before any lookup or SMTP work:
  // awaiting the token insert and the send only for real accounts made the
  // response time itself an enumeration oracle.
  res.json({ success: true });
  try {
    const user = await findUserByEmailLower(pool, email);
    if (!user || user.status === 'deleted') return;
    const resetLimit = await checkPasswordResetLimit(pool, user.id);
    if (resetLimit) {
      notifyRateLimitedFromRequest(req, 'rate_limit_password_reset_email', {
        userId: user.id,
        userEmail: user.email,
        reason: resetLimit,
      });
      return;
    }
    const token = await issuePasswordResetToken(pool, user.id);
    await recordPasswordResetSend(pool, user.id);
    await sendMail({
      to: user.email,
      ...passwordResetEmail(
        `${config.frontendBaseUrl}/account/reset-password?token=${token}`,
        requestLanguage(req),
      ),
    });
  } catch (error) {
    console.error('[auth] password reset send failed', error);
  }
});

authRecoveryRouter.post('/confirm-password-reset', authRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const token = boundedToken(body.token);
  const newPassword = boundedPassword(body.newPassword);
  if (!token || !newPassword) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const violations = validatePasswordComplexity(
    newPassword,
    config.passwordMinLength,
    config.passwordMaxLength,
  );
  if (violations.length > 0) {
    res.status(400).json({ success: false, error: { code: 'weak_password', violations } });
    return;
  }

  const consumed = await consumePasswordResetToken(pool, token);
  if (!consumed) {
    res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  await updatePasswordHash(pool, consumed.userId, passwordHash);
  await revokeAllUserRefreshTokens(pool, consumed.userId);
  res.json({ success: true });
});

/** "This wasn't me" — the lock link sent to the OLD address on an
 * email-change request (see account.routes.ts's /change-email). No auth
 * required: the real owner may not even be able to log in as themselves
 * anymore if this wasn't them. See accountSecurityLock.service.ts's
 * consumeAccountLockToken for what actually happens (locks + revokes every
 * session) — only an operator can reverse it. */
authRecoveryRouter.post('/lock-account', authRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const token = boundedToken(body.token);
  if (!token) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const result = await consumeAccountLockToken(pool, token);
  if (!result) {
    res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }
  await recordSystemActivityBestEffort(pool, {
    category: 'accounts',
    action: 'accounts.lock_link',
    summary: 'Compte verrouille depuis un lien de securite recu par e-mail',
    actorLabel: 'lien de securite',
    targetType: 'user',
    targetId: result.userId,
  });
  res.json({ success: true });
});

authRecoveryRouter.post('/manage-guest-order', authRateLimiter, async (req, res) => {
  const token = boundedToken(req.body?.token);
  if (!token) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const client = await pool.connect();
  let created = false;
  let user: Awaited<ReturnType<typeof findUserByCurrentEmail>>;
  try {
    await client.query('begin');
    const consumed = await consumeGuestOrderManageToken(client, token);
    if (consumed.status === 'invalid') {
      await client.query('rollback');
      res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
      return;
    }

    user = await findUserByCurrentEmail(client, consumed.email);
    if (user?.status === 'locked') {
      await client.query('rollback');
      res.status(403).json({ success: false, error: { code: 'account_security_locked' } });
      return;
    }
    if (user?.status === 'deleted') {
      await client.query('rollback');
      res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
      return;
    }

    if (!user) {
      await client.query('savepoint create_guest_user');
      try {
        user = await insertUser(client, {
          email: consumed.email,
          passwordHash: null,
          gdprConsentVersion: consumed.gdprConsentVersion,
          language: consumed.language,
          emailVerified: true,
        });
        created = true;
      } catch (error) {
        if ((error as { code?: string }).code !== '23505') throw error;
        await client.query('rollback to savepoint create_guest_user');
        user = await findUserByCurrentEmail(client, consumed.email);
        if (!user || user.status === 'locked' || user.status === 'deleted') throw error;
      }
    }

    if (!created) user = await cancelPasswordOnInboxProof(client, user, 'email_verification');

    if (user.status === 'pending_deletion') {
      await reactivateIfPendingDeletion(client, user.id);
      user = { ...user, status: 'active', deletion_scheduled_for: null };
    }

    const attached = await attachUnlinkedGuestOrdersForEmail(
      client,
      user.id,
      consumed.email,
      consumed.orderId,
    );
    await markGuestOrderManageTokensUsed(client, attached);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  if (!user) return;

  await attachUnclaimedGuestSavedCheckout(pool, getStripe(), user.id, user.email);

  const presented = getRefreshTokenCookie(req);
  if (presented) await revokeRefreshToken(pool, presented);

  const meta = requestMeta(req);
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refresh = await createRefreshToken(pool, user.id, false, meta);
  // Expire any remember-me cookie first: a session cookie alone does not
  // reliably replace a persistent one, which would leave the previous
  // account signed in after this token's user is issued.
  res.setHeader('Set-Cookie', [
    clearRefreshTokenCookie(config.isDevelopment),
    serializeRefreshTokenCookie(refresh.raw, refresh.expiresAt, false, config.isDevelopment),
  ]);
  res.status(created ? 201 : 200).json({
    success: true,
    created,
    alreadyManaged: false,
    user: toPublicUser(user),
    accessToken,
    accessTokenExpiresAt: accessTokenExpiresAt(),
  });

  if (created) {
    await sendSpy('account_created', async (to) => {
      await sendMail({ to, ...accountCreatedSpyEmail({ email: user!.email, userId: user!.id }) });
    });
  }
});

authRecoveryRouter.post('/confirm-email', authRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const token = boundedToken(body.token);
  const otpToken = boundedToken(body.otpToken);
  const email = boundedEmail(body.email);
  const code = boundedOtpCode(body.code);

  let result;
  if (token) {
    result = await confirmEmailToken(pool, token);
  } else if (otpToken && code) {
    result = await confirmEmailOtpToken(pool, otpToken, code);
  } else if (email && code) {
    result = await confirmEmailOtp(pool, email, code);
  } else {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  if (result.status === 'invalid') {
    res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }
  res.json({
    success: true,
    emailChanged: result.status === 'emailChanged',
    alreadyVerified: result.status === 'alreadyVerified',
  });
});

authRecoveryRouter.post('/resend-email-confirmation', requireAuth, authRateLimiter, async (req, res) => {
  const userId = req.user!.id;
  const limited = await checkResendLimit(pool, userId);
  if (limited) {
    notifyRateLimitedFromRequest(req, 'rate_limit_email_confirmation', { reason: 'cooldown' });
    res.status(429).json({ success: false, error: { code: 'resend_limit_exceeded' } });
    return;
  }

  const user = await findUserById(pool, userId);
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }

  const targetEmail = user.pending_email ?? user.email;
  // A pending_email resend is re-sending an in-progress email CHANGE, so it
  // gets the same short TTL the original change-email request used —
  // otherwise a resend would silently hand out a 24h-valid link and
  // undermine the whole point of shortening it (see change-email in
  // account.routes.ts).
  const confirmation = await issueEmailConfirmationToken(
    pool,
    userId,
    targetEmail,
    user.pending_email ? config.emailChangeConfirmation.tokenTtlMs : undefined,
  );
  await recordConfirmationSend(pool, userId, targetEmail);
  await sendMail({
    to: targetEmail,
    ...emailConfirmationEmail(
      `${config.frontendBaseUrl}/account/confirm-email?token=${confirmation.rawToken}`,
      requestLanguage(req),
    ),
  });
  res.json({ success: true });
});

/** Public shop-wide third-party sign-in flags (pref ∧ provider credentials).
 * Email + password / OTP are never gated here. */
