import type { NextFunction, Request, Response } from 'express';
import { resolveAuthenticatedUser } from './requestAuthentication.js';

/** Gate for every /account route (and the auth-only bits of /auth, like
 * resend-email-confirmation) — verifies a per-user signed JWT carried in the
 * Authorization header. Re-checks the live user row so a locked / deleted
 * account cannot keep using an access token until TTL alone expires.
 * Sets req.user on success. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await resolveAuthenticatedUser(req, { includeImpersonator: true });
  if (!user) {
    res.status(401).json({ success: false, error: { code: 'unauthorized' } });
    return;
  }
  req.user = user;
  next();
}
