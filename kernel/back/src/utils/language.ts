import type { Request } from 'express';
import type { PartialTrilingual } from '../types.js';

export const LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

/** Resolves a user's stored `language` preference (see
 * userPreferences.service.ts's getUserPreference — a free-form string column,
 * not a validated enum) to a real Language, same English fallback as
 * languageFromHeader for a missing/stale/invalid value. */
export function languageFromPreference(value: string | null): Language {
  return value !== null && isLanguage(value) ? value : 'en';
}

/** Resolves a browser language header to one of Shop's supported
 * languages. A locale such as `fr-FR` maps to `fr`; an unsupported browser
 * language intentionally falls back to English. */
export function languageFromHeader(header: string | undefined): Language {
  if (!header) return 'en';
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
  return 'en';
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
