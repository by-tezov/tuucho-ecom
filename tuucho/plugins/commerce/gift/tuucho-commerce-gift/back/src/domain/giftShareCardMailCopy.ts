import { localizedCatalog } from '@tuucho/plugin-sdk';
import type { Language } from '@kernel/back/utils/language';

export interface GiftShareCardMailCopy {
  subject: (receiverName: string) => string;
  title: string;
  intro: (giverDisplayName: string) => string;
  filesParagraph: string;
  codeParagraph: string;
  securityParagraph: string;
  trackParagraph: string;
  activeUntil: (date: string) => string;
  activeUntilDefault: string;
  ctaLabel: string;
  ctaFallbackHint: string;
}

/** Copy for `giverShareCardEmail` (the PDF/JPG gift card email), one per
 * supported language. `GIVER_PROMISE_MAIL_DATE_LOCALES` (giverPromiseMailCopy.ts)
 * covers the date locale for `activeUntil`. */
export function giftShareCardMail(language: Language): GiftShareCardMailCopy {
  return localizedCatalog(language, 'gift-share-card');
}
