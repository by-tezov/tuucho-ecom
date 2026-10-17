import type pg from 'pg';
import { failGift } from '../domain/errors.js';
import { canUnlockGiverCart } from '../domain/statuses.js';
import { setGiftCartUserLinesLocked } from '../infrastructure/giftCart.js';
import { loadGiverOffer } from './loadOffer.js';
import { assertGiverCheckoutUser } from './giftCheckout.js';

export async function unlockGiverCart(pool: pg.Pool, rawToken: string, userId: string): Promise<void> {
  const offer = await loadGiverOffer(pool, rawToken);
  if (!canUnlockGiverCart(offer.status)) failGift('gift_frozen');
  await assertGiverCheckoutUser(offer, userId);
  await setGiftCartUserLinesLocked(pool, offer.cartId!, false);
}
