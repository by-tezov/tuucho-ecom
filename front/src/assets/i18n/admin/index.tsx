import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLang } from '..';
import type { Lang } from '../types';
import type { AdminUiStrings } from './types';

export type { AdminUiStrings } from './types';

/** Every language is its own chunk, French included: the administration is
 * lazy, so none of its copy belongs in the shop's entry bundle. */
const loaders: Record<Lang, () => Promise<{ adminUi: AdminUiStrings }>> = {
  fr: () => import('./strings/fr'),
  en: () => import('./strings/en'),
  th: () => import('./strings/th'),
  es: () => import('./strings/es'),
  it: () => import('./strings/it'),
  nl: () => import('./strings/nl'),
  pt: () => import('./strings/pt'),
};

const cache: Partial<Record<Lang, AdminUiStrings>> = {};

const AdminStringsContext = createContext<AdminUiStrings | null>(null);

/** Loads the administration copy for the current language. Children render
 * once it is there; a language switch keeps the previous copy on screen
 * until the new one has loaded. */
export function AdminStringsProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const { lang } = useLang();
  const [strings, setStrings] = useState<AdminUiStrings | null>(() => cache[lang] ?? null);

  useEffect(() => {
    const cached = cache[lang];
    if (cached) {
      setStrings(cached);
      return;
    }
    let cancelled = false;
    void loaders[lang]()
      .then((module) => {
        cache[lang] = module.adminUi;
        if (!cancelled) setStrings(module.adminUi);
      })
      .catch(() =>
        // A failed chunk (offline, redeploy) falls back to French rather than
        // leaving the administration blank.
        loaders.fr().then((module) => {
          if (!cancelled) setStrings(module.adminUi);
        }),
      );
    return () => {
      cancelled = true;
    };
  }, [lang]);

  if (!strings) return <>{fallback}</>;
  return <AdminStringsContext.Provider value={strings}>{children}</AdminStringsContext.Provider>;
}

/** The administration copy in the current language. */
export function useAdminStrings(): AdminUiStrings {
  const strings = useContext(AdminStringsContext);
  if (!strings) throw new Error('useAdminStrings must be used within AdminStringsProvider');
  return strings;
}
