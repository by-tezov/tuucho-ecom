import type { NextFunction, Request, Response } from 'express';
import { pool } from '../../../db/pool.js';
import { failGift } from '../domain/errors.js';
import { loadGiverOffer, loadReceiverOffer } from '../application/loadOffer.js';
import { assertGiftPinSession } from '../application/giftPin.js';
import { rawPathToken, withGiftErrors } from './giftErrors.js';

export function requireGiftPin(role: 'giver' | 'receiver') {
  return (req: Request, res: Response, next: NextFunction): void => {
    void withGiftErrors(res, async () => {
      const token = rawPathToken(req);
      if (!token) failGift('invalid_request');
      const offer =
        role === 'giver' ? await loadGiverOffer(pool, token) : await loadReceiverOffer(pool, token);
      await assertGiftPinSession(pool, req, offer, role);
    })
      .then(() => {
        if (!res.headersSent) next();
      })
      .catch(next);
  };
}
