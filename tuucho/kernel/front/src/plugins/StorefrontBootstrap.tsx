import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyStorefrontBootstrap, shopConfig } from '../config/env';
import type { StorefrontBootstrap } from './types';

const FALLBACK: StorefrontBootstrap = {
  installed: true,
  store: {
    name: shopConfig.brandName,
    suffix: shopConfig.brandSuffix,
    contactEmail: shopConfig.contactEmail,
    taxMode: 'none',
  },
  taxMode: 'none',
  productAxes: [
    {
      key: 'shape',
      enabled: true,
      hideInUi: false,
      autoHideSingle: true,
      label: { en: 'Shape', fr: 'Forme' },
    },
    {
      key: 'length',
      enabled: true,
      hideInUi: false,
      autoHideSingle: true,
      label: { en: 'Length', fr: 'Longueur' },
    },
    {
      key: 'size',
      enabled: true,
      hideInUi: false,
      autoHideSingle: true,
      label: { en: 'Size', fr: 'Taille' },
    },
  ],
  theme: { tokens: {} },
  i18n: {
    default: 'en',
    enabled: [...(shopConfig.enabledLanguages ?? ['en'])],
    firstVisit: 'navigator',
  },
  brandAssets: {},
  menus: [
    { key: 'home', pluginId: 'page-home', label: 'Home', visible: true, order: 10, bottomBar: true },
    {
      key: 'gallery',
      pluginId: 'core-catalog',
      label: 'Collection',
      visible: true,
      order: 20,
      bottomBar: true,
    },
    {
      key: 'guide',
      pluginId: 'page-guides',
      label: 'Guides',
      visible: true,
      order: 30,
      bottomBar: false,
    },
    {
      key: 'about',
      pluginId: 'page-about',
      label: 'About',
      visible: true,
      order: 40,
      bottomBar: false,
    },
  ],
  plugins: [
    {
      id: 'tuucho-contact',
      enabled: true,
      kind: 'generic',
      required: false,
      name: 'Contact',
      route: '/contact',
    },
  ],
  adminNav: [],
  openings: {
    preferences: [],
    profile: [],
    signInMethods: [],
    notifications: [],
    cartShipping: [],
    cartLines: [],
    orderHistory: [],
  },
  homeRequired: true,
};

const Context = createContext<StorefrontBootstrap>(FALLBACK);
const RefreshContext = createContext<() => void>(() => undefined);

async function loadBootstrap(): Promise<StorefrontBootstrap | null> {
  const response = await fetch(`${shopConfig.apiBaseUrl}/storefront/bootstrap`, { credentials: 'include' });
  if (!response.ok) return null;
  const body = (await response.json()) as { bootstrap?: StorefrontBootstrap };
  return body.bootstrap ?? null;
}

export function StorefrontBootstrapProvider({ children }: { children: ReactNode }) {
  const [bootstrap, setBootstrap] = useState<StorefrontBootstrap>(FALLBACK);

  const refresh = useMemo(
    () => () => {
      void loadBootstrap()
        .then((next) => {
          if (!next) return;
          applyStorefrontBootstrap(next);
          setBootstrap(next);
        })
        .catch(() => undefined);
    },
    [],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <RefreshContext.Provider value={refresh}>
      <Context.Provider value={bootstrap}>{children}</Context.Provider>
    </RefreshContext.Provider>
  );
}

export function useStorefrontBootstrap(): StorefrontBootstrap {
  return useContext(Context);
}

export function useRefreshStorefrontBootstrap(): () => void {
  return useContext(RefreshContext);
}

export function usePluginEnabled(id: string): boolean {
  const { plugins } = useStorefrontBootstrap();
  const found = plugins.find((plugin) => plugin.id === id);
  if (!found) return false;
  return found.enabled;
}
