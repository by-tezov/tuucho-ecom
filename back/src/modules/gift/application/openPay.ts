import type pg from 'pg';
import { GDPR_CONSENT_VERSION } from '../../../config/gdpr.js';
import {
  findUserByCurrentEmail,
  insertUser,
  reactivateIfPendingDeletion,
  type UserRow,
} from '../../identity/application/users.js';
import { failGift } from '../domain/errors.js';
import { canClaimGiverSession } from '../domain/statuses.js';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import {
  countOpenGiftCartsForUser,
  lockGiverPromises,
  getGiftDestination,
  lockOfferById,
  updateOfferFields,
  type GiftOfferRow,
} from '../infrastructure/giftOfferRepo.js';
import { listGiftItems } from '../infrastructure/giftItemRepo.js';
import {
  activateGiftCart,
  attachGiftDestinationAddress,
  ensureGiftCart,
  replaceGiftCartLines,
  setGiftCartCheckout,
} from '../infrastructure/giftCart.js';
import { loadGiverOffer } from './loadOffer.js';

export interface OpenPayResult {
  offer: GiftOfferRow;
  user: UserRow;
  created: boolean;
  cartId: string;
}

/**
 * Open-pay after the giver link. The HTTP layer requires a PIN grant unless
 * the Bearer session already is this giver (remember-me). That PIN gate is
 * what stops a leaked "espace cadeau" URL from creating a shop account for
 * an email that does not exist yet. After the PIN (or a matching session),
 * this still creates or attaches a passwordless, email-verified account and
 * issues a full shop session so Marc can pay without a separate signup.
 */
export async function openGiftPay(pool: pg.Pool, rawToken: string): Promise<OpenPayResult> {
  const existing = await loadGiverOffer(pool, rawToken);
  if (!canClaimGiverSession(existing.status)) failGift('gift_not_payable');
  const settings = await getGiftSettings(pool);
  const client = await pool.connect();
  let created = false;
  let user: UserRow | undefined;
  let offer: GiftOfferRow;
  let cartId: string;
  let destination: Awaited<ReturnType<typeof getGiftDestination>> = undefined;
  try {
    await client.query('begin');
    const locked = await lockOfferById(client, existing.id);
    if (!locked) failGift('not_found');
    if (!canClaimGiverSession(locked.status)) failGift('gift_not_payable');

    user = await findUserByCurrentEmail(client, locked.giverEmail);
    if (user?.status === 'locked') failGift('invalid_request');
    if (user?.status === 'deleted') user = undefined;
    if (!user) {
      await client.query('savepoint create_gift_user');
      try {
        user = await insertUser(client, {
          email: locked.giverEmail,
          passwordHash: null,
          gdprConsentVersion: locked.gdprVersion || GDPR_CONSENT_VERSION,
          language: locked.language,
          emailVerified: true,
        });
        created = true;
      } catch (error) {
        if ((error as { code?: string }).code !== '23505') throw error;
        await client.query('rollback to savepoint create_gift_user');
        user = await findUserByCurrentEmail(client, locked.giverEmail);
        if (!user || user.status === 'locked' || user.status === 'deleted') throw error;
      }
    }
    if (user.status === 'pending_deletion') {
      await reactivateIfPendingDeletion(client, user.id);
      user = { ...user, status: 'active', deletion_scheduled_for: null };
    }

    offer = await updateOfferFields(client, locked.id, { giverUserId: user.id });

    if (offer.stockReservationId) {
      await client.query(`update stock_reservations set user_id = $1, updated_at = now() where id = $2`, [
        user.id,
        offer.stockReservationId,
      ]);
    }

    await lockGiverPromises(client, user.id);
    const open = await countOpenGiftCartsForUser(client, user.id);
    if (!offer.cartId && open >= settings.maxOpenPromisesPerGiver) failGift('invalid_request');
    const hadCart = Boolean(locked.cartId);
    const syncFromOffer = !hadCart || locked.status === 'selecting';
    cartId = await ensureGiftCart(client, user.id, offer.id, offer.receiverName);
    await activateGiftCart(client, user.id, cartId);
    destination = undefined;
    if (syncFromOffer) {
      const items = await listGiftItems(client, offer.id);
      await replaceGiftCartLines(client, cartId, items);
      destination = await getGiftDestination(client, offer.id);
      await setGiftCartCheckout(client, cartId, {
        courierCode: destination?.courierCode ?? offer.assignedCourierCode,
      });
    }
    offer = await updateOfferFields(client, offer.id, { cartId });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  if (!user) failGift('not_found');
  if (destination) {
    await attachGiftDestinationAddress(pool, user.id, cartId, destination);
  }
  return { offer, user, created, cartId };
}
