import { Router, urlencoded } from 'express';
import { authRateLimiter, loginRateLimiter } from '../../../middleware/rateLimiters.js';
import { isBoolean } from '../../../utils/validate.js';
import { boundedFacebookAccessToken, boundedToken } from '../../../utils/fieldLimits.js';
import { pool } from '../../../db/pool.js';
import {
  createUser,
  findUserByEmailLower,
  findUserByFacebookUserId,
} from '../../identity/application/users.js';
import { accountCreatedSpyEmail, sendMail } from '../../messaging/application/email.js';
import { isLanguage, languageFromHeader } from '../../../utils/language.js';
import { GDPR_CONSENT_VERSION } from '../../../config/gdpr.js';
import { isShopSignInVerboseEnabled } from '../../settings/application/appPreferences.js';
import {
  isFacebookSignInConfigured,
  verifyFacebookAccessToken,
} from '../../identity/application/facebookAuth.js';
import { consumeSignupToken, issueSignupToken } from '../../identity/application/socialProviders.js';
import {
  findFacebookDataDeletionByCode,
  handleFacebookDataDeletionRequest,
} from '../application/facebookDataDeletion.js';
import { rejectUnavailableShopSignIn } from '../../identity/application/signInMethodGate.js';

import {
  connectExistingFacebookUser,
  issueUserSession,
  respondNeedsAccountChoice,
  sendSpy,
} from './authSessionSupport.js';

export const authFacebookRouter = Router();

authFacebookRouter.post('/facebook', authRateLimiter, loginRateLimiter, async (req, res) => {
  if (await rejectUnavailableShopSignIn(res, 'facebook')) return;

  const body = req.body ?? {};
  const accessToken = boundedFacebookAccessToken(body.accessToken);
  const gdprAccepted = body.gdprConsent?.accepted === true;
  const rememberMe = isBoolean(body.rememberMe) ? body.rememberMe : false;
  const language =
    typeof body.language === 'string' && isLanguage(body.language)
      ? body.language
      : languageFromHeader(req.header('accept-language'));

  if (!accessToken) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  let profile;
  try {
    profile = await verifyFacebookAccessToken(accessToken);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_facebook_token';
    if (code === 'facebook_email_required') {
      res.status(400).json({ success: false, error: { code: 'facebook_email_required' } });
      return;
    }
    res.status(400).json({ success: false, error: { code: 'invalid_facebook_token' } });
    return;
  }

  const byId = await findUserByFacebookUserId(pool, profile.userId);
  if (byId) {
    const handled = await connectExistingFacebookUser(
      req,
      res,
      byId,
      profile.userId,
      profile.email,
      rememberMe,
    );
    if (handled) return;
  }

  const byEmail = await findUserByEmailLower(pool, profile.email);
  if (byEmail) {
    const handled = await connectExistingFacebookUser(
      req,
      res,
      byEmail,
      profile.userId,
      profile.email,
      rememberMe,
    );
    if (handled) return;
  }

  if (isShopSignInVerboseEnabled('facebook')) {
    await respondNeedsAccountChoice(res, {
      provider: 'facebook',
      providerSubject: profile.userId,
      email: profile.email,
      language,
    });
    return;
  }

  if (!gdprAccepted) {
    const pending = await issueSignupToken(pool, 'facebook', {
      providerSubject: profile.userId,
      email: profile.email,
      language,
    });
    res.json({ success: true, needsConsent: true, facebookSignupToken: pending.rawToken });
    return;
  }

  const user = await createUser(pool, {
    email: profile.email,
    passwordHash: null,
    gdprConsentVersion: GDPR_CONSENT_VERSION,
    language,
    emailVerified: true,
    facebookUserId: profile.userId,
    facebookEmail: profile.email,
  });

  await sendSpy('account_created', async (to) => {
    await sendMail({ to, ...accountCreatedSpyEmail({ email: user.email, userId: user.id }) });
  });

  await issueUserSession(req, res, user, { rememberMe, created: true, status: 201 });
});

authFacebookRouter.post('/facebook/complete', authRateLimiter, loginRateLimiter, async (req, res) => {
  if (await rejectUnavailableShopSignIn(res, 'facebook')) return;

  const body = req.body ?? {};
  const signupToken = boundedToken(body.facebookSignupToken);
  const gdprAccepted = body.gdprConsent?.accepted === true;
  const rememberMe = isBoolean(body.rememberMe) ? body.rememberMe : false;

  if (!signupToken || !gdprAccepted) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const pending = await consumeSignupToken(pool, 'facebook', signupToken);
  if (!pending) {
    res.status(400).json({ success: false, error: { code: 'invalid_or_expired_token' } });
    return;
  }

  const language = isLanguage(pending.language) ? pending.language : 'en';

  const existingId = await findUserByFacebookUserId(pool, pending.providerSubject);
  if (existingId) {
    const handled = await connectExistingFacebookUser(
      req,
      res,
      existingId,
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
});

/** Meta Data Deletion Request Callback — form body `signed_request`. Not
 * JSON. Returns Meta's required `{ url, confirmation_code }` shape (no
 * success envelope). */
authFacebookRouter.post(
  '/facebook/data-deletion',
  authRateLimiter,
  urlencoded({ extended: false }),
  async (req, res) => {
    if (!isFacebookSignInConfigured()) {
      res.status(503).json({ success: false, error: { code: 'facebook_sign_in_disabled' } });
      return;
    }
    const signedRequest = typeof req.body?.signed_request === 'string' ? req.body.signed_request.trim() : '';
    if (!signedRequest) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    try {
      const result = await handleFacebookDataDeletionRequest(signedRequest);
      if (!result) {
        res.status(400).json({ success: false, error: { code: 'invalid_facebook_token' } });
        return;
      }
      res.status(200).json(result);
    } catch (error) {
      console.error('[auth] facebook data-deletion failed', error);
      res.status(500).json({ success: false, error: { code: 'unknown_error' } });
    }
  },
);

/** Public status for the confirmation URL returned to Meta. */
authFacebookRouter.get('/facebook/data-deletion/:code', authRateLimiter, async (req, res) => {
  const code = typeof req.params.code === 'string' ? req.params.code : '';
  const row = await findFacebookDataDeletionByCode(pool, code);
  if (!row) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({
    success: true,
    confirmationCode: row.confirmation_code,
    status: row.status,
    deletionScheduledFor: row.deletion_scheduled_for
      ? new Date(row.deletion_scheduled_for).toISOString()
      : null,
    createdAt: new Date(row.created_at).toISOString(),
  });
});
