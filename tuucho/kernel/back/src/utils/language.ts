import type { Request } from 'express';
import type { PartialTrilingual } from '../types.js';

export const LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Last-resort language when no configured default is reachable (the
 * configured default comes from `i18n.default` / I18N_DEFAULT_LANG, validated
 * at config load in config/env.ts). */
export const FALLBACK_LANGUAGE: Language = 'en';

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

/** The shop's configured default language (`i18n.default`). Read from the
 * flattened env so this module stays importable without booting the config
 * layer; an unset or somehow-invalid value falls back to FALLBACK_LANGUAGE. */
export function configuredDefaultLanguage(): Language {
  const value = (process.env.I18N_DEFAULT_LANG ?? '').trim().toLowerCase();
  return isLanguage(value) ? value : FALLBACK_LANGUAGE;
}

/** The shop's configured enabled languages (`i18n.enabled`), intersected with
 * the supported list. Falls back to every supported language. */
export function configuredEnabledLanguages(): Language[] {
  const raw = (process.env.I18N_ENABLED_LANGS ?? '').trim();
  if (!raw) return [...LANGUAGES];
  const enabled = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is Language => isLanguage(entry));
  return enabled.length > 0 ? [...new Set(enabled)] : [...LANGUAGES];
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

/** A missing translation never causes a multi-language payload: use English
 * first (the public fallback language), then French because it is mandatory
 * for all imported catalog data. */
export function localize(value: PartialTrilingual, language: Language): string {
  return value[language] || value.en || value.fr || '';
}
