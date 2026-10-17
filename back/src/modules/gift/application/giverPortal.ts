import type pg from 'pg';
import { getGiftDestination, type GiftOfferRow } from '../infrastructure/giftOfferRepo.js';
import { listGiftItems } from '../infrastructure/giftItemRepo.js';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import { canExtendOffer } from '../domain/extend.js';
import {
  clocksOf,
  publicDestination,
  publicGiftItem,
  remainingFrom,
  shareCardPayload,
} from './presenters.js';

export async function giverPortalPayload(pool: pg.Pool, offer: GiftOfferRow) {
  const [items, destination, shareCard, settings] = await Promise.all([
    listGiftItems(pool, offer.id),
    getGiftDestination(pool, offer.id),
    shareCardPayload(offer),
    getGiftSettings(pool),
  ]);
  const remaining = remainingFrom(offer, items);
  return {
    id: offer.id,
    status: offer.status,
    giverDisplayName: offer.giverDisplayName,
    receiverName: offer.receiverName,
    giverComment: offer.giverComment,
    shareCardStyle: offer.shareCardStyle,
    maxSets: offer.maxSets,
    maxBudget: offer.maxBudget,
    allowAccessories: offer.allowAccessories,
    maxAccessoryBudget: offer.maxAccessoryBudget,
    hideReceiverPrices: offer.hideReceiverPrices,
    cartId: offer.cartId,
    orderId: offer.orderId,
    assignedCourierCode: offer.assignedCourierCode,
    remaining,
    clocks: clocksOf(offer),
    // Drawn as the status block's "prolonger" button; false once another
    // two weeks would pass GIFT_EXTEND_CEILING_DAYS, or once Julie has
    // confirmed and the offer clock no longer governs.
    canExtend: canExtendOffer(offer.status, offer.offerExpiresAt, settings.extendCeilingDays, new Date()),
    items: items.map((item) => publicGiftItem(item, false)),
    destination: publicDestination(destination),
    shareCard,
  };
}
