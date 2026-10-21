import type { Language } from '../../../utils/language.js';
import { localizedCatalog } from '@tuucho/plugin-sdk';
import { ACCOUNT_EMAIL_COPY_EN } from './accountEmailCopyFrEn.js';
import type { AccountEmailCopy } from './accountEmailCopyTypes.js';

/** English account/service email copy. French is locale-fr (`account-email:fr`). */
export function accountEmailCopy(language: Language): AccountEmailCopy {
  return localizedCatalog(ACCOUNT_EMAIL_COPY_EN, language, 'account-email');
}

export const ACCOUNT_EMAIL_COPY: { en: AccountEmailCopy } = {
  en: ACCOUNT_EMAIL_COPY_EN,
};

const DATE_LOCALES: Record<Language, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
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
