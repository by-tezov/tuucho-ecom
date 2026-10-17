import { Router } from 'express';
import { checkAccountPassword } from '../application/passwordLoginCheck.js';
import { updatePasswordHash } from '../../identity/application/userAuthGuards.js';
import { config } from '../../../config/env.js';
import { authRateLimiter, loginRateLimiter } from '../../../middleware/rateLimiters.js';
import { serializeRefreshTokenCookie } from '../../../utils/cookies.js';
import { isBoolean } from '../../../utils/validate.js';
import { boundedEmail, boundedPassword } from '../../../utils/fieldLimits.js';
import { pool } from '../../../db/pool.js';
import {
  hashPassword,
  rewriteLegacyPasswordHash,
  timingDummyPasswordHash,
  validatePasswordComplexity,
  verifyPassword,
} from '../../identity/application/password.js';
import {
  accessTokenExpiresAt,
  createRefreshToken,
  signAccessToken,
} from '../../../platform/security/token.js';
import { resetFailedLogin } from '../../identity/application/loginAttempts.js';
import {
  createUser,
  findUserByEmailLower,
  reactivateIfPendingDeletion,
  toPublicUser,
} from '../../identity/application/users.js';
import {
  issueEmailConfirmationToken,
  recordConfirmationSend,
} from '../../identity/application/emailConfirmation.js';
import {
  emailConfirmationEmail,
  accountCreatedSpyEmail,
  loginSpyEmail,
  sendMail,
} from '../../messaging/application/email.js';
import { summarizeUserAgent } from '../../../utils/userAgent.js';
import { GDPR_CONSENT_VERSION } from '../../../config/gdpr.js';

import { formOrRequestLanguage, requestMeta, sendSpy, spyLoginLocation } from './authSessionSupport.js';

export const authCredentialsRouter = Router();

authCredentialsRouter.post('/register', authRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const email = boundedEmail(body.email);
  const password = boundedPassword(body.password);
  const gdprAccepted = body.gdprConsent?.accepted === true;
  const language = formOrRequestLanguage(body.language, req);

  if (!email || !password || !gdprAccepted) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const violations = validatePasswordComplexity(password, config.passwordMinLength, config.passwordMaxLength);
  if (violations.length > 0) {
    res.status(400).json({ success: false, error: { code: 'weak_password', violations } });
    return;
  }

  // Hash before the existence check so "email taken" vs "new account" is
  // not a cheap timing oracle. `email_already_used` remains a deliberate
  // UX signal (shoppers need to know to log in) — mitigated by AUTH rate
  // limits; login/reset stay fully non-enumerating.
  const passwordHash = await hashPassword(password);
  const existing = await findUserByEmailLower(pool, email);
  if (existing) {
    res.status(409).json({ success: false, error: { code: 'email_already_used' } });
    return;
  }

  const user = await createUser(pool, {
    email,
    passwordHash,
    gdprConsentVersion: GDPR_CONSENT_VERSION,
    language,
  });

  await sendSpy('account_created', async (to) => {
    await sendMail({ to, ...accountCreatedSpyEmail({ email: user.email, userId: user.id }) });
  });

  const confirmation = await issueEmailConfirmationToken(pool, user.id, user.email);
  await recordConfirmationSend(pool, user.id, user.email);
  await sendMail({
    to: user.email,
    ...emailConfirmationEmail(
      `${config.frontendBaseUrl}/account/confirm-email?token=${confirmation.rawToken}`,
      language,
    ),
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refresh = await createRefreshToken(pool, user.id, false, requestMeta(req));
  res.setHeader(
    'Set-Cookie',
    serializeRefreshTokenCookie(refresh.raw, refresh.expiresAt, false, config.isDevelopment),
  );
  res.status(201).json({
    success: true,
    user: toPublicUser(user),
    accessToken,
    accessTokenExpiresAt: accessTokenExpiresAt(),
  });
});

/** OTP signup's "confirm my email later" escape hatch — creates the account
 * immediately, same as /register, instead of making the customer wait for
 * the code. Deliberately mirrors /register's behavior (unverified,
 * emailVerified left unset, a real confirmation email still goes out) rather
 * than /verify-otp's signup branch (which marks emailVerified true, since
 * that path did prove inbox control). An email that already has an account
 * must never be bypassed this way — same 409 as /register, no session. */
authCredentialsRouter.post('/register-otp-skip', authRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const email = boundedEmail(body.email);
  const gdprAccepted = body.gdprConsent?.accepted === true;
  const language = formOrRequestLanguage(body.language, req);

  if (!email || !gdprAccepted) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const existing = await findUserByEmailLower(pool, email);
  if (existing) {
    res.status(409).json({ success: false, error: { code: 'email_already_used' } });
    return;
  }

  const user = await createUser(pool, {
    email,
    passwordHash: null,
    gdprConsentVersion: GDPR_CONSENT_VERSION,
    language,
  });

  await sendSpy('account_created', async (to) => {
    await sendMail({ to, ...accountCreatedSpyEmail({ email: user.email, userId: user.id }) });
  });

  const confirmation = await issueEmailConfirmationToken(pool, user.id, user.email);
  await recordConfirmationSend(pool, user.id, user.email);
  await sendMail({
    to: user.email,
    ...emailConfirmationEmail(
      `${config.frontendBaseUrl}/account/confirm-email?token=${confirmation.rawToken}`,
      language,
    ),
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refresh = await createRefreshToken(pool, user.id, false, requestMeta(req));
  res.setHeader(
    'Set-Cookie',
    serializeRefreshTokenCookie(refresh.raw, refresh.expiresAt, false, config.isDevelopment),
  );
  res.status(201).json({
    success: true,
    created: true,
    user: toPublicUser(user),
    accessToken,
    accessTokenExpiresAt: accessTokenExpiresAt(),
  });
});

authCredentialsRouter.post('/login', loginRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const email = boundedEmail(body.email);
  const password = boundedPassword(body.password);
  const rememberMe = isBoolean(body.rememberMe) ? body.rememberMe : false;

  if (!email || !password) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const user = await findUserByEmailLower(pool, email);
  // Same generic failure for unknown user and wrong password (no enumeration).
  // Unknown emails still hash a dummy so timing matches a real miss.
  if (!user || user.status === 'deleted') {
    await verifyPassword(await timingDummyPasswordHash(), password);
    res.status(401).json({ success: false, error: { code: 'invalid_credentials' } });
    return;
  }

  // Operator lock from accountSecurityLock (indefinite; the temp lockout auto-expires).
  if (user.status === 'locked') {
    res.status(403).json({ success: false, error: { code: 'account_security_locked' } });
    return;
  }

  const refused = await checkAccountPassword(user, password);
  if (refused) {
    res.status(refused.status).json(refused.body);
    return;
  }
  await rewriteLegacyPasswordHash(user.password_hash!, password, (h) => updatePasswordHash(pool, user.id, h));
  await resetFailedLogin(pool, user.id);

  const reactivated =
    user.status === 'pending_deletion' ? await reactivateIfPendingDeletion(pool, user.id) : false;

  const meta = requestMeta(req);
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refresh = await createRefreshToken(pool, user.id, rememberMe, meta);
  res.setHeader(
    'Set-Cookie',
    serializeRefreshTokenCookie(refresh.raw, refresh.expiresAt, rememberMe, config.isDevelopment),
  );
  res.json({
    success: true,
    user: toPublicUser(reactivated ? { ...user, status: 'active', deletion_scheduled_for: null } : user),
    accessToken,
    accessTokenExpiresAt: accessTokenExpiresAt(),
    reactivated,
  });

  // Geo for the spy mail is resolved after the response (createRefreshToken
  // no longer awaits geo-IP on the login path).
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

/** Unified "connect or create" password flow (LoginForm / GuestCheckoutPrompt):
 * an email with no account creates one; otherwise logs in. GDPR consent is
 * mandatory on the **create** branch only — returning users who already
 * accepted CGU do not re-tick. Wrong password on an existing account still
 * returns `invalid_credentials` (same anti-enumeration as /login). */
authCredentialsRouter.post('/login-or-register', authRateLimiter, loginRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const email = boundedEmail(body.email);
  const password = boundedPassword(body.password);
  const gdprAccepted = body.gdprConsent?.accepted === true;
  const rememberMe = isBoolean(body.rememberMe) ? body.rememberMe : false;
  const language = formOrRequestLanguage(body.language, req);

  if (!email || !password) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const existing = await findUserByEmailLower(pool, email);

  if (!existing || existing.status === 'deleted') {
    if (!gdprAccepted) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }

    const violations = validatePasswordComplexity(
      password,
      config.passwordMinLength,
      config.passwordMaxLength,
    );
    if (violations.length > 0) {
      res.status(400).json({ success: false, error: { code: 'weak_password', violations } });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser(pool, {
      email,
      passwordHash,
      gdprConsentVersion: GDPR_CONSENT_VERSION,
      language,
    });

    await sendSpy('account_created', async (to) => {
      await sendMail({ to, ...accountCreatedSpyEmail({ email: user.email, userId: user.id }) });
    });

    const confirmation = await issueEmailConfirmationToken(pool, user.id, user.email);
    await recordConfirmationSend(pool, user.id, user.email);
    await sendMail({
      to: user.email,
      ...emailConfirmationEmail(
        `${config.frontendBaseUrl}/account/confirm-email?token=${confirmation.rawToken}`,
        language,
      ),
    });

    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    const refresh = await createRefreshToken(pool, user.id, rememberMe, requestMeta(req));
    res.setHeader(
      'Set-Cookie',
      serializeRefreshTokenCookie(refresh.raw, refresh.expiresAt, rememberMe, config.isDevelopment),
    );
    res.status(201).json({
      success: true,
      created: true,
      user: toPublicUser(user),
      accessToken,
      accessTokenExpiresAt: accessTokenExpiresAt(),
    });
    return;
  }

  if (existing.status === 'locked') {
    res.status(403).json({ success: false, error: { code: 'account_security_locked' } });
    return;
  }

  const refused = await checkAccountPassword(existing, password);
  if (refused) {
    res.status(refused.status).json(refused.body);
    return;
  }
  await rewriteLegacyPasswordHash(existing.password_hash!, password, (h) =>
    updatePasswordHash(pool, existing.id, h),
  );
  await resetFailedLogin(pool, existing.id);

  const reactivated =
    existing.status === 'pending_deletion' ? await reactivateIfPendingDeletion(pool, existing.id) : false;

  const meta = requestMeta(req);
  const accessToken = signAccessToken({ sub: existing.id, email: existing.email });
  const refresh = await createRefreshToken(pool, existing.id, rememberMe, meta);
  res.setHeader(
    'Set-Cookie',
    serializeRefreshTokenCookie(refresh.raw, refresh.expiresAt, rememberMe, config.isDevelopment),
  );
  res.json({
    success: true,
    created: false,
    user: toPublicUser(
      reactivated ? { ...existing, status: 'active', deletion_scheduled_for: null } : existing,
    ),
    accessToken,
    accessTokenExpiresAt: accessTokenExpiresAt(),
    reactivated,
  });

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
});
