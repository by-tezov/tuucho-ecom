import { Router } from 'express';
import { config } from '../../../config/env.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requireSameOriginForCookieSession } from '../../../middleware/csrfOrigin.js';
import { authRefreshRateLimiter } from '../../../middleware/rateLimiters.js';
import {
  clearRefreshTokenCookie,
  getRefreshTokenCookie,
  serializeRefreshTokenCookie,
} from '../../../utils/cookies.js';
import { pool } from '../../../db/pool.js';
import {
  accessTokenExpiresAt,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../../../platform/security/token.js';
import { findUserById, toPublicUser } from '../../identity/application/users.js';

import { requestMeta } from './authSessionSupport.js';
import { recordSuperAdminSignIn } from '../application/recordSuperAdminSignIn.js';
import { isIdleResume } from '../domain/superAdminSignInAlert.js';

export const authSessionRouter = Router();

authSessionRouter.post(
  '/refresh',
  requireSameOriginForCookieSession,
  authRefreshRateLimiter,
  async (req, res) => {
    const presented = getRefreshTokenCookie(req);
    if (!presented) {
      res.status(401).json({ success: false, error: { code: 'no_session' } });
      return;
    }

    const meta = requestMeta(req);
    const result = await rotateRefreshToken(pool, presented, meta);
    if (result.status !== 'ok') {
      res.setHeader('Set-Cookie', clearRefreshTokenCookie(config.isDevelopment));
      res.status(401).json({
        success: false,
        error: { code: result.status === 'reused' ? 'session_reused' : 'invalid_session' },
      });
      return;
    }

    const user = await findUserById(pool, result.userId);
    if (!user || user.status === 'locked' || user.status === 'deleted') {
      res.setHeader('Set-Cookie', clearRefreshTokenCookie(config.isDevelopment));
      res.status(401).json({ success: false, error: { code: 'invalid_session' } });
      return;
    }

    // An open tab refreshing on schedule is not a sign-in; resuming a session
    // left idle (the site reopened later) is, for the super-admin alert.
    if (isIdleResume(result.previousIssuedAt, Date.now(), config.superAdminSignInAlert.idleMs)) {
      recordSuperAdminSignIn(pool, user, meta, 'resume');
    }
    const accessToken = signAccessToken({ sub: result.userId, email: user.email });
    res.setHeader(
      'Set-Cookie',
      serializeRefreshTokenCookie(result.raw, result.expiresAt, result.rememberMe, config.isDevelopment),
    );
    // Include user (already loaded above) so the front can restore the session
    // in one round-trip instead of refresh → GET /account/profile.
    res.json({
      success: true,
      user: toPublicUser(user),
      accessToken,
      accessTokenExpiresAt: accessTokenExpiresAt(),
    });
  },
);

authSessionRouter.post('/logout', requireAuth, async (req, res) => {
  const presented = getRefreshTokenCookie(req);
  if (presented) await revokeRefreshToken(pool, presented);
  res.setHeader('Set-Cookie', clearRefreshTokenCookie(config.isDevelopment));
  res.json({ success: true });
});
