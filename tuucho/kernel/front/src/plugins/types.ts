export interface StorefrontAxis {
  key: 'shape' | 'length' | 'size';
  enabled: boolean;
  hideInUi: boolean;
  autoHideSingle: boolean;
  label: Record<string, string>;
}

export interface StorefrontMenuItem {
  key: string;
  pluginId: string;
  label: string;
  visible: boolean;
  order: number;
  bottomBar: boolean;
}

export interface StorefrontAdminNavItem {
  id: string;
  pluginId: string;
  group: string;
  to: string;
  permission: string;
  order?: number;
  label: string;
  labelKey?: string;
  alsoActiveOn?: string[];
}

export interface StorefrontPlugin {
  id: string;
  enabled: boolean;
  kinds: string[];
  required: boolean;
  name: string;
  route?: string;
  nav?: { key: string; order: number; bottomBar?: boolean };
  dependsOn?: string[];
  adminNav?: StorefrontAdminNavItem[];
  settings?: Record<string, unknown>;
}

/** Plugin contributions into core surfaces (preferences, profile, sign-in,
 * notifications). Empty until a plugin registers a filter. */
export interface CoreOpeningEntry {
  id: string;
  pluginId: string;
  title: string;
  description?: string;
  href?: string;
}

export interface CoreOpenings {
  preferences: CoreOpeningEntry[];
  profile: CoreOpeningEntry[];
  signInMethods: CoreOpeningEntry[];
  notifications: CoreOpeningEntry[];
  cartShipping?: CoreOpeningEntry[];
  cartLines?: CoreOpeningEntry[];
  orderHistory?: CoreOpeningEntry[];
}

export interface StorefrontBootstrap {
  installed: boolean;
  coreVersion?: string;
  store: {
    name: string;
    suffix: string;
    contactEmail: string;
    taxMode: 'none';
  };
  taxMode: 'none';
  productAxes: StorefrontAxis[];
  theme: { tokens: Record<string, string>; logoText?: string; suffixText?: string };
  /** Runtime language contract: `default` is the shop's configured fallback
   * language, `enabled` narrows the build-time `VITE_ENABLED_LANGUAGES` set
   * (intersection), `firstVisit` is `navigator` | `default` for visitors with
   * no stored language, `languages` carries native name / OG / date metadata
   * for enabled codes. Consumed by `applyStorefrontBootstrap` (env.ts). */
  i18n: {
    default: string;
    enabled: string[];
    firstVisit?: 'navigator' | 'default';
    languages?: Array<{
      code: string;
      nativeName: string;
      ogLocale: string;
      dateLocale?: string;
      flagUrl?: string;
    }>;
  };
  /** Brand artwork overrides (key -> image URL) from the
   * `storefront.bootstrap` filter; keys are BRAND_ASSET_KEYS. Empty in the
   * kernel payload: kernel demo images stay the default. */
  brandAssets: Record<string, string>;
  menus: StorefrontMenuItem[];
  plugins: StorefrontPlugin[];
  adminNav?: StorefrontAdminNavItem[];
  openings?: CoreOpenings;
  homeRequired: boolean;
}
