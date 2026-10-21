import { localizedCatalog } from '@tuucho/plugin-sdk';
import type { Language } from '@kernel/back/utils/language';

/** Giver mail sent `GIFT_SELECT_REMINDER_BEFORE` ahead of `offer_expires_at`
 * while the receiver has still not confirmed a choice. The receiver's email
 * is never stored, so the giver is the one who can nudge them. */
export interface GiftSelectReminderMailCopy {
  subject: (receiverName: string) => string;
  title: (receiverName: string) => string;
  notChosen: (receiverName: string) => string;
  activeUntil: (date: string) => string;
  extend: (extendDays: number) => string;
  ctaLabel: string;
  ctaFallbackHint: string;
}

export const GIFT_SELECT_REMINDER_MAIL: { en: GiftSelectReminderMailCopy } = {
  en: {
    subject: (n) => `${n} has not chosen their gift yet`,
    title: (n) => `${n} has not chosen their gift yet`,
    notChosen: (n) => `${n} has not confirmed a choice yet. You can send them the link again from your gift space.`,
    activeUntil: (date) => `The gift offer expires on ${date}.`,
    extend: (days) => `Need more time? From your gift space, you can extend the offer by ${days} days.`,
    ctaLabel: 'Your gift space',
    ctaFallbackHint: 'If the button does not work, you can use this link:',
  },
};

export function giftSelectReminderMail(language: Language): GiftSelectReminderMailCopy {
  return localizedCatalog(GIFT_SELECT_REMINDER_MAIL.en, language, 'gift-select-reminder');
}
