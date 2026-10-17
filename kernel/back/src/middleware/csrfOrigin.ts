import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env.js';

/**
 * Refresh is authenticated by a browser cookie, so a successful cross-site
 * POST could otherwise rotate a victim's session without their intent. The
 * access token is deliberately not used here: a refresh request must work
 * with the HttpOnly cookie alone.
 *
 * Modern browsers send both Origin and Fetch Metadata on this request. Keep
 * requests without either header compatible with native/mobile clients, but
 * reject an explicit cross-site signal and an origin outside the production
 * CORS allow-list. This is a defence-in-depth check alongside SameSite.
 */
export function requireSameOriginForCookieSession(req: Request, res: Response, next: NextFunction): void {
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite === 'cross-site') {
    res.status(403).json({ success: false, error: { code: 'csrf_rejected' } });
    return;
  }

  const origin = req.headers.origin;
  if (origin && !config.isDevelopment && !config.corsOrigins!.includes(origin)) {
    res.status(403).json({ success: false, error: { code: 'csrf_rejected' } });
    return;
  }

  next();
}
