import { Router } from 'express';
import { authRateLimiter, loginRateLimiter } from '../../../middleware/rateLimiters.js';
import { isBoolean } from '../../../utils/validate.js';
import { boundedGoogleIdToken, boundedToken } from '../../../utils/fieldLimits.js';
import { pool } from '../../../db/pool.js';
import { createUser, findUserByEmailLower, findUserByGoogleSub } from '../../identity/application/users.js';
import { accountCreatedSpyEmail, sendMail } from '../../messaging/application/email.js';
import { isLanguage, languageFromHeader } from '../../../utils/language.js';
import { GDPR_CONSENT_VERSION } from '../../../config/gdpr.js';
import {
  getShopSignInMethodsSnapshot,
  isShopSignInMethodEnabled,
  isShopSignInVerboseEnabled,
  warmAppPreferences,
} from '../../settings/application/appPreferences.js';
import { isGoogleSignInConfigured, verifyGoogleIdToken } from '../../identity/application/googleAuth.js';
import { consumeSignupToken, issueSignupToken } from '../../identity/application/socialProviders.js';
import { isFacebookSignInConfigured } from '../../identity/application/facebookAuth.js';
import { isAppleSignInConfigured } from '../../identity/application/appleAuth.js';
import { rejectUnavailableShopSignIn } from '../../identity/application/signInMethodGate.js';

import {
  connectExistingGoogleUser,
  issueUserSession,
  respondNeedsAccountChoice,
  sendSpy,
} from './authSessionSupport.js';

export const authGoogleRouter = Router();

authGoogleRouter.get('/sign-in-methods', authRateLimiter, async (_req, res) => {
  await warmAppPreferences();
  const signInPreferences = getShopSignInMethodsSnapshot();
  res.json({
    success: true,
    signInMethods: {
      google: isShopSignInMethodEnabled('google') && isGoogleSignInConfigured(),
      facebook: isShopSignInMethodEnabled('facebook') && isFacebookSignInConfigured(),
      apple: isShopSignInMethodEnabled('apple') && isAppleSignInConfigured(),
      googleVerbose: isShopSignInVerboseEnabled('google'),
      facebookVerbose: isShopSignInVerboseEnabled('facebook'),
      appleVerbose: isShopSignInVerboseEnabled('apple'),
      facebookMobileDirectOAuthEnabled: signInPreferences.facebookMobileDirectOAuthEnabled,
    },
  });
});

authGoogleRouter.post('/google', authRateLimiter, loginRateLimiter, async (req, res) => {
  if (await rejectUnavailableShopSignIn(res, 'google')) return;

  const body = req.body ?? {};
  const idToken = boundedGoogleIdToken(body.idToken);
  const gdprAccepted = body.gdprConsent?.accepted === true;
  const rememberMe = isBoolean(body.rememberMe) ? body.rememberMe : false;
  const language =
    typeof body.language === 'string' && isLanguage(body.language)
      ? body.language
      : languageFromHeader(req.header('accept-language'));

  if (!idToken) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  let profile;
  try {
    profile = await verifyGoogleIdToken(idToken);
  } catch {
    res.status(400).json({ success: false, error: { code: 'invalid_google_token' } });
    return;
  }

  const bySub = await findUserByGoogleSub(pool, profile.sub);
  if (bySub) {
    const handled = await connectExistingGoogleUser(req, res, bySub, profile.sub, profile.email, rememberMe);
    if (handled) return;
  }

  const byEmail = await findUserByEmailLower(pool, profile.email);
  if (byEmail) {
    const handled = await connectExistingGoogleUser(
      req,
      res,
      byEmail,
      profile.sub,
      profile.email,
      rememberMe,
    );
    if (handled) return;
  }

  if (isShopSignInVerboseEnabled('google')) {
    await respondNeedsAccountChoice(res, {
      provider: 'google',
      providerSubject: profile.sub,
      email: profile.email,
      language,
    });
    return;
  }

  if (!gdprAccepted) {
    const pending = await issueSignupToken(pool, 'google', {
      providerSubject: profile.sub,
      email: profile.email,
      language,
    });
    res.json({ success: true, needsConsent: true, googleSignupToken: pending.rawToken });
    return;
  }

  const user = await createUser(pool, {
    email: profile.email,
    passwordHash: null,
    gdprConsentVersion: GDPR_CONSENT_VERSION,
    language,
    emailVerified: true,
    googleSub: profile.sub,
    googleEmail: profile.email,
  });

  await sendSpy('account_created', async (to) => {
    await sendMail({ to, ...accountCreatedSpyEmail({ email: user.email, userId: user.id }) });
  });

  await issueUserSession(req, res, user, { rememberMe, created: true, status: 201 });
});

authGoogleRouter.post('/google/complete', authRateLimiter, loginRateLimiter, async (req, res) => {
  if (await rejectUnavailableShopSignIn(res, 'google')) return;

  const body = req.body ?? {};
  const signupToken = boundedToken(body.googleSignupToken);
  const gdprAccepted = body.gdprConsent?.accepted === true;
  const rememberMe = isBoolean(body.rememberMe) ? body.rememberMe : false;

  if (!signupToken || !gdprAccepted) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const pending = await consumeSignupToken(pool, 'google', signupToken);
  if (!pending) {
    res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }

  const language = isLanguage(pending.language) ? pending.language : 'en';

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
});
