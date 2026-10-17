import type { Lang } from './types';
import { shopConfig } from '../../config/env';

const LANGUAGE_STORAGE_KEY = 'psn-lang';
const fallbackLanguage: Lang = 'en';

function isEnabled(language: string | null): language is Lang {
  return language !== null && shopConfig.enabledLanguages.includes(language as Lang);
}

/** The stored choice always wins. Without one, use the first supported
 * browser/system locale (for example `fr-FR` -> `fr`), otherwise English. */
export function preferredLanguage(): Lang {
  if (typeof window === 'undefined') return fallbackLanguage;
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isEnabled(stored)) return stored;

  const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const locale of locales) {
    const language = locale.toLowerCase().split('-')[0] ?? '';
    if (isEnabled(language)) return language;
  }
  return fallbackLanguage;
}

export function savePreferredLanguage(language: Lang): void {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}
