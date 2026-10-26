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

export function giftSelectReminderMail(language: Language): GiftSelectReminderMailCopy {
  return localizedCatalog(language, 'gift-select-reminder');
}
