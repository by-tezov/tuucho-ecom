import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { GDPR_CONSENT_VERSION } from '@kernel/back/config/gdpr';
import { generateOpaqueToken, hashOpaqueToken } from '@kernel/back/platform/security/opaqueToken';
import {
  boundedEmail,
  boundedMultilinePrintable,
  boundedPrintable,
  GIFT_COMMENT_MAX_LENGTH,
  GIFT_COMMENT_MAX_LINES,
  GIFT_NAME_MAX_LENGTH,
} from '@kernel/back/utils/fieldLimits';
import { isLanguage, type Language } from '@kernel/back/utils/language';
import { failGift } from '../domain/errors.js';
import { parseAccessPin } from '../domain/pin.js';
import { parseGiftShareCardStyle, type GiftShareCardStyle } from '../domain/shareCardStyle.js';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import {
  countOpenGiftCartsForUser,
  insertGiftOffer,
  lockGiverPromises,
  updateOfferFields,
  type GiftOfferRow,
} from '../infrastructure/giftOfferRepo.js';
import { ensureGiftCart } from '../infrastructure/giftCart.js';
import { notifyGiftCreatedSpy } from '../infrastructure/giftMail.js';
import { enqueueGiftShareCardMail } from './giftMailJob.js';
import { addHours } from './clocks.js';
import { giftReceiverUrl } from '../infrastructure/giftUrls.js';
import { hashGiftPin } from './pinHash.js';

export interface CreateGiftOfferInput {
  giverEmail: string;
  giverDisplayName: string;
  receiverName: string;
  giverComment: string;
  maxBudget: number;
  allowAccessories: boolean;
  maxAccessoryBudget: number | null;
  hideReceiverPrices: boolean;
  language: Language;
  gdprAccepted: boolean;
  accessPin: string;
  shareCardStyle: GiftShareCardStyle;
  session?: { id: string; email: string } | null;
}

function parseMoney(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100) / 100;
}

function parseRequiredBudget(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  const rounded = Math.round(value * 100) / 100;
  if (rounded <= 0) return undefined;
  return rounded;
}

export function parseCreateGiftOfferBody(
  body: unknown,
  session?: { id: string; email: string } | null,
): CreateGiftOfferInput | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const giverEmail = boundedEmail(raw.giverEmail);
  // Same bounds as the share-card edit (parseShareCardPatch): both names are
  // printed on the card and in emails, so control characters are refused.
  const giverDisplayName = boundedPrintable(raw.giverDisplayName, GIFT_NAME_MAX_LENGTH);
  const receiverName = boundedPrintable(raw.receiverName, GIFT_NAME_MAX_LENGTH);
  if (!giverEmail || !giverDisplayName || !receiverName) return null;
  const maxBudget = parseRequiredBudget(raw.maxBudget);
  if (maxBudget == null) return null;
  const allowAccessories = raw.allowAccessories === true;
  const maxAccessoryBudget = parseMoney(raw.maxAccessoryBudget);
  if (maxAccessoryBudget === undefined) return null;
  if (allowAccessories && maxAccessoryBudget == null) return null;
  if (typeof raw.giverComment !== 'string') return null;
  const giverComment = boundedMultilinePrintable(
    raw.giverComment,
    GIFT_COMMENT_MAX_LENGTH,
    GIFT_COMMENT_MAX_LINES,
  );
  if (!giverComment) return null;
  const language = typeof raw.language === 'string' && isLanguage(raw.language) ? raw.language : 'en';
  const hideReceiverPrices = raw.hideReceiverPrices === false ? false : true;
  const gdprAccepted =
    session != null
      ? true
      : Boolean(
          raw.gdprConsent &&
          typeof raw.gdprConsent === 'object' &&
          (raw.gdprConsent as { accepted?: unknown }).accepted === true,
        );
  if (!session && !gdprAccepted) return null;
  const accessPin = parseAccessPin(raw.accessPin);
  if (!accessPin) return null;
  const shareCardStyle = parseGiftShareCardStyle(raw.shareCardStyle);
  if (!shareCardStyle) return null;
  return {
    giverEmail,
    giverDisplayName,
    receiverName,
    giverComment,
    maxBudget,
    allowAccessories,
    maxAccessoryBudget: allowAccessories ? maxAccessoryBudget : null,
    hideReceiverPrices,
    language,
    gdprAccepted,
    accessPin,
    shareCardStyle,
    session: session ?? null,
  };
}

export async function createGiftOffer(
  pool: pg.Pool,
  input: CreateGiftOfferInput,
): Promise<{
  offer: GiftOfferRow;
  checkEmail: boolean;
  receiverUrl: string | null;
}> {
  const settings = await getGiftSettings(pool);
  // Floor first: a budget under one set's price makes a promise the receiver
  // cannot spend. The shop checks it too, but the shop is not authoritative.
  if (input.maxBudget < settings.minBudget) {
    failGift('gift_budget_floor', { min: settings.minBudget, field: 'maxBudget' });
  }
  if (input.maxBudget > settings.maxBudgetCeiling) {
    failGift('gift_budget_ceiling', { max: settings.maxBudgetCeiling, field: 'maxBudget' });
  }
  if (input.maxAccessoryBudget != null && input.maxAccessoryBudget > settings.maxAccessoryBudgetCeiling) {
    failGift('gift_budget_ceiling', {
      max: settings.maxAccessoryBudgetCeiling,
      field: 'maxAccessoryBudget',
    });
  }

  const session = input.session;
  if (session && session.email.trim().toLowerCase() !== input.giverEmail) failGift('invalid_request');
  const knownSession = Boolean(session);

  const giverToken = generateOpaqueToken();
  const receiverToken = generateOpaqueToken();
  const now = new Date();
  const offerId = randomUUID();
  const offerInput: Parameters<typeof insertGiftOffer>[1] = {
    id: offerId,
    status: 'selecting',
    giverEmail: input.giverEmail,
    giverDisplayName: input.giverDisplayName,
    giverUserId: knownSession ? session!.id : null,
    receiverName: input.receiverName,
    giverComment: input.giverComment,
    shareCardStyle: input.shareCardStyle,
    maxSets: null,
    maxBudget: input.maxBudget,
    allowAccessories: input.allowAccessories,
    maxAccessoryBudget: input.maxAccessoryBudget,
    hideReceiverPrices: input.hideReceiverPrices,
    giverTokenHash: hashOpaqueToken(giverToken),
    receiverTokenHash: hashOpaqueToken(receiverToken),
    giverToken,
    receiverToken,
    pinHash: await hashGiftPin(offerId, input.accessPin),
    gdprVersion: GDPR_CONSENT_VERSION,
    language: input.language,
    offerExpiresAt: addHours(now, settings.receiverTokenTtlDays * 24),
  };

  let offer: GiftOfferRow;
  if (knownSession && session) {
    // Count, insert and cart in one transaction under the giver's lock: two
    // offers created at once used to both pass the count before either cart
    // existed, and exceed maxOpenPromisesPerGiver.
    const client = await pool.connect();
    try {
      await client.query('begin');
      await lockGiverPromises(client, session.id);
      const open = await countOpenGiftCartsForUser(client, session.id);
      if (open >= settings.maxOpenPromisesPerGiver) failGift('invalid_request');
      offer = await insertGiftOffer(client, offerInput);
      const cartId = await ensureGiftCart(client, session.id, offer.id, offer.receiverName);
      offer = await updateOfferFields(client, offer.id, { cartId });
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  } else {
    offer = await insertGiftOffer(pool, offerInput);
  }

  notifyGiftCreatedSpy({
    offerId: offer.id,
    giverEmail: offer.giverEmail,
    giverDisplayName: offer.giverDisplayName,
    giverUserId: offer.giverUserId,
    receiverName: offer.receiverName,
    giverComment: offer.giverComment ?? '',
    maxBudget: offer.maxBudget,
    allowAccessories: offer.allowAccessories,
    maxAccessoryBudget: offer.maxAccessoryBudget,
    hideReceiverPrices: offer.hideReceiverPrices,
    language: offer.language,
    offerExpiresAt: offer.offerExpiresAt,
    shareCardStyle: input.shareCardStyle,
    signedIn: knownSession,
  });

  await enqueueGiftShareCardMail(pool, {
    to: offer.giverEmail,
    giverDisplayName: offer.giverDisplayName,
    giverComment: offer.giverComment ?? '',
    receiverName: offer.receiverName,
    receiverToken: offer.receiverToken,
    giverToken: offer.giverToken,
    language: offer.language,
    validUntil: offer.offerExpiresAt,
    shareCardStyle: input.shareCardStyle,
  });
  return {
    offer,
    checkEmail: !knownSession,
    receiverUrl: knownSession ? giftReceiverUrl(offer.receiverToken, offer.language) : null,
  };
}
