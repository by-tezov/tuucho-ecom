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
  alsoActiveOn?: string[];
}

export interface StorefrontPlugin {
  id: string;
  enabled: boolean;
  kind: string;
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
  menus: StorefrontMenuItem[];
  plugins: StorefrontPlugin[];
  adminNav?: StorefrontAdminNavItem[];
  openings?: CoreOpenings;
  homeRequired: boolean;
}
