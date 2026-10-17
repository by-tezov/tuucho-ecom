import type { Response } from 'express';
import type pg from 'pg';
import { syncGiftHoldToActiveCart } from '../../gift/application/giftCheckout.js';

export async function syncGiftHoldAfterLineChange(
  pool: pg.Pool,
  res: Response,
  userId: string,
): Promise<boolean> {
  try {
    await syncGiftHoldToActiveCart(pool, userId);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === 'gift_stock_unavailable') {
      res.status(409).json({ success: false, error: { code: 'gift_stock_unavailable' } });
      return false;
    }
    throw error;
  }
}
