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

/** BCP 47 tags for formatting gift-mail dates. Not customer sentences. */
export const GIVER_PROMISE_MAIL_DATE_LOCALES: Record<Language, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
};

export function giverPromiseMail(language: Language): GiverPromiseMailCopy {
  return localizedCatalog(language, 'giver-promise');
}
