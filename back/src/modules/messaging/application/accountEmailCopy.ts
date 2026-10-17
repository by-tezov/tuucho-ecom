import type { Language } from '../../../utils/language.js';
import {
  ACCOUNT_EMAIL_COPY_EN,
  ACCOUNT_EMAIL_COPY_ES,
  ACCOUNT_EMAIL_COPY_FR,
} from './accountEmailCopyFrEn.js';
import {
  ACCOUNT_EMAIL_COPY_IT,
  ACCOUNT_EMAIL_COPY_NL,
  ACCOUNT_EMAIL_COPY_PT,
  ACCOUNT_EMAIL_COPY_TH,
} from './accountEmailCopyMore.js';
import type { AccountEmailCopy } from './accountEmailCopyTypes.js';

/** Copy of the account and service emails (accountEmails.ts), in the formal
 * register of the order emails. */
export const ACCOUNT_EMAIL_COPY: Record<Language, AccountEmailCopy> = {
  fr: ACCOUNT_EMAIL_COPY_FR,
  en: ACCOUNT_EMAIL_COPY_EN,
  es: ACCOUNT_EMAIL_COPY_ES,
  it: ACCOUNT_EMAIL_COPY_IT,
  nl: ACCOUNT_EMAIL_COPY_NL,
  pt: ACCOUNT_EMAIL_COPY_PT,
  th: ACCOUNT_EMAIL_COPY_TH,
};

const DATE_LOCALES: Record<Language, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  es: 'es-ES',
  it: 'it-IT',
  nl: 'nl-NL',
  pt: 'pt-PT',
  th: 'th-TH',
};

/** A `YYYY-MM-DD` day as the reader writes dates ("5 novembre 2026"). */
export function formatEmailDay(day: string, language: Language): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(DATE_LOCALES[language], { dateStyle: 'long', timeZone: 'UTC' });
}

/** An instant as the reader writes it, in the shop's time zone
 * ("7 octobre 2026 à 14:32 UTC+2"). */
export function formatEmailMoment(at: Date, language: Language): string {
  // Explicit parts: `dateStyle` cannot be combined with `timeZoneName`.
  return at.toLocaleString(DATE_LOCALES[language], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
    timeZoneName: 'short',
  });
}
