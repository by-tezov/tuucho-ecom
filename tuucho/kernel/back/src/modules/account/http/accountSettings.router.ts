import { Router } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { authRateLimiter } from '../../../middleware/rateLimiters.js';
import {
  consumeUnlockToken,
  issueUnlockToken,
  type UnlockAction,
} from '../../identity/application/accountUnlock.js';
import { consumeAuthOtp, issueAuthOtp, waitAuthOtpVerifyDelay } from '../../identity/application/authOtp.js';
import { authOtpEmail, sendMail } from '../../messaging/application/email.js';
import {
  isCurrentlyLocked,
  recordFailedLogin,
  resetFailedLogin,
} from '../../identity/application/loginAttempts.js';
import {
  getNotificationPreferences,
  isNotificationChannel,
  setNotificationPreference,
} from '../../identity/application/notificationPreferences.js';
import { timingDummyPasswordHash, verifyPassword } from '../../identity/application/password.js';
import { notifyRateLimitedFromRequest } from '../../../platform/http/rateLimitSpy.js';
import { listRecentLogins } from '../../../platform/security/token.js';
import { findUserById, toPublicUser, updateProfile } from '../../identity/application/users.js';
import { getUserPreference, setUserPreference } from '../../identity/application/userPreferences.js';
import {
  boundedOtpCode,
  boundedPassword,
  boundedPrintable,
  boundedToken,
  phoneOrNull,
} from '../../../utils/fieldLimits.js';
import { summarizeUserAgent } from '../../../utils/userAgent.js';
import { requestLanguage } from '../../../utils/language.js';

export const accountSettingsRouter = Router();

accountSettingsRouter.get('/profile', requireAuth, async (req, res) => {
  const user = await findUserById(pool, req.user!.id);
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, user: toPublicUser(user) });
});

accountSettingsRouter.patch('/profile', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const firstName =
    'firstName' in body ? boundedPrintable(body.firstName, config.fieldLimits.firstNameMax) : undefined;
  const lastName =
    'lastName' in body ? boundedPrintable(body.lastName, config.fieldLimits.lastNameMax) : undefined;
  const phone = 'phone' in body ? phoneOrNull(body.phone) : undefined;
  if (
    ('firstName' in body && !firstName) ||
    ('lastName' in body && !lastName) ||
    ('phone' in body && phone === undefined)
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const existingUser = await findUserById(pool, req.user!.id);
  if (!existingUser) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }

  // Every account starts with these three empty (never set at registration
  // — see auth.routes.ts's /register) — filling them in for the first time
  // isn't overwriting anything sensitive, so it's exempt from the step-up
  // unlock required once any of them is actually set.
  const isEmptyProfile = !existingUser.first_name && !existingUser.last_name && !existingUser.phone;
  if (!isEmptyProfile) {
    const unlockToken = boundedToken(body.unlockToken);
    if (!unlockToken || !(await consumeUnlockToken(pool, existingUser.id, 'profile', unlockToken))) {
      res.status(401).json({ success: false, error: { code: 'unlock_invalid' } });
      return;
    }
  }

  const user = await updateProfile(pool, req.user!.id, {
    firstName,
    lastName,
    phone,
  });
  res.json({ success: true, user: toPublicUser(user) });
});

const UNLOCK_ACTIONS: UnlockAction[] = [
  'profile',
  'email',
  'password',
  'deletion',
  'google',
  'facebook',
  'apple',
  // Covers Google + Facebook + Apple at once — the account page's "Connexion
  // sociale" block has a single unlock button for all panes, so a single
  // OTP/password step must yield a single token every provider's routes
  // accept. Asking per provider instead would email multiple codes for one
  // prompt.
  'social',
];

accountSettingsRouter.post('/request-unlock-otp', requireAuth, authRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const action = UNLOCK_ACTIONS.includes(body.action) ? (body.action as UnlockAction) : undefined;
  if (!action) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const user = await findUserById(pool, req.user!.id);
  if (!user) {
    res.status(401).json({ success: false, error: { code: 'invalid_credentials' } });
    return;
  }
  if (user.password_hash) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const issued = await issueAuthOtp(pool, {
    email: user.email,
    purpose: 'unlock',
    userId: user.id,
    unlockAction: action,
  });
  if (!issued.ok) {
    notifyRateLimitedFromRequest(req, 'rate_limit_otp_email', { reason: 'cooldown' });
    res.status(429).json({ success: false, error: { code: 'resend_limit_exceeded' } });
    return;
  }
  await sendMail({ to: user.email, ...authOtpEmail(issued.otp, requestLanguage(req)) });
  res.json({ success: true });
});

/** Step-up re-authentication for the sensitive account-settings actions
 * below — a password re-entry (or an OTP when the account has no password)
 * is exchanged for a short-lived single-use token (see
 * accountUnlock.service.ts), so change-email/change-password no longer need
 * to ask for the password again in the same request. */
accountSettingsRouter.post('/unlock', requireAuth, authRateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const action = UNLOCK_ACTIONS.includes(body.action) ? (body.action as UnlockAction) : undefined;
  const currentPassword = boundedPassword(body.currentPassword);
  const code = boundedOtpCode(body.code);
  if (!action || (!currentPassword && !code) || (currentPassword && code)) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const user = await findUserById(pool, req.user!.id);
  if (!user) {
    res.status(401).json({ success: false, error: { code: 'invalid_credentials' } });
    return;
  }

  const wasTemporarilyLocked = await isCurrentlyLocked(pool, user.id);

  if (code) {
    if (user.password_hash) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const startedAt = Date.now();
    const consumed = await consumeAuthOtp(pool, user.email, code, 'unlock', {
      userId: user.id,
      unlockAction: action,
    });
    if (!consumed) {
      if (wasTemporarilyLocked) {
        await waitAuthOtpVerifyDelay(startedAt);
        res.status(423).json({ success: false, error: { code: 'account_locked' } });
        return;
      }
      await recordFailedLogin(pool, user.id);
      await waitAuthOtpVerifyDelay(startedAt);
      res.status(401).json({ success: false, error: { code: 'invalid_credentials' } });
      return;
    }
    await waitAuthOtpVerifyDelay(startedAt);
  } else {
    if (!user.password_hash) {
      await verifyPassword(await timingDummyPasswordHash(), currentPassword!);
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    if (!(await verifyPassword(user.password_hash, currentPassword!))) {
      if (wasTemporarilyLocked) {
        res.status(423).json({ success: false, error: { code: 'account_locked' } });
        return;
      }
      await recordFailedLogin(pool, user.id);
      res.status(401).json({ success: false, error: { code: 'invalid_credentials' } });
      return;
    }
  }
  await resetFailedLogin(pool, user.id);

  const { token, expiresAt } = await issueUnlockToken(pool, user.id, action);
  res.json({ success: true, unlockToken: token, action, expiresAt });
});

accountSettingsRouter.put('/preferences/language', requireAuth, async (req, res) => {
  const language = req.body?.language;
  if (typeof language !== 'string' || !['en', 'fr'].includes(language)) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  await setUserPreference(pool, req.user!.id, 'language', language);
  res.json({ success: true });
});

function registerEnumeratedPreferenceRoutes(preference: string, values: ReadonlySet<string>): void {
  accountSettingsRouter.get(`/preferences/${preference}`, requireAuth, async (req, res) => {
    const value = await getUserPreference(pool, req.user!.id, preference);
    res.json({
      success: true,
      [preference]: value !== null && values.has(value) ? value : null,
    });
  });

  accountSettingsRouter.put(`/preferences/${preference}`, requireAuth, async (req, res) => {
    const value = req.body?.[preference];
    if (typeof value !== 'string' || !values.has(value)) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    await setUserPreference(pool, req.user!.id, preference, value);
    res.json({ success: true, [preference]: value });
  });
}

registerEnumeratedPreferenceRoutes('theme', new Set(['light', 'dark', 'system']));
registerEnumeratedPreferenceRoutes('contrast', new Set(['system', 'standard', 'more']));

/** Shop onboarding slides — one-shot per account. Missing key = not completed.
 * Versioned key lets a later content rewrite re-prompt without a schema change. */
const ONBOARDING_PREFERENCE_KEY = 'onboarding.v1';

accountSettingsRouter.get('/preferences/onboarding', requireAuth, async (req, res) => {
  const value = await getUserPreference(pool, req.user!.id, ONBOARDING_PREFERENCE_KEY);
  res.json({ success: true, completed: value === 'true' });
});

accountSettingsRouter.put('/preferences/onboarding', requireAuth, async (req, res) => {
  if (req.body?.completed !== true) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  await setUserPreference(pool, req.user!.id, ONBOARDING_PREFERENCE_KEY, 'true');
  res.json({ success: true, completed: true });
});

accountSettingsRouter.get('/notification-preferences', requireAuth, async (req, res) => {
  const preferences = await getNotificationPreferences(pool, req.user!.id);
  if (!preferences) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, ...preferences });
});

accountSettingsRouter.put('/notification-preferences', requireAuth, async (req, res) => {
  const channel = typeof req.body?.channel === 'string' ? req.body.channel : '';
  const enabled = req.body?.enabled;
  if (!isNotificationChannel(channel) || typeof enabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const preferences = await setNotificationPreference(pool, req.user!.id, channel, enabled);
  if (!preferences) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, ...preferences });
});

/** Account page's "recent logins" block — see listRecentLogins's own doc
 * comment for why this only ever shows one entry per actual sign-in, never
 * routine token-refresh rotations. Empty array (not an error) when
 * RECENT_LOGINS_DISPLAY_COUNT is 0 — the frontend hides the block on an
 * empty list rather than needing to know the configured count itself. */
accountSettingsRouter.get('/recent-logins', requireAuth, async (req, res) => {
  const logins = await listRecentLogins(pool, req.user!.id, config.recentLoginsDisplayCount);
  res.json({
    success: true,
    logins: logins.map((login) => ({
      createdAt: login.createdAt,
      ip: login.ip,
      location: login.location,
      device: summarizeUserAgent(login.userAgent),
    })),
  });
});
