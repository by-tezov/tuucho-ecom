import type { NextFunction, Request, Response } from 'express';
import { pool } from '../../../db/pool.js';
import {
  requireCheckoutPrivacySession,
  sendCheckoutPrivacySessionError,
} from '../../commerce/application/checkoutPrivacySession.js';

export async function requireAccountCheckoutSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await requireCheckoutPrivacySession(pool, req, req.user!.id, true);
    res.locals.checkoutPrivacySessionId = session.id;
    next();
  } catch (error) {
    if (!sendCheckoutPrivacySessionError(res, error)) throw error;
  }
}

