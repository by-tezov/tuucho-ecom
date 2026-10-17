import type pg from 'pg';
import type { AuthenticatedUser } from '../../../types.js';
import { generateOpaqueToken, hashOpaqueToken } from '../../../platform/security/opaqueToken.js';
import { recordAdminActivityBestEffort } from '../../activity/application/recordAdminActivity.js';
import { findUserByCurrentEmail } from '../../identity/application/users.js';
import { failGift } from '../domain/errors.js';
import { canClaimGiverSession } from '../domain/statuses.js';
import { findOfferById } from '../infrastructure/giftOfferRepo.js';
import { insertPinSession, type GiftPinRole } from '../infrastructure/giftPinRepo.js';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import { addHours } from './clocks.js';
import { openGiftPay } from './openPay.js';

export interface AdminGiftEnter {
  role: GiftPinRole;
  language: string;
  capabilityToken: string;
  pinToken: string;
  expiresAt: string;
  cartId: string | null;
}

/**
 * Opens an offer from the gifts panel as that participant.
 *
 * Mints the same pin grant a correct PIN would, so the existing gift routes
 * accept the same actions. Opening as the giver also runs open-pay (account
 * and gift cart). The shop then opens that customer in another tab. This
 * administrator tab is left as it is.
 */
export async function enterAdminGiftOffer(
  pool: pg.Pool,
  actor: AuthenticatedUser,
  offerId: string,
  role: GiftPinRole,
): Promise<AdminGiftEnter> {
  const offer = await findOfferById(pool, offerId);
  if (!offer) failGift('not_found');
  const capabilityToken = role === 'giver' ? offer.giverToken : offer.receiverToken;
  if (!capabilityToken) failGift('not_found');

  let accountCreated = false;
  let cartId: string | null = null;
  if (role === 'giver') {
    if (!canClaimGiverSession(offer.status)) failGift('gift_not_payable');
    const existing = await findUserByCurrentEmail(pool, offer.giverEmail);
    if (existing && existing.role !== 'user') failGift('invalid_request');
    const opened = await openGiftPay(pool, offer.giverToken);
    if (opened.user.role !== 'user') failGift('invalid_request');
    accountCreated = opened.created;
    cartId = opened.cartId;
  }

  const settings = await getGiftSettings(pool);
  const pinToken = generateOpaqueToken();
  const expiresAt = addHours(new Date(), settings.lockSessionTtlHours);
  await insertPinSession(pool, offer.id, role, hashOpaqueToken(pinToken), expiresAt);

  const summary =
    role === 'giver'
      ? "Ouverture de l'offre cadeau en tant qu'offrant"
      : "Ouverture de l'offre cadeau en tant que destinataire";
  await recordAdminActivityBestEffort(pool, actor, {
    category: 'gift',
    action: 'gift.enter',
    summary,
    targetType: 'gift_offer',
    targetId: offer.id,
    detail: { role, ...(role === 'giver' ? { accountCreated } : {}) },
  });

  return {
    role,
    language: offer.language,
    capabilityToken,
    pinToken,
    expiresAt: expiresAt.toISOString(),
    cartId,
  };
}
