import type { Lang } from './types';

export type LanguageMeta = {
  code: Lang;
  nativeName: string;
  ogLocale: string;
  dateLocale?: string;
  /** Absolute URL for the switcher flag when a locale plugin registers one. */
  flagUrl?: string;
};

const builtinMeta: Record<string, LanguageMeta> = {
  en: { code: 'en', nativeName: 'English', ogLocale: 'en_US', dateLocale: 'en-US' },
  fr: { code: 'fr', nativeName: 'Français', ogLocale: 'fr_FR', dateLocale: 'fr-FR' },
};

/** Runtime metadata from bootstrap `i18n.languages`, keyed by code. */
const runtimeMeta = new Map<string, LanguageMeta>();

function defaultMeta(code: string): LanguageMeta {
  const upper = code.toUpperCase();
  return {
    code,
    nativeName: code,
    ogLocale: `${code}_${upper}`,
    dateLocale: `${code}-${upper}`,
  };
}

export function applyLanguageMeta(entries: LanguageMeta[]): void {
  runtimeMeta.clear();
  for (const entry of entries) {
    if (!entry?.code) continue;
    runtimeMeta.set(entry.code, {
      code: entry.code,
      nativeName: entry.nativeName || entry.code,
      ogLocale: entry.ogLocale || defaultMeta(entry.code).ogLocale,
      ...(entry.dateLocale ? { dateLocale: entry.dateLocale } : {}),
      ...(entry.flagUrl ? { flagUrl: entry.flagUrl } : {}),
    });
  }
}

export function languageMeta(code: Lang): LanguageMeta {
  return runtimeMeta.get(code) ?? builtinMeta[code] ?? defaultMeta(code);
}

/** Display order for the language switcher before bootstrap narrows the
 * enabled set. Kept for callers that filter against `shopConfig.enabledLanguages`. */
export const LANGUAGE_ORDER: Lang[] = ['en', 'fr'];

/** Sync switcher order with the build-time (then bootstrap-narrowed) list. */
export function setLanguageOrder(codes: readonly Lang[]): void {
  LANGUAGE_ORDER.splice(0, LANGUAGE_ORDER.length, ...codes);
}

/** Each language's own name. Prefers bootstrap metadata when present. */
export const LANGUAGE_NAMES: Record<string, string> = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      return languageMeta(prop).nativeName;
    },
    has(_target, prop) {
      return typeof prop === 'string';
    },
    ownKeys() {
      return [...LANGUAGE_ORDER];
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      return { configurable: true, enumerable: true, value: languageMeta(prop).nativeName };
    },
  },
) as Record<string, string>;
