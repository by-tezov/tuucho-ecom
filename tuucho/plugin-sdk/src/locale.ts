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

/** Values registered by a locale pack for `key:lang`. No embedded language. */
export function localizedCatalog<T>(lang: string, key: string): T {
  const catalog = getEmailCatalog<T>(`${key}:${lang}`);
  if (catalog === undefined) {
    throw new Error(`Email catalog not registered: ${key}:${lang}`);
  }
  return catalog;
}
