import type { Lang, Strings } from './types';
import { runtimeDefaultLang } from '../../config/runtimeI18n';
import { assembleDictionary, ensureLocaleCatalogsLoaded } from '../../plugins/localeCatalog';

/** Default language at call time: the bootstrap `i18n.default` once applied,
 * the build-time 'en' before that (prerender / pre-bootstrap paint). */
export function defaultLang(): Lang {
  return runtimeDefaultLang();
}

const cache: Partial<Record<Lang, Strings>> = {};

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
 * Dictionaries are assembled by LanguageContext from locale packs.
 */
export function isRuntimeDictionary(dict: Strings): boolean {
  return typeof dict.checkoutSessionExpired?.message === 'function';
}

export async function loadDictionary(lang: Lang): Promise<Strings> {
  const cached = cache[lang];
  if (cached && isRuntimeDictionary(cached)) return cached;
  await ensureLocaleCatalogsLoaded();
  const assembled = assembleDictionary(lang, 'all');
  cache[lang] = assembled;
  return assembled;
}
