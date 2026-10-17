import { localizedCatalog } from '@tuucho/plugin-sdk';
import type { Language } from '@kernel/back/utils/language';

export interface GiverPromiseMailCopy {
  subject: (receiverName: string) => string;
  title: (receiverName: string) => string;
  body: string;
  activeUntil: (date: string) => string;
  stockReservedUntil: (receiverName: string, date: string) => string;
  ctaLabel: string;
  ctaFallbackHint: string;
}

export const GIVER_PROMISE_MAIL_DATE_LOCALES: Record<Language, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
};

export const GIVER_PROMISE_MAIL: { en: GiverPromiseMailCopy } = {
  en: {
    subject: (receiverName) => `${receiverName} confirmed their choice`,
    title: (receiverName) => `${receiverName} confirmed their choice`,
    body: 'Open your gift space to check the order and pay.',
    activeUntil: (date) => `The gift offer stays active until ${date}.`,
    stockReservedUntil: (n, date) =>
      `The stock ${n} chose is reserved for you until ${date}. After that, the stock will be released.`,
    ctaLabel: 'Your gift space',
    ctaFallbackHint: 'If the button does not work, you can use this link:',
  },
};

export function giverPromiseMail(language: Language): GiverPromiseMailCopy {
  return localizedCatalog(GIVER_PROMISE_MAIL.en, language, 'giver-promise');
}
