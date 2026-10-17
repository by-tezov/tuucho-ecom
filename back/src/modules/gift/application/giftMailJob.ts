/**
 * Gift's slot in the mail queue: its kind, its payload, and how to deliver it.
 *
 * `messaging` owns the queue and the retry policy but must not know that gift
 * exists, so the deliverer is registered from this side. Importing this module
 * is what wires the kind up; `src/app.ts` does that at composition time.
 */
import type pg from 'pg';
import type { Language } from '../../../utils/language.js';
import { enqueueMailJob, registerMailJobDeliverer } from '../../messaging/application/mailJobs.js';
import type { GiftShareCardStyle } from '../domain/shareCardStyle.js';
import { sendGiverShareCardMail } from './giftMailSending.js';

export const GIFT_SHARE_CARD_MAIL = 'gift_share_card';

/** Serialized through JSONB, so `validUntil` crosses as an ISO string. */
type GiftShareCardPayload = {
  to: string;
  giverDisplayName: string;
  giverComment: string;
  receiverName: string;
  receiverToken: string;
  giverToken: string;
  language: Language;
  shareCardStyle: GiftShareCardStyle;
  validUntil: string | null;
};

export async function enqueueGiftShareCardMail(
  db: pg.Pool | pg.PoolClient,
  input: {
    to: string;
    giverDisplayName: string;
    giverComment: string;
    receiverName: string;
    receiverToken: string;
    giverToken: string;
    language: Language;
    shareCardStyle: GiftShareCardStyle;
    validUntil?: Date | null;
  },
): Promise<string> {
  const payload: GiftShareCardPayload = {
    to: input.to,
    giverDisplayName: input.giverDisplayName,
    giverComment: input.giverComment,
    receiverName: input.receiverName,
    receiverToken: input.receiverToken,
    giverToken: input.giverToken,
    language: input.language,
    shareCardStyle: input.shareCardStyle,
    validUntil: input.validUntil ? input.validUntil.toISOString() : null,
  };
  return enqueueMailJob(db, GIFT_SHARE_CARD_MAIL, payload);
}

registerMailJobDeliverer(GIFT_SHARE_CARD_MAIL, async (raw) => {
  const payload = raw as GiftShareCardPayload;
  await sendGiverShareCardMail({
    to: payload.to,
    giverDisplayName: payload.giverDisplayName,
    giverComment: payload.giverComment,
    receiverName: payload.receiverName,
    receiverToken: payload.receiverToken,
    giverToken: payload.giverToken,
    language: payload.language,
    shareCardStyle: payload.shareCardStyle,
    validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
  });
});
