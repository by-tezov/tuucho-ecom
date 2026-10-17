import type pg from 'pg';
import { failGift } from '../domain/errors.js';
import { assertReceiverCanMutate } from '../domain/access.js';
import { giftConstraintViolation, isNailGiftItem } from '../domain/remaining.js';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import {
  countOpenGiftCartsForUser,
  getGiftDestination,
  lockGiverPromises,
  lockOfferById,
  updateOfferFields,
  type GiftOfferRow,
} from '../infrastructure/giftOfferRepo.js';
import { listGiftItems } from '../infrastructure/giftItemRepo.js';
import { allocateGiftHold, releaseGiftHold } from '../infrastructure/giftStock.js';
import { ensureGiftCart, replaceGiftCartLines, setGiftCartCheckout } from '../infrastructure/giftCart.js';
import { sendGiverPromiseMail } from '../infrastructure/giftMail.js';
import { syncGiverCartFromOffer } from './syncGiverCart.js';
import { addDays } from './clocks.js';
import { isValidEmail } from '@kernel/back/utils/validate';

async function applyPromiseHold(
  client: pg.PoolClient,
  offer: GiftOfferRow,
  settingsHoldDays: number,
  settingsPayDays: number,
  resetPayBy: boolean,
): Promise<GiftOfferRow> {
  const items = await listGiftItems(client, offer.id);
  let cartId = offer.cartId;
  // A confirm that creates the giver's gift cart opens a new promise, so the
  // per-giver limit is checked here, before the cart exists.
  if (!cartId && offer.giverUserId) {
    await lockGiverPromises(client, offer.giverUserId);
    const settings = await getGiftSettings(client);
    const open = await countOpenGiftCartsForUser(client, offer.giverUserId);
    if (open >= settings.maxOpenPromisesPerGiver) failGift('invalid_request');
    cartId = await ensureGiftCart(client, offer.giverUserId, offer.id, offer.receiverName);
  }
  const constraintItems = items.map((item) => ({
    productType: item.productType,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
  }));
  if (constraintItems.length === 0 || !constraintItems.some(isNailGiftItem)) {
    failGift('invalid_request');
  }
  const destination = await getGiftDestination(client, offer.id);
  if (!destination) failGift('invalid_request');
  const violation = giftConstraintViolation(offer, constraintItems);
  if (violation) failGift(violation);

  await releaseGiftHold(client, offer.stockReservationId);
  const now = new Date();
  const holdExpiresAt = addDays(now, settingsHoldDays);
  let reservationId: string | null = null;
  if (items.length > 0) {
    try {
      reservationId = await allocateGiftHold(client, offer.giverUserId, items, holdExpiresAt);
    } catch (error) {
      if ((error as Error).message === 'gift_stock_unavailable') failGift('gift_stock_unavailable');
      throw error;
    }
  }

  if (offer.giverUserId) {
    cartId = await ensureGiftCart(client, offer.giverUserId, offer.id, offer.receiverName);
    await replaceGiftCartLines(client, cartId, items);
    await setGiftCartCheckout(client, cartId, { courierCode: destination.courierCode });
  }

  return updateOfferFields(client, offer.id, {
    status: 'awaiting_payment',
    holdExpiresAt,
    payByAt: resetPayBy ? addDays(now, settingsPayDays) : offer.payByAt,
    stockReservationId: reservationId,
    cartId,
    assignedCourierCode: destination.courierCode,
  });
}

export async function confirmReceiverChoice(
  pool: pg.Pool,
  offer: GiftOfferRow,
  receiverEmail: string,
): Promise<GiftOfferRow> {
  const email = receiverEmail.trim().toLowerCase();
  if (!isValidEmail(email)) failGift('invalid_request');
  if (offer.status === 'awaiting_payment') return offer;
  assertReceiverCanMutate(offer.status);
  const settings = await getGiftSettings(pool);
  const client = await pool.connect();
  let updated: GiftOfferRow;
  try {
    await client.query('begin');
    const locked = await lockOfferById(client, offer.id);
    if (!locked) failGift('not_found');
    if (locked.status === 'awaiting_payment') {
      await client.query('commit');
      return locked;
    }
    assertReceiverCanMutate(locked.status);
    // Persist the email before the stock hold so a failed hold still keeps
    // what the recipient typed if they retry after fixing the cart.
    await updateOfferFields(client, locked.id, { receiverEmail: email });
    const withEmail = { ...locked, receiverEmail: email };
    updated = await applyPromiseHold(
      client,
      withEmail,
      settings.stockHoldTtlDays,
      settings.giverPayTtlDays,
      true,
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  await sendGiverPromiseMail({
    to: updated.giverEmail,
    giverToken: updated.giverToken,
    language: updated.language,
    receiverName: updated.receiverName,
    holdExpiresAt: updated.holdExpiresAt,
    validUntil: updated.payByAt,
  });
  await syncGiverCartFromOffer(pool, updated);
  return updated;
}
