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

export const GIFT_NOTICE_MAIL: { en: GiftNoticeMailCopy } = {
  en: {
    cancelledTitle: 'Unpaid gift',
    cancelledBody: (receiver) => `The gift for ${receiver} has been cancelled. No order was created.`,
    someone: 'the recipient',
    holdTitle: 'Stock will soon no longer be guaranteed',
    payTitle: 'Last days to pay',
    reminderBody: 'Open the gift link to pay. Nothing is charged automatically.',
    reminderCta: 'Pay for the gift',
    ctaFallbackHint: 'If the button does not work, you can use this link:',
  },
};

export function giftNoticeMail(language: Language): GiftNoticeMailCopy {
  return localizedCatalog(GIFT_NOTICE_MAIL.en, language, 'gift-notice');
}
