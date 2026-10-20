import rateLimit from 'express-rate-limit';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isHttpRateLimitRelaxed } from '../../modules/settings/application/appPreferences.js';
import { createPgRateLimitStore } from './pgRateLimitStore.js';
import { notifyRateLimitedFromRequest, type RateLimitSpyKind } from './rateLimitSpy.js';

function jsonRateLimited(kind: RateLimitSpyKind) {
  return (req: Request, res: Response): void => {
    notifyRateLimitedFromRequest(req, kind);
    res.status(429).json({ success: false, error: { code: 'rate_limited' } });
  };
}

export interface RateLimiterOptions {
  windowMs: number;
  limit: number;
  disabled: () => boolean;
  kind: RateLimitSpyKind;
  failuresOnly?: boolean;
}

/** Shared HTTP policy for every named limiter in middleware/rateLimiters.ts.
 * Route declarations there carry only what is allowed to differ. Counters
 * live in Postgres (`rate_limit_buckets`) so every API process shares one
 * window.
 *
 * **A 5xx never counts against the caller**: these limits stop abuse, and a
 * request the server failed to serve is our fault, not abuse. Anything below
 * 500 still counts, because volume 4xx is exactly the abuse shape they guard.
 * The mechanism is express-rate-limit's decrement-on-finish, so a
 * `failuresOnly` limiter has to class a 5xx as "successful" to give it back.
 * See docs/api/00-conventions.md. */
export function createRateLimiter(options: RateLimiterOptions) {
  const failuresOnly = options.failuresOnly ?? false;
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: failuresOnly,
    skipFailedRequests: !failuresOnly,
    requestWasSuccessful: (_req: Request, res: Response): boolean =>
      failuresOnly ? res.statusCode < 400 || res.statusCode >= 500 : res.statusCode < 500,
    skip: async () => options.disabled() || (await isHttpRateLimitRelaxed()),
    handler: jsonRateLimited(options.kind),
    store: createPgRateLimitStore(`rl:${options.kind}:`),
  });
}

/** Build the limiter on first request so plugin settings (DB) are already cached. */
export function lazyRateLimiter(factory: () => RequestHandler): RequestHandler {
  let instance: RequestHandler | undefined;
  return (req: Request, res: Response, next: NextFunction) => {
    if (!instance) instance = factory();
    return instance(req, res, next);
  };
}
