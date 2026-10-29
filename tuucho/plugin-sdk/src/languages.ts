/** Product language registry. Kernel seeds en/fr; locale plugins may add more. */

export const LANGUAGE_CODE_RE = /^[a-z]{2,3}$/;

export type RegisteredLanguage = {
  /** Lowercase primary subtag (`en`, `fr`, `th`, …). */
  code: string;
  /** Switcher label in the language's own script. */
  nativeName: string;
  /** Open Graph locale (`en_US`, `fr_FR`, `th_TH`). */
  ogLocale: string;
  /** Optional BCP-47 tag for `Intl` date formatting (`en-US`). */
  dateLocale?: string;
  /** Optional absolute URL for the language switcher flag (SVG/PNG). */
  flagUrl?: string;
};

const BUILTIN_LANGUAGES: readonly RegisteredLanguage[] = [
  { code: 'en', nativeName: 'English', ogLocale: 'en_US', dateLocale: 'en-US' },
  { code: 'fr', nativeName: 'Français', ogLocale: 'fr_FR', dateLocale: 'fr-FR' },
];

const languages = new Map<string, RegisteredLanguage>();

function seedBuiltins(): void {
  languages.clear();
  for (const entry of BUILTIN_LANGUAGES) {
    languages.set(entry.code, { ...entry });
  }
}

seedBuiltins();

export function isLanguageCodeFormat(code: string): boolean {
  return LANGUAGE_CODE_RE.test(code);
}

export function registerLanguage(def: RegisteredLanguage): void {
  const code = def.code.trim().toLowerCase();
  if (!isLanguageCodeFormat(code)) {
    throw new Error(
      `registerLanguage: code must match ${LANGUAGE_CODE_RE} (got "${def.code}").`,
    );
  }
  const nativeName = def.nativeName?.trim() ?? '';
  if (!nativeName) {
    throw new Error(`registerLanguage(${code}): nativeName is required.`);
  }
  const ogLocale = def.ogLocale?.trim() ?? '';
  if (!ogLocale) {
    throw new Error(`registerLanguage(${code}): ogLocale is required.`);
  }
  const dateLocale = def.dateLocale?.trim();
  const flagUrl = def.flagUrl?.trim();
  languages.set(code, {
    code,
    nativeName,
    ogLocale,
    ...(dateLocale ? { dateLocale } : {}),
    ...(flagUrl ? { flagUrl } : {}),
  });
}

/** Clears plugin registrations and restores builtin en/fr. */
export function resetLanguages(): void {
  seedBuiltins();
}

export function getRegisteredLanguages(): RegisteredLanguage[] {
  return [...languages.values()];
}

export function getRegisteredLanguageCodes(): string[] {
  return [...languages.keys()];
}

export function getRegisteredLanguage(code: string): RegisteredLanguage | undefined {
  return languages.get(code.trim().toLowerCase());
}

export function isRegisteredLanguage(code: string): boolean {
  return languages.has(code.trim().toLowerCase());
}
