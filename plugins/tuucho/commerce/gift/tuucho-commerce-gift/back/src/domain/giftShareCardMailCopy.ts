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
export const GIFT_SHARE_CARD_MAIL: { en: GiftShareCardMailCopy } = {
  en: {
    subject: (receiverName) => `Gift card for ${receiverName}`,
    title: 'Your gift card is ready',
    intro: (giverDisplayName) => `Hi ${giverDisplayName},`,
    filesParagraph:
      'Two files are attached to this email: a PDF and a JPG. The PDF places your 5 x 3 inch card on an A4 page. Print it and cut along the dotted line. The JPG is the card alone, same size, ready to send as is.',
    codeParagraph:
      'Also give the 4-digit code chosen at creation. Without this code, the gift cannot be opened. The code also lets you access the gift space to complete payment. Do not forget this code, without it you cannot finalize your gift.',
    securityParagraph:
      'For extra security, do not share the code through the same channel as the card or the link: for example, print the card and send the code by text message.',
    trackParagraph: 'To track the gift or pay later, open your gift space.',
    activeUntil: (date) => `The gift offer stays active until ${date}.`,
    activeUntilDefault: 'The gift offer stays active for the duration set in the shop.',
    ctaLabel: 'Your gift space',
    ctaFallbackHint: 'If the button does not work, you can use this link:',
  },
};

export function giftShareCardMail(language: Language): GiftShareCardMailCopy {
  return localizedCatalog(GIFT_SHARE_CARD_MAIL.en, language, 'gift-share-card');
}
