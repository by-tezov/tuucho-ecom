const emailCatalogs = new Map<string, unknown>();

export function registerEmailCatalog(lang: string, catalog: unknown): void {
  emailCatalogs.set(lang, catalog);
}

export function getEmailCatalog<T = unknown>(lang: string): T | undefined {
  return emailCatalogs.get(lang) as T | undefined;
}

export function resetEmailCatalogs(): void {
  emailCatalogs.clear();
}

/** English record plus optional overlay registered by a locale plugin. */
export function localizedCatalog<T>(en: T, lang: string, key: string): T {
  if (lang === 'en') return en;
  return getEmailCatalog<T>(`${key}:${lang}`) ?? en;
}
