import type { NextFunction, Request, Response } from 'express';

/** Light security headers for the JSON API. CSP is intentionally omitted
 * here — responses are JSON, not HTML documents; the front's `.htaccess`
 * owns browser CSP/HSTS for the shop UI. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
}
