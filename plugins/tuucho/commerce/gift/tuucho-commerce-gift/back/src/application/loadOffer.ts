import type pg from 'pg';
import { hashOpaqueToken } from '@kernel/back/platform/security/opaqueToken';
import { failGift } from '../domain/errors.js';
import { assertNotGone } from '../domain/access.js';
import {
  findOfferByGiverTokenHash,
  findOfferByReceiverTokenHash,
  type GiftOfferRow,
} from '../infrastructure/giftOfferRepo.js';

export async function loadGiverOffer(db: pg.Pool | pg.PoolClient, rawToken: string): Promise<GiftOfferRow> {
  const offer = await findOfferByGiverTokenHash(db, hashOpaqueToken(rawToken));
  if (!offer) failGift('not_found');
  assertNotGone(offer.status, offer.receiverVisibleUntil);
  return offer;
}

export async function loadReceiverOffer(
  db: pg.Pool | pg.PoolClient,
  rawToken: string,
): Promise<GiftOfferRow> {
  const offer = await findOfferByReceiverTokenHash(db, hashOpaqueToken(rawToken));
  if (!offer) failGift('not_found');
  assertNotGone(offer.status, offer.receiverVisibleUntil);
  return offer;
}
