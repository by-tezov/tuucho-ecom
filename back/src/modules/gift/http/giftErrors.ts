import type { Request, Response } from 'express';
import { GiftFailure } from '../domain/errors.js';
import { giftPathToken } from './giftSchemas.js';

function sendGiftFailure(res: Response, error: unknown): boolean {
  if (error instanceof GiftFailure) {
    if (error.code === 'gift_pin_throttled') {
      const retryAfterSec =
        typeof error.extras?.retryAfterSec === 'number' ? error.extras.retryAfterSec : undefined;
      if (retryAfterSec != null && retryAfterSec > 0) {
        res.setHeader('Retry-After', String(retryAfterSec));
      }
    }
    res.status(error.httpStatus).json({
      success: false,
      error: { code: error.code, ...error.extras },
    });
    return true;
  }
  return false;
}

export async function withGiftErrors(res: Response, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!sendGiftFailure(res, error)) throw error;
  }
}

export function rawPathToken(req: Request): string | undefined {
  return giftPathToken(req);
}
