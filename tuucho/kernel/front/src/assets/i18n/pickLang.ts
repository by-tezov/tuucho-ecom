import type { Lang } from './types';

/** Pick a string from a partial localized map with a short fallback chain. */
export function pickLang(
  value: Partial<Record<string, string>> | null | undefined,
  lang: Lang,
  fallbacks: string[] = ['en', 'fr'],
): string {
  if (!value) return '';
  const chain = [lang, ...fallbacks];
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

/** Pick a structured localized table entry. */
export function pickLangEntry<T>(table: Partial<Record<string, T>>, lang: Lang, fallbacks: string[] = ['en', 'fr']): T {
  const chain = [lang, ...fallbacks];
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
  throw new Error(`No localized entry for language "${lang}".`);
}
