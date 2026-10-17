import { Router } from 'express';
import { updatePasswordHash } from '../../identity/application/userAuthGuards.js';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { authRateLimiter } from '../../../middleware/rateLimiters.js';
import { consumeUnlockToken } from '../../identity/application/accountUnlock.js';
import { issueAccountLockToken } from '../../identity/application/accountSecurityLock.js';
import { checkEmailChangeLimit, recordEmailChangeSend } from '../infrastructure/emailChangeSends.js';
import {
  issueEmailConfirmationToken,
  recordConfirmationSend,
} from '../../identity/application/emailConfirmation.js';
import {
  emailChangedSpyEmail,
  emailChangeSecurityNoticeEmail,
  emailConfirmationEmail,
  sendMail,
  spyTo,
} from '../../messaging/application/email.js';
import { hashPassword, validatePasswordComplexity } from '../../identity/application/password.js';
import { notifyRateLimitedFromRequest } from '../../../platform/http/rateLimitSpy.js';
import { revokeAllUserRefreshTokens } from '../../../platform/security/token.js';
import { findUserByEmailLower, findUserById, requestEmailChange } from '../../identity/application/users.js';
import { boundedEmail, boundedPassword, boundedToken } from '../../../utils/fieldLimits.js';
import { requestLanguage } from '../../../utils/language.js';

export const accountSecurityRouter = Router();

// authRateLimiter added here since this route previously had no rate
// limiter of any kind — unlike /auth/request-password-reset (which always
// had it), a burst of calls could otherwise spam both the new address
// (confirmation email) and the old one (security notice) with no generic
// per-IP cap at all. Same baseline as password reset; the step-up unlock
// token this route already requires is the stronger, user-specific layer
// on top.
accountSecurityRouter.post('/change-email', requireAuth, authRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const newEmail = boundedEmail(body.newEmail);
  const unlockToken = boundedToken(body.unlockToken);
  if (!newEmail || !unlockToken) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const user = await findUserById(pool, req.user!.id);
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (!(await consumeUnlockToken(pool, user.id, 'email', unlockToken))) {
    res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
    return;
  }

  const existing = await findUserByEmailLower(pool, newEmail);
  if (existing && existing.id !== user.id) {
    res.status(409).json({ success: false, error: { code: 'email_already_used' } });
    return;
  }

  // Authenticated route, no enumeration concern (the caller already proved
  // account ownership via the unlock token above) — unlike password reset,
  // an explicit 429 is fine here.
  const limited = await checkEmailChangeLimit(pool, user.id);
  if (limited) {
    notifyRateLimitedFromRequest(req, 'rate_limit_email_change', { reason: 'cooldown' });
    res.status(429).json({ success: false, error: { code: 'resend_limit_exceeded' } });
    return;
  }

  await requestEmailChange(pool, user.id, newEmail);
  const confirmation = await issueEmailConfirmationToken(
    pool,
    user.id,
    newEmail,
    config.emailChangeConfirmation.tokenTtlMs,
  );
  await recordConfirmationSend(pool, user.id, newEmail);
  await recordEmailChangeSend(pool, user.id);
  await sendMail({
    to: newEmail,
    ...emailConfirmationEmail(
      `${config.frontendBaseUrl}/account/confirm-email?token=${confirmation.rawToken}`,
      requestLanguage(req),
    ),
  });

  // "This wasn't me" notice to the CURRENT (old) address — separate from the
  // confirmation link above, which only ever goes to the new one. No
  // session needed to use the lock link (see accountSecurityLock.service.ts).
  const lockToken = await issueAccountLockToken(pool, user.id);
  await sendMail({
    to: user.email,
    ...emailChangeSecurityNoticeEmail(
      newEmail,
      `${config.frontendBaseUrl}/account/security-lock?token=${lockToken}`,
      requestLanguage(req),
    ),
  });

  const emailChangedSpyTo = await spyTo('email_changed');
  if (emailChangedSpyTo) {
    void sendMail({
      to: emailChangedSpyTo,
      ...emailChangedSpyEmail({ oldEmail: user.email, newEmail, userId: user.id }),
    }).catch((error) => {
      console.error('[account] email-change spy notification failed', error);
    });
  }

  res.json({ success: true, pendingEmail: newEmail });
});

accountSecurityRouter.post('/change-password', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const unlockToken = boundedToken(body.unlockToken);
  const newPassword = boundedPassword(body.newPassword);
  if (!unlockToken || !newPassword) {
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

  const user = await findUserById(pool, req.user!.id);
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (!(await consumeUnlockToken(pool, user.id, 'password', unlockToken))) {
    res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  await updatePasswordHash(pool, user.id, passwordHash);
  await revokeAllUserRefreshTokens(pool, user.id);
  res.json({ success: true });
});
