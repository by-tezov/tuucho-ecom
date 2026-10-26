import { type Request } from 'express';
import { cancelPasswordOnInboxProof } from '../../identity/application/userAuthGuards.js';
import { config } from '../../../config/env.js';
import { serializeRefreshTokenCookie } from '../../../utils/cookies.js';
import { pool } from '../../../db/pool.js';
import { isLanguage, languageFromHeader, type Language } from '../../../utils/language.js';
import {
  accessTokenExpiresAt,
  createRefreshToken,
  signAccessToken,
} from '../../../platform/security/token.js';
import { resetFailedLogin } from '../../identity/application/loginAttempts.js';
import {
  findUserById,
  linkAppleSubIfEmpty,
  linkFacebookUserIdIfEmpty,
  linkGoogleSubIfEmpty,
  reactivateIfPendingDeletion,
  toPublicUser,
  type UserRow,
} from '../../identity/application/users.js';
import { loginSpyEmail, sendMail, spyTo } from '../../messaging/application/email.js';
import { resolveLoginLocation } from '../../../platform/network/geoLocation.js';
import { summarizeUserAgent } from '../../../utils/userAgent.js';
import { recordSuperAdminSignIn } from '../application/recordSuperAdminSignIn.js';
import {
  issueSocialAuthPending,
  type SocialAuthProvider,
} from '../../identity/application/socialAuthHandshake.js';

/** Every new-account/login spy send below is fire-and-forget and swallows
 * its own errors, same discipline as every other spy notification in this
 * codebase (see account.routes.ts's notifyCartAbandoned/notifyPaymentFailed)
 * — a notification failure must never affect the actual auth flow. build
 * receives the resolved recipient — `tuucho-mail-spy` decides who; empty skips. */
export async function sendSpy(kind: string, build: (to: string) => Promise<void>): Promise<void> {
  const to = await spyTo(kind);
  if (!to) return;
  // Genuinely detached, which the comment above always claimed but the code
  // did not do: `await build(to)` held every caller — and every one of the 16
  // awaits login and account_created — open for a full SMTP handshake and
  // send before the session response went out. On shared hosting that is
  // several hundred milliseconds to a few seconds added to sign-in and
  // sign-up, spent notifying the shop owner, on a result no caller reads and
  // whose failure was already swallowed here. Errors still land in the log;
  // the callers' `await` now resolves immediately.
  void build(to).catch((error) => {
    console.error('[auth] spy notification failed', error);
  });
}

export function requestMeta(req: Request): { ip: string | undefined; userAgent: string | undefined } {
  return { ip: req.ip, userAgent: req.header('user-agent') };
}

/** Geo for spy mail only. createRefreshToken updates login_location async. */
export async function spyLoginLocation(ip: string | undefined): Promise<string | null> {
  return resolveLoginLocation(ip);
}

export async function issueUserSession(
  req: Request,
  res: import('express').Response,
  user: UserRow,
  options: { rememberMe: boolean; created?: boolean; status?: number },
): Promise<{ reactivated: boolean }> {
  const reactivated =
    user.status === 'pending_deletion' ? await reactivateIfPendingDeletion(pool, user.id) : false;
  const sessionUser = reactivated
    ? { ...user, status: 'active' as const, deletion_scheduled_for: null }
    : user;
  const meta = requestMeta(req);
  const accessToken = signAccessToken({ sub: sessionUser.id, email: sessionUser.email });
  const refresh = await createRefreshToken(pool, sessionUser.id, options.rememberMe, meta);
  res.setHeader(
    'Set-Cookie',
    serializeRefreshTokenCookie(refresh.raw, refresh.expiresAt, options.rememberMe, config.isDevelopment),
  );
  res.status(options.status ?? (options.created ? 201 : 200)).json({
    success: true,
    ...(options.created ? { created: true } : {}),
    user: toPublicUser(sessionUser),
    accessToken,
    accessTokenExpiresAt: accessTokenExpiresAt(),
    ...(reactivated ? { reactivated: true } : {}),
  });
  recordSuperAdminSignIn(pool, sessionUser, meta);
  return { reactivated };
}

export async function connectExistingGoogleUser(
  req: Request,
  res: import('express').Response,
  user: UserRow,
  googleSub: string,
  googleEmail: string,
  rememberMe: boolean,
): Promise<boolean> {
  if (user.status === 'deleted') return false;
  if (user.status === 'locked') {
    res.status(403).json({ success: false, error: { code: 'account_security_locked' } });
    return true;
  }
  if (user.google_sub != null && user.google_sub !== googleSub) {
    res.status(409).json({ success: false, error: { code: 'google_already_linked' } });
    return true;
  }
  await resetFailedLogin(pool, user.id);
  // First link from the sign-in screen: the password may have been set by
  // someone who never owned this inbox, so it is cancelled (see
  // cancelPasswordOnInboxProof). Linking from the signed-in profile goes
  // through the account identity routes instead and keeps the password.
  if (user.google_sub == null) await cancelPasswordOnInboxProof(pool, user, 'social_link');
  await linkGoogleSubIfEmpty(pool, user.id, googleSub, googleEmail);
  const refreshed = await findUserById(pool, user.id);
  if (!refreshed) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return true;
  }
  const meta = requestMeta(req);
  await issueUserSession(req, res, refreshed, { rememberMe });
  await sendSpy('login', async (to) => {
    await sendMail({
      to,
      ...loginSpyEmail({
        email: refreshed.email,
        userId: refreshed.id,
        ip: meta.ip ?? null,
        location: await spyLoginLocation(meta.ip),
        device: summarizeUserAgent(meta.userAgent ?? null),
      }),
    });
  });
  return true;
}

export async function connectExistingFacebookUser(
  req: Request,
  res: import('express').Response,
  user: UserRow,
  facebookUserId: string,
  facebookEmail: string,
  rememberMe: boolean,
): Promise<boolean> {
  if (user.status === 'deleted') return false;
  if (user.status === 'locked') {
    res.status(403).json({ success: false, error: { code: 'account_security_locked' } });
    return true;
  }
  if (user.facebook_user_id != null && user.facebook_user_id !== facebookUserId) {
    res.status(409).json({ success: false, error: { code: 'facebook_already_linked' } });
    return true;
  }
  await resetFailedLogin(pool, user.id);
  // First link from the sign-in screen: the password may have been set by
  // someone who never owned this inbox, so it is cancelled (see
  // cancelPasswordOnInboxProof). Linking from the signed-in profile goes
  // through the account identity routes instead and keeps the password.
  if (user.facebook_user_id == null) await cancelPasswordOnInboxProof(pool, user, 'social_link');
  await linkFacebookUserIdIfEmpty(pool, user.id, facebookUserId, facebookEmail);
  const refreshed = await findUserById(pool, user.id);
  if (!refreshed) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return true;
  }
  const meta = requestMeta(req);
  await issueUserSession(req, res, refreshed, { rememberMe });
  await sendSpy('login', async (to) => {
    await sendMail({
      to,
      ...loginSpyEmail({
        email: refreshed.email,
        userId: refreshed.id,
        ip: meta.ip ?? null,
        location: await spyLoginLocation(meta.ip),
        device: summarizeUserAgent(meta.userAgent ?? null),
      }),
    });
  });
  return true;
}

export async function connectExistingAppleUser(
  req: Request,
  res: import('express').Response,
  user: UserRow,
  appleSub: string,
  appleEmail: string | undefined,
  rememberMe: boolean,
): Promise<boolean> {
  if (user.status === 'deleted') return false;
  if (user.status === 'locked') {
    res.status(403).json({ success: false, error: { code: 'account_security_locked' } });
    return true;
  }
  if (user.apple_sub != null && user.apple_sub !== appleSub) {
    res.status(409).json({ success: false, error: { code: 'apple_already_linked' } });
    return true;
  }
  await resetFailedLogin(pool, user.id);
  // First link from the sign-in screen: the password may have been set by
  // someone who never owned this inbox, so it is cancelled (see
  // cancelPasswordOnInboxProof). Linking from the signed-in profile goes
  // through the account identity routes instead and keeps the password.
  if (user.apple_sub == null) await cancelPasswordOnInboxProof(pool, user, 'social_link');
  await linkAppleSubIfEmpty(pool, user.id, appleSub, appleEmail);
  const refreshed = await findUserById(pool, user.id);
  if (!refreshed) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return true;
  }
  const meta = requestMeta(req);
  await issueUserSession(req, res, refreshed, { rememberMe });
  await sendSpy('login', async (to) => {
    await sendMail({
      to,
      ...loginSpyEmail({
        email: refreshed.email,
        userId: refreshed.id,
        ip: meta.ip ?? null,
        location: await spyLoginLocation(meta.ip),
        device: summarizeUserAgent(meta.userAgent ?? null),
      }),
    });
  });
  return true;
}

export async function respondNeedsAccountChoice(
  res: import('express').Response,
  input: {
    provider: SocialAuthProvider;
    providerSubject: string;
    email: string | null;
    language: Language;
  },
): Promise<void> {
  const pending = await issueSocialAuthPending(pool, input);
  res.json({
    success: true,
    needsAccountChoice: true,
    socialPendingToken: pending.rawToken,
    provider: input.provider,
    socialEmail: input.email,
  });
}

/** The language a sign-up form sent, else the request's own. */
export function formOrRequestLanguage(value: unknown, req: Request): Language {
  return typeof value === 'string' && isLanguage(value)
    ? value
    : languageFromHeader(req.header('accept-language'));
}
