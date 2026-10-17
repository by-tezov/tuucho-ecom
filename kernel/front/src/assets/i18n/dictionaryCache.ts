import type { Lang, Strings } from './types';
import { en } from './strings.en';

export const defaultLang: Lang = 'en';

const cache: Partial<Record<Lang, Strings>> = { en };

export function getCachedDictionary(lang: Lang): Strings | undefined {
  return cache[lang];
}

export function setCachedDictionary(lang: Lang, dict: Strings): void {
  cache[lang] = dict;
}

/**
 * Prerender embeds dictionaries with `JSON.stringify`, which drops every
 * function formatter (`auth.otpHint`, `checkoutSessionExpired.message`, …).
 * Those payloads match static SSR text but are not safe as the live runtime dict.
 * French is assembled by LanguageContext from locale plugins.
 */
export function isRuntimeDictionary(dict: Strings): boolean {
  return typeof dict.checkoutSessionExpired?.message === 'function';
}

export async function loadDictionary(lang: Lang): Promise<Strings> {
  const cached = cache[lang];
  if (cached && isRuntimeDictionary(cached)) return cached;
  cache.en = en;
  return cache[lang] ?? en;
}
