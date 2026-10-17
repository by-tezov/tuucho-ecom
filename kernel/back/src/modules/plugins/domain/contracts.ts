/** Plugin contracts. Core owns these types; plugins implement them. */

import type { PluginDependency } from './pluginDependency.js';

export type { PluginDependency } from './pluginDependency.js';

export type PluginKind =
  | 'theme'
  | 'page'
  | 'payment'
  | 'shipping'
  | 'commerce'
  | 'docs'
  | 'generic'
  | 'seo'
  | 'locale';

export type DependsOnMode = 'all' | 'any';

export interface PluginSettingField {
  type: 'string' | 'text' | 'number' | 'boolean';
  label?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  kind: PluginKind;
  /** Operator-facing summary of what the plugin does. Required except locale plugins. */
  description: string;
  required?: boolean;
  defaultEnabled?: boolean;
  provides?: string[];
  /** Other plugin ids this one needs. Strings mean any version; objects pin a range. */
  dependsOn?: PluginDependency[];
  /** `all` (default) requires every parent; `any` requires at least one. */
  dependsOnMode?: DependsOnMode;
  /** Semver range of the kernel this plugin may run on, e.g. `>=1.0.0 <2.0.0`. */
  engines?: { core?: string };
  /** Storefront route (page plugins). */
  route?: string;
  /** Nav / bottom-bar placement. */
  nav?: { key: string; order: number; bottomBar?: boolean };
  /** Shipping plugins: courier codes this plugin owns. */
  courierCodes?: string[];
  /** Seeded into `plugins.settings` on first install. */
  defaultSettings?: Record<string, unknown>;
  /** Auto-form fields on the plugin Configure page. */
  settingsSchema?: Record<string, PluginSettingField>;
  /** Permissions this plugin adds to Admin, Roles. Hidden while the plugin
   * (or a dependsOn parent) is off. Core does not hardcode these codes. */
  permissions?: Array<{ code: string; label: string }>;
  adminNav?: Array<{
    id: string;
    group: string;
    to: string;
    permission: string;
    order?: number;
    label?: string;
    alsoActiveOn?: string[];
  }>;
  /** Absolute plugin package directory (the folder that holds plugin.json). */
  sourceDir?: string;
  /**
   * Repo-relative posix path of the package folder (leaf equals `id`).
   * Tuucho ids use `plugins/tuucho/…`; user ids use `plugins/user/…`.
   */
  installPath?: string;
  /**
   * HTTPS GitHub repo root for Check / Apply of this user plugin only.
   * Ignored on `tuucho-*` ids.
   */
  repository?: string;
}

export interface ThemeTokens {
  [cssVariable: string]: string;
}

export interface ThemeContract {
  id: string;
  tokens: ThemeTokens;
  fonts?: { display?: string; body?: string };
}

export interface StorefrontPageContract {
  id: string;
  route: string;
  navKey: string;
  required?: boolean;
}

export interface PaymentGatewayContract {
  id: string;
  methods: string[];
}

export interface ShippingMethodContract {
  id: string;
  courierCodes: string[];
}

export type HookFn = (...args: unknown[]) => unknown | Promise<unknown>;
export type FilterFn<T = unknown> = (value: T, ...args: unknown[]) => T | Promise<T>;
