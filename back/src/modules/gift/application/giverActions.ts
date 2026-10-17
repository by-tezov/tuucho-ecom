import type pg from 'pg';
import { failGift } from '../domain/errors.js';
import { receiverCanMutate } from '../domain/statuses.js';
import { canExtendOffer, extendedOfferExpiry } from '../domain/extend.js';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import { lockOfferById, updateOfferFields, type GiftOfferRow } from '../infrastructure/giftOfferRepo.js';
import { deleteGiftCart } from '../infrastructure/giftCart.js';
import { releaseGiftHold } from '../infrastructure/giftStock.js';
import { sendGiftCancelledMail } from '../infrastructure/giftMail.js';
import { addDays } from './clocks.js';
import { loadGiverOffer } from './loadOffer.js';

export async function cancelGiftOffer(pool: pg.Pool, rawToken: string): Promise<GiftOfferRow> {
  const existing = await loadGiverOffer(pool, rawToken);
  if (existing.status === 'ordered') failGift('gift_already_ordered');
  if (existing.status === 'cancelled' || existing.status === 'expired') return existing;
  const settings = await getGiftSettings(pool);
  const client = await pool.connect();
  let offer: GiftOfferRow;
  try {
    await client.query('begin');
    const locked = await lockOfferById(client, existing.id);
    if (!locked) failGift('not_found');
    if (locked.status === 'ordered') failGift('gift_already_ordered');
    if (locked.status === 'cancelled' || locked.status === 'expired') {
      await client.query('commit');
      return locked;
    }
    await releaseGiftHold(client, locked.stockReservationId);
    await deleteGiftCart(client, locked.cartId);
    offer = await updateOfferFields(client, locked.id, {
      status: 'cancelled',
      stockReservationId: null,
      cartId: null,
      holdExpiresAt: null,
      receiverVisibleUntil: addDays(new Date(), settings.visibilityAfterTerminalDays),
    });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  await sendGiftCancelledMail({
    to: offer.giverEmail,
    receiverName: offer.receiverName,
    language: offer.language,
  });
  return offer;
}

/** Pushes `offer_expires_at` back by two weeks so Julie gets more time to
 * choose. Only while she is still choosing: once she confirms, the offer
 * clock is replaced by `pay_by_at` / `hold_expires_at`, which this must
 * never touch. The ceiling (`GIFT_EXTEND_CEILING_DAYS`) is re-checked here
 * under the row lock, not only where the button is drawn from `canExtend`. */
export async function extendGiftOffer(
  pool: pg.Pool,
  rawToken: string,
): Promise<{ offer: GiftOfferRow; canExtend: boolean }> {
  const existing = await loadGiverOffer(pool, rawToken);
  if (!receiverCanMutate(existing.status)) failGift('gift_not_editable');
  const settings = await getGiftSettings(pool);
  const client = await pool.connect();
  let offer: GiftOfferRow;
  try {
    await client.query('begin');
    const locked = await lockOfferById(client, existing.id);
    if (!locked) failGift('not_found');
    if (!receiverCanMutate(locked.status)) failGift('gift_not_editable');
    const now = new Date();
    if (!canExtendOffer(locked.status, locked.offerExpiresAt, settings.extendCeilingDays, now)) {
      failGift('gift_extend_limit');
    }
    offer = await updateOfferFields(client, locked.id, {
      offerExpiresAt: extendedOfferExpiry(locked.offerExpiresAt, now),
    });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return {
    offer,
    canExtend: canExtendOffer(offer.status, offer.offerExpiresAt, settings.extendCeilingDays, new Date()),
  };
}
