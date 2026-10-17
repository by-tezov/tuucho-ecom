import type { NextFunction, Request, Response } from 'express';
import { resolveAuthenticatedUser } from './requestAuthentication.js';

/** Attaches an authenticated customer when a valid bearer token is present.
 * Invalid/missing tokens deliberately remain anonymous: public gallery
 * browsing must not turn an expired token into a broken page. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const user = await resolveAuthenticatedUser(req, { includeImpersonator: false });
  if (user) req.user = user;
  next();
}
