import type { Lang } from './types';
import { shopConfig } from '../../config/env';
import {
  hasRuntimeDefaultLang,
  runtimeDefaultLang,
  runtimeFirstVisit,
} from '../../config/runtimeI18n';

const LANGUAGE_STORAGE_KEY = 'psn-lang';

function isEnabled(language: string | null): language is Lang {
  return language !== null && shopConfig.enabledLanguages.includes(language as Lang);
}

function navigatorLanguage(): Lang | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const locale of locales) {
    const language = locale.toLowerCase().split('-')[0] ?? '';
    if (isEnabled(language)) return language;
  }
  return null;
}

/** The stored choice always wins. Without one: after bootstrap, follow
 * `i18n.firstVisit` (`navigator` = browser locale then shop default;
 * `default` = shop `i18n.default` only). Before bootstrap, keep navigator →
 * build-time `en` so cold paint stays stable. */
export function preferredLanguage(): Lang {
  if (typeof window === 'undefined') return runtimeDefaultLang();
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isEnabled(stored)) return stored;

  if (hasRuntimeDefaultLang() && runtimeFirstVisit() === 'default') {
    return runtimeDefaultLang();
  }

  return navigatorLanguage() ?? runtimeDefaultLang();
}

export function savePreferredLanguage(language: Lang): void {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

/** Active UI language for API headers and feed keys: prefer `<html lang>`
 * (kept in sync with URL / LanguageContext) over storage-only preference. */
export function activeLanguage(): Lang {
  if (typeof document !== 'undefined') {
    const htmlLang = document.documentElement.lang?.toLowerCase().split('-')[0] ?? '';
    if (isEnabled(htmlLang)) return htmlLang;
  }
  return preferredLanguage();
}
