import type { Lang } from '../../assets/i18n/types';

const DATE_LOCALES: Record<Lang, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  th: 'th-TH',
  es: 'es-ES',
  it: 'it-IT',
  nl: 'nl-NL',
  pt: 'pt-PT',
};

export function giftOfferExpiresAt(ttlDays: number, from = new Date()): Date {
  const days = Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : 30;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function formatGiftExpiryDate(at: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[lang], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(at);
}

export function formatShareCardExpiryCaption(at: Date, lang: Lang, useBefore: string): string {
  return `${useBefore}\n${formatGiftExpiryDate(at, lang)}`;
}
