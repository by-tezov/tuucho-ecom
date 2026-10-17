import type { Lang, Strings } from './types';
import { fr } from './strings.fr';

export const defaultLang: Lang = 'fr';

// fr is bundled eagerly — it's what the prerendered HTML (and every first
// paint, before hydration picks up a stored preference) is generated with.
// Every other language is a separate chunk, fetched only once it's actually
// selected — with 7 full translations, eagerly bundling all of them roughly
// tripled the JS payload for visitors who only ever see one.
const dynamicLoaders: Record<Exclude<Lang, 'fr'>, () => Promise<Record<string, Strings>>> = {
  en: () => import('./strings.en'),
  th: () => import('./strings.th'),
  es: () => import('./strings.es'),
  it: () => import('./strings.it'),
  nl: () => import('./strings.nl'),
  pt: () => import('./strings.pt'),
};

const cache: Partial<Record<Lang, Strings>> = { fr };

export function getCachedDictionary(lang: Lang): Strings | undefined {
  return cache[lang];
}

/**
 * Prerender embeds dictionaries with `JSON.stringify`, which drops every
 * function formatter (`onboarding.stepAria`, `auth.otpHint`, …). Those
 * payloads match static SSR text but are not safe as the live runtime dict —
 * calling a missing formatter throws and trips `AppErrorBoundary`.
 */
export function isRuntimeDictionary(dict: Strings): boolean {
  return typeof dict.onboarding?.stepAria === 'function';
}

export async function loadDictionary(lang: Lang): Promise<Strings> {
  const cached = cache[lang];
  if (cached && isRuntimeDictionary(cached)) return cached;
  const mod = await dynamicLoaders[lang as Exclude<Lang, 'fr'>]();
  const dict = mod[lang];
  if (!dict) throw new Error(`Missing dictionary export for ${lang}`);
  cache[lang] = dict;
  return dict;
}
