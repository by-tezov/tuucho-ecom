import type pg from 'pg';
import { listOpenOffersForGiverUser } from '../infrastructure/giftOfferRepo.js';
import type { GiftStatus } from '../domain/statuses.js';

export interface PublicGiftCartMeta {
  offerId: string;
  status: GiftStatus;
  receiverName: string;
  giverToken: string;
  maxBudget: number | null;
  allowAccessories: boolean;
  maxAccessoryBudget: number | null;
}

export async function listPublicGiftCartMetaByCartId(
  pool: pg.Pool,
  userId: string,
): Promise<Map<string, PublicGiftCartMeta>> {
  const offers = await listOpenOffersForGiverUser(pool, userId);
  const byCart = new Map<string, PublicGiftCartMeta>();
  for (const offer of offers) {
    if (!offer.cartId) continue;
    byCart.set(offer.cartId, {
      offerId: offer.id,
      status: offer.status,
      receiverName: offer.receiverName,
      giverToken: offer.giverToken,
      maxBudget: offer.maxBudget,
      allowAccessories: offer.allowAccessories,
      maxAccessoryBudget: offer.maxAccessoryBudget,
    });
  }
  return byCart;
}
