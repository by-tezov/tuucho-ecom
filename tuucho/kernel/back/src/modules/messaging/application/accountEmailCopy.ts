import { getRegisteredLanguage, localizedCatalog } from '@tuucho/plugin-sdk';
import { pickLanguage, type Language } from '../../../utils/language.js';
import type { AccountEmailCopy } from './accountEmailCopyTypes.js';

export type { AccountEmailCopy } from './accountEmailCopyTypes.js';

/** Account/service email values from the active language's locale pack. */
export function accountEmailCopy(language: Language): AccountEmailCopy {
  return localizedCatalog(language, 'account-email');
}

const DATE_LOCALES: Partial<Record<string, string>> = {
  fr: 'fr-FR',
  en: 'en-GB',
};

function dateLocaleFor(language: Language): string {
  // Prefer the email-specific map (en uses en-GB day-month order), then the
  // language registry, then a safe Intl default.
  return (
    pickLanguage(DATE_LOCALES, language) ||
    getRegisteredLanguage(language)?.dateLocale ||
    'en-GB'
  );
}

/** A `YYYY-MM-DD` day as the reader writes dates ("5 novembre 2026"). */
export function formatEmailDay(day: string, language: Language): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(dateLocaleFor(language), { dateStyle: 'long', timeZone: 'UTC' });
}

/** An instant as the reader writes it, in the shop's time zone
 * ("7 octobre 2026 à 14:32 UTC+2"). */
export function formatEmailMoment(at: Date, language: Language): string {
  // Explicit parts: `dateStyle` cannot be combined with `timeZoneName`.
  return at.toLocaleString(dateLocaleFor(language), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
    timeZoneName: 'short',
  });
}
