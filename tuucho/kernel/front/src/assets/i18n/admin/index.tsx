import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useLang } from '..';
import type { AdminUiStrings } from './types';
import { adminUi as en } from './strings/en';
import {
  assembleAdminDictionary,
  localeCatalogRevision,
  localeEnablement,
  subscribeLocaleCatalogs,
} from '../../../plugins/localeCatalog';
import { useStorefrontBootstrap } from '../../../plugins/StorefrontBootstrap';

export type { AdminUiStrings } from './types';

const AdminStringsContext = createContext<AdminUiStrings | null>(null);

/** Loads the administration copy for the current language. Kernel English is
 * the base; French comes from locale-fr when that plugin is on. */
export function AdminStringsProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const { lang } = useLang();
  const bootstrap = useStorefrontBootstrap();
  const catalogsRev = useSyncExternalStore(subscribeLocaleCatalogs, localeCatalogRevision, localeCatalogRevision);
  const strings = useMemo(
    () => assembleAdminDictionary(en, lang, localeEnablement(bootstrap.plugins)),
    [lang, bootstrap.plugins, catalogsRev],
  );

  if (!strings) return <>{fallback}</>;
  return <AdminStringsContext.Provider value={strings}>{children}</AdminStringsContext.Provider>;
}

/** The administration copy in the current language. */
export function useAdminStrings(): AdminUiStrings {
  const strings = useContext(AdminStringsContext);
  if (!strings) throw new Error('useAdminStrings must be used within AdminStringsProvider');
  return strings;
}
