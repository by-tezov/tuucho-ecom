import type { Request } from 'express';
import {
  getRegisteredLanguage,
  getRegisteredLanguageCodes,
  getRegisteredLanguages,
  isLanguageCodeFormat,
  isRegisteredLanguage,
  type RegisteredLanguage,
} from '@tuucho/plugin-sdk';
import type { PartialTrilingual } from '../types.js';

/** Open language code. Membership is the plugin-sdk registry (builtins en/fr
 * plus any `registerLanguage` call). */
export type Language = string;

/** Builtin codes always present before plugins load. Prefer
 * `getRegisteredLanguageCodes()` or `configuredEnabledLanguages()` at runtime. */
export const LANGUAGES = ['en', 'fr'] as const;

/** Last-resort language when no configured default is reachable (the
 * configured default comes from `i18n.default` / I18N_DEFAULT_LANG, validated
 * at config load in config/env.ts). */
export const FALLBACK_LANGUAGE: Language = 'en';

export function isLanguage(value: string): value is Language {
  return isRegisteredLanguage(value);
}

export {
  getRegisteredLanguage,
  getRegisteredLanguageCodes,
  getRegisteredLanguages,
  isLanguageCodeFormat,
  isRegisteredLanguage,
  type RegisteredLanguage,
};

/** The shop's configured default language (`i18n.default`). Read from the
 * flattened env so this module stays importable without booting the config
 * layer; an unset or somehow-invalid value falls back to FALLBACK_LANGUAGE. */
export function configuredDefaultLanguage(): Language {
  const value = (process.env.I18N_DEFAULT_LANG ?? '').trim().toLowerCase();
  return value && isLanguageCodeFormat(value) ? value : FALLBACK_LANGUAGE;
}

/** The shop's configured enabled languages (`i18n.enabled`). Falls back to
 * every registered language when unset or empty after filtering. */
export function configuredEnabledLanguages(): Language[] {
  const raw = (process.env.I18N_ENABLED_LANGS ?? '').trim();
  const registered = getRegisteredLanguageCodes();
  if (!raw) return [...registered];
  const enabled = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => isLanguageCodeFormat(entry));
  const unique = [...new Set(enabled)];
  return unique.length > 0 ? unique : [...registered];
}

/** Resolves a user's stored `language` preference (see
 * userPreferences.service.ts's getUserPreference — a free-form string column,
 * not a validated enum) to a real Language, same configured-default fallback
 * as languageFromHeader for a missing/stale/invalid value. */
export function languageFromPreference(value: string | null): Language {
  return value !== null && isLanguage(value) ? value : configuredDefaultLanguage();
}

/** Resolves a browser language header to one of Shop's supported
 * languages. A locale such as `fr-FR` maps to `fr`; an unsupported browser
 * language intentionally falls back to the configured default language. */
export function languageFromHeader(header: string | undefined): Language {
  if (!header) return configuredDefaultLanguage();
  const candidates = header
    .split(',')
    .map((part) => {
      const [raw, ...parameters] = part.trim().split(';');
      const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const q = quality ? Number(quality.trim().slice(2)) : 1;
      return { language: raw?.trim().toLowerCase().split('-')[0] ?? '', q: Number.isFinite(q) ? q : 0 };
    })
    .filter((candidate) => candidate.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const candidate of candidates) {
    if (isLanguage(candidate.language)) return candidate.language;
  }
  return configuredDefaultLanguage();
}

export function requestLanguage(req: Request): Language {
  return languageFromHeader(req.header('accept-language'));
}

/** Pick a string from a partial localized map: requested code, then shop
 * default, then en, then fr, then any defined value. */
export function pickLanguage(
  value: Partial<Record<string, string | undefined>> | null | undefined,
  language: string,
  extraFallbacks: string[] = ['en', 'fr'],
): string {
  if (!value) return '';
  const chain = [language, configuredDefaultLanguage(), ...extraFallbacks];
  const seen = new Set<string>();
  for (const code of chain) {
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const hit = value[code];
    if (typeof hit === 'string' && hit) return hit;
  }
  for (const hit of Object.values(value)) {
    if (typeof hit === 'string' && hit) return hit;
  }
  return '';
}

/** A missing translation never causes a multi-language payload: use English
 * first (the public fallback language), then French because it is mandatory
 * for all imported catalog data. */
export function localize(value: PartialTrilingual, language: Language): string {
  return pickLanguage(value, language);
}

/** Pick a structured localized table entry with the same fallback chain as
 * `pickLanguage`. Throws only when the table is empty. */
export function pickLocalized<T>(table: Partial<Record<string, T>>, language: string): T {
  const chain = [language, configuredDefaultLanguage(), 'en', 'fr'];
  const seen = new Set<string>();
  for (const code of chain) {
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const hit = table[code];
    if (hit !== undefined) return hit;
  }
  for (const hit of Object.values(table)) {
    if (hit !== undefined) return hit;
  }
  throw new Error(`No localized entry available for language "${language}".`);
}

/** Fail boot when `i18n.default` / `i18n.enabled` name codes no plugin
 * (or builtin) has registered. Call after plugin `register()` completes. */
export function assertConfiguredLanguagesRegistered(
  defaultLanguage: string,
  enabledLanguages: readonly string[],
): void {
  const codes = [...new Set([defaultLanguage, ...enabledLanguages].filter(Boolean))];
  for (const code of codes) {
    if (!isRegisteredLanguage(code)) {
      throw new Error(
        `i18n lists unregistered language "${code}". A locale plugin must call registerLanguage() for that code (builtins: en, fr).`,
      );
    }
  }
}
