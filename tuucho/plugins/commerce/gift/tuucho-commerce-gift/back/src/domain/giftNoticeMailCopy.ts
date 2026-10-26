import { localizedCatalog } from '@tuucho/plugin-sdk';
import type { Language } from '@kernel/back/utils/language';

/** The giver's short notices: the unpaid gift was cancelled, the payment
 * window is closing. Same informal register as the
 * other gift mails. */
export interface GiftNoticeMailCopy {
  cancelledTitle: string;
  cancelledBody: (receiver: string) => string;
  /** Stands in for the receiver's name when it is unknown. */
  someone: string;
  holdTitle: string;
  payTitle: string;
  reminderBody: string;
  reminderCta: string;
  ctaFallbackHint: string;
}

export function giftNoticeMail(language: Language): GiftNoticeMailCopy {
  return localizedCatalog(language, 'gift-notice');
}
