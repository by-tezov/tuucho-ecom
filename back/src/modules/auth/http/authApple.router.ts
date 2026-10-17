import { Router } from 'express';
import { authRateLimiter, loginRateLimiter } from '../../../middleware/rateLimiters.js';
import { isBoolean } from '../../../utils/validate.js';
import { boundedAppleIdentityToken, boundedAppleNonce, boundedToken } from '../../../utils/fieldLimits.js';
import { pool } from '../../../db/pool.js';
import { createUser, findUserByEmailLower, findUserByAppleSub } from '../../identity/application/users.js';
import { accountCreatedSpyEmail, sendMail } from '../../messaging/application/email.js';
import { isLanguage, languageFromHeader } from '../../../utils/language.js';
import { GDPR_CONSENT_VERSION } from '../../../config/gdpr.js';
import { isShopSignInVerboseEnabled } from '../../settings/application/appPreferences.js';
import { isAppleSignInConfigured, verifyAppleIdentityToken } from '../../identity/application/appleAuth.js';
import { handleAppleS2sNotification } from '../application/appleNotifications.js';
import { consumeSignupToken, issueSignupToken } from '../../identity/application/socialProviders.js';
import { rejectUnavailableShopSignIn } from '../../identity/application/signInMethodGate.js';

import {
  connectExistingAppleUser,
  issueUserSession,
  respondNeedsAccountChoice,
  sendSpy,
} from './authSessionSupport.js';

export const authAppleRouter = Router();

authAppleRouter.post('/apple', authRateLimiter, loginRateLimiter, async (req, res) => {
  if (await rejectUnavailableShopSignIn(res, 'apple')) return;

  const body = req.body ?? {};
  const idToken = boundedAppleIdentityToken(body.idToken);
  const nonce = boundedAppleNonce(body.nonce);
  const gdprAccepted = body.gdprConsent?.accepted === true;
  const rememberMe = isBoolean(body.rememberMe) ? body.rememberMe : false;
  const language =
    typeof body.language === 'string' && isLanguage(body.language)
      ? body.language
      : languageFromHeader(req.header('accept-language'));

  if (!idToken || !nonce) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  let profile;
  try {
    profile = await verifyAppleIdentityToken(idToken, nonce);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_apple_token';
    if (code === 'apple_email_required') {
      res.status(400).json({ success: false, error: { code: 'apple_email_required' } });
      return;
    }
    res.status(400).json({ success: false, error: { code: 'invalid_apple_token' } });
    return;
  }

  const bySub = await findUserByAppleSub(pool, profile.sub);
  if (bySub) {
    const handled = await connectExistingAppleUser(req, res, bySub, profile.sub, profile.email, rememberMe);
    if (handled) return;
  }

  if (profile.email) {
    const byEmail = await findUserByEmailLower(pool, profile.email);
    if (byEmail) {
      const handled = await connectExistingAppleUser(
        req,
        res,
        byEmail,
        profile.sub,
        profile.email,
        rememberMe,
      );
      if (handled) return;
    }
  }

  if (isShopSignInVerboseEnabled('apple')) {
    await respondNeedsAccountChoice(res, {
      provider: 'apple',
      providerSubject: profile.sub,
      email: profile.email ?? null,
      language,
    });
    return;
  }

  // Signup needs an email; Apple may omit it on later authorizations.
  if (!profile.email) {
    res.status(400).json({ success: false, error: { code: 'apple_email_required' } });
    return;
  }

  if (!gdprAccepted) {
    const pending = await issueSignupToken(pool, 'apple', {
      providerSubject: profile.sub,
      email: profile.email,
      language,
    });
    res.json({ success: true, needsConsent: true, appleSignupToken: pending.rawToken });
    return;
  }

  const user = await createUser(pool, {
    email: profile.email,
    passwordHash: null,
    gdprConsentVersion: GDPR_CONSENT_VERSION,
    language,
    emailVerified: true,
    appleSub: profile.sub,
    appleEmail: profile.email,
  });

  await sendSpy('account_created', async (to) => {
    await sendMail({ to, ...accountCreatedSpyEmail({ email: user.email, userId: user.id }) });
  });

  await issueUserSession(req, res, user, { rememberMe, created: true, status: 201 });
});

authAppleRouter.post('/apple/complete', authRateLimiter, loginRateLimiter, async (req, res) => {
  if (await rejectUnavailableShopSignIn(res, 'apple')) return;

  const body = req.body ?? {};
  const signupToken = boundedToken(body.appleSignupToken);
  const gdprAccepted = body.gdprConsent?.accepted === true;
  const rememberMe = isBoolean(body.rememberMe) ? body.rememberMe : false;

  if (!signupToken || !gdprAccepted) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const pending = await consumeSignupToken(pool, 'apple', signupToken);
  if (!pending) {
    res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }

  const language = isLanguage(pending.language) ? pending.language : 'en';

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

/** Create after verbose social `needsAccountChoice` (GDPR required). */

/** Sign in with Apple server-to-server notifications. JSON body
 * `{ "payload": "<JWS>" }`. Valid JWT → always 200 (unlink on
 * consent-revoked / account-deleted). Register this absolute URL on the
 * primary App ID in Apple Developer (preprod / prod API hosts). */
authAppleRouter.post('/apple/notifications', authRateLimiter, async (req, res) => {
  if (!isAppleSignInConfigured()) {
    res.status(503).json({ success: false, error: { code: 'apple_sign_in_disabled' } });
    return;
  }
  const payload = typeof req.body?.payload === 'string' ? req.body.payload.trim() : '';
  if (!payload) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const ok = await handleAppleS2sNotification(payload);
    if (!ok) {
      res.status(400).json({ success: false, error: { code: 'invalid_apple_token' } });
      return;
    }
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[auth] apple s2s notification failed', error);
    res.status(500).json({ success: false, error: { code: 'unknown_error' } });
  }
});
