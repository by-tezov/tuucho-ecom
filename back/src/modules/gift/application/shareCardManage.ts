import type pg from 'pg';
import { boundedMultilinePrintable, boundedPrintable, GIFT_COMMENT_MAX_LENGTH, GIFT_COMMENT_MAX_LINES, GIFT_NAME_MAX_LENGTH } from '../../../utils/fieldLimits.js';
import { failGift } from '../domain/errors.js';
import { receiverCanMutate } from '../domain/statuses.js';
import { parseGiftShareCardStyle, type GiftShareCardStyle } from '../domain/shareCardStyle.js';
import { updateOfferFields, type GiftOfferRow } from '../infrastructure/giftOfferRepo.js';
import { renderGiftShareCardPdf, type GiftShareCardPdfInput } from '../infrastructure/giftShareCardPdf.js';
import { renderGiftShareCardJpeg } from '../infrastructure/giftShareCardJpeg.js';
import { giftReceiverUrl } from '../infrastructure/giftUrls.js';
import { loadGiverOffer } from './loadOffer.js';
import { enqueueGiftShareCardMail } from './giftMailJob.js';

export interface ShareCardPatch {
  receiverName: string;
  giverComment: string;
  shareCardStyle: GiftShareCardStyle;
}

export function parseShareCardPatch(body: unknown): ShareCardPatch | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const receiverName = boundedPrintable(raw.receiverName, GIFT_NAME_MAX_LENGTH);
  if (!receiverName) return null;
  const giverComment = boundedMultilinePrintable(raw.giverComment, GIFT_COMMENT_MAX_LENGTH, GIFT_COMMENT_MAX_LINES);
  if (!giverComment) return null;
  const shareCardStyle = parseGiftShareCardStyle(raw.shareCardStyle);
  if (!shareCardStyle) return null;
  return { receiverName, giverComment, shareCardStyle };
}

function assertEditable(offer: GiftOfferRow): void {
  if (!receiverCanMutate(offer.status)) failGift('gift_not_editable');
}

/** The giver's "download gift card" modal edits these three fields in
 * place — unlike every other offer field, they stay editable for as long
 * as Julie has not confirmed her choice (`receiverCanMutate`). */
export async function updateShareCard(
  pool: pg.Pool,
  rawToken: string,
  patch: ShareCardPatch,
): Promise<GiftOfferRow> {
  const offer = await loadGiverOffer(pool, rawToken);
  assertEditable(offer);
  return updateOfferFields(pool, offer.id, patch);
}

function shareCardInput(offer: GiftOfferRow): GiftShareCardPdfInput {
  return {
    receiverUrl: giftReceiverUrl(offer.receiverToken, offer.language),
    giverDisplayName: offer.giverDisplayName,
    receiverName: offer.receiverName,
    giverComment: offer.giverComment ?? '',
    style: offer.shareCardStyle,
    language: offer.language,
    expiresAt: offer.offerExpiresAt ?? new Date(),
  };
}

export type ShareCardFormat = 'pdf' | 'jpg';

export function parseShareCardFormat(value: unknown): ShareCardFormat {
  return value === 'jpg' ? 'jpg' : 'pdf';
}

/** Same two files as the create-time email (`sendGiverShareCardMail`):
 * the PDF is the printable A4 sheet with crop marks, not the bare 5"x3"
 * card — the giver must get an identical re-download, not a different
 * layout. */
export async function renderShareCardFile(
  pool: pg.Pool,
  rawToken: string,
  format: ShareCardFormat,
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const offer = await loadGiverOffer(pool, rawToken);
  assertEditable(offer);
  const input = shareCardInput(offer);
  if (format === 'jpg') {
    return {
      buffer: await renderGiftShareCardJpeg(input),
      contentType: 'image/jpeg',
      filename: 'carte-cadeau.jpg',
    };
  }
  return {
    buffer: await renderGiftShareCardPdf(input, 'a4'),
    contentType: 'application/pdf',
    filename: 'carte-cadeau.pdf',
  };
}

/** Same mail the giver already got at creation, resent on demand to the
 * giver's own account email — never a free-text recipient. */
export async function resendShareCardMail(pool: pg.Pool, rawToken: string): Promise<void> {
  const offer = await loadGiverOffer(pool, rawToken);
  assertEditable(offer);
  await enqueueGiftShareCardMail(pool, {
    to: offer.giverEmail,
    giverDisplayName: offer.giverDisplayName,
    giverComment: offer.giverComment ?? '',
    receiverName: offer.receiverName,
    receiverToken: offer.receiverToken,
    giverToken: offer.giverToken,
    language: offer.language,
    validUntil: offer.offerExpiresAt,
    shareCardStyle: offer.shareCardStyle,
  });
}
