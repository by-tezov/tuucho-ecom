import type { Pool } from 'pg';
import { pool } from '../../../db/pool.js';
import type { PluginManifest } from '../domain/contracts.js';

export type TaxMode = 'none';

export interface ProductAxisSetting {
  key: 'shape' | 'length' | 'size';
  enabled: boolean;
  hideInUi: boolean;
  autoHideSingle: boolean;
  label: Record<string, string>;
}

export interface StoreIdentity {
  name: string;
  suffix: string;
  contactEmail: string;
  legalStatus: string;
  legalSiren: string;
  legalAddress: string;
  vatMention: string;
  phone?: string;
  taxMode: TaxMode;
}

const DEFAULT_IDENTITY: StoreIdentity = {
  name: 'Shop',
  suffix: '',
  contactEmail: 'hello@shop.example',
  legalStatus: 'Entreprise individuelle (micro-entrepreneur)',
  legalSiren: '000 000 000',
  legalAddress: 'France',
  vatMention: 'TVA non applicable, art. 293 B du CGI',
  taxMode: 'none',
};

let identityCache: StoreIdentity = DEFAULT_IDENTITY;

export interface StoreMenuItem {
  key: string;
  pluginId: string;
  label: string;
  visible: boolean;
  order: number;
  bottomBar: boolean;
}

export interface ThemeCustomization {
  tokens: Record<string, string>;
  logoText?: string;
  suffixText?: string;
}

const DEFAULT_AXES: ProductAxisSetting[] = [
  {
    key: 'shape',
    enabled: true,
    hideInUi: false,
    autoHideSingle: true,
    label: { fr: 'Forme', en: 'Shape', es: 'Forma', it: 'Forma', nl: 'Vorm', pt: 'Forma', th: 'รูปทรง' },
  },
  {
    key: 'length',
    enabled: true,
    hideInUi: false,
    autoHideSingle: true,
    label: {
      fr: 'Longueur',
      en: 'Length',
      es: 'Largo',
      it: 'Lunghezza',
      nl: 'Lengte',
      pt: 'Comprimento',
      th: 'ความยาว',
    },
  },
  {
    key: 'size',
    enabled: true,
    hideInUi: false,
    autoHideSingle: true,
    label: { fr: 'Taille', en: 'Size', es: 'Talla', it: 'Taglia', nl: 'Maat', pt: 'Tamanho', th: 'ไซซ์' },
  },
];

/* Empty overlay: first-install uses CSS `light-dark()` in theme.css (white /
   near-black in light, the same system grayed darker in dark). Configure
   writes hex tokens here only after the merchant picks colours. */
const DEFAULT_THEME: ThemeCustomization = {
  tokens: {},
};

const DEFAULT_MENUS: StoreMenuItem[] = [
  { key: 'home', pluginId: 'page-home', label: 'Home', visible: true, order: 10, bottomBar: true },
  { key: 'gallery', pluginId: 'core-catalog', label: 'Collection', visible: true, order: 20, bottomBar: true },
  { key: 'guide', pluginId: 'page-guides', label: 'Guides', visible: true, order: 30, bottomBar: false },
  { key: 'about', pluginId: 'page-about', label: 'About', visible: true, order: 40, bottomBar: false },
];

/** Legal pages are footer-only (user plugin page-legal, formerly
 * tuucho-page-legal). Studio-note and the demo profile plugin are gone.
 * Guides moved from tuucho-page-guides to page-guides. Home/About
 * moved from tuucho-page-* to user example packs page-home / page-about. */
const DROPPED_MENU_KEYS = new Set(['legal', 'studio-note']);
const DROPPED_MENU_PLUGIN_IDS = new Set([
  'page-legal',
  'tuucho-page-legal',
  'page-accessibility',
  'tuucho-page-studio-note',
  'demo-checkout-profile',
]);

function remapMenuPluginId(item: StoreMenuItem): StoreMenuItem {
  if (item.key === 'guide' || item.pluginId === 'tuucho-page-guides' || item.pluginId === 'demo-page-guides') {
    return { ...item, key: 'guide', pluginId: 'page-guides' };
  }
  if (item.key === 'home' || item.pluginId === 'tuucho-page-home' || item.pluginId === 'page-home') {
    return { ...item, key: 'home', pluginId: 'page-home' };
  }
  if (item.key === 'about' || item.pluginId === 'tuucho-page-about' || item.pluginId === 'page-about') {
    return { ...item, key: 'about', pluginId: 'page-about' };
  }
  return item;
}

function canonicalStoreMenus(menus: StoreMenuItem[]): StoreMenuItem[] {
  return menus
    .filter((item) => !DROPPED_MENU_KEYS.has(item.key) && !DROPPED_MENU_PLUGIN_IDS.has(item.pluginId))
    .map(remapMenuPluginId);
}

async function readJson<T>(key: string, fallback: T, db: Pool): Promise<T> {
  const { rows } = await db.query<{ value: T }>(`select value from app_preferences where key = $1`, [key]);
  return rows[0]?.value ?? fallback;
}

async function writeJson(key: string, value: unknown, db: Pool): Promise<void> {
  await db.query(
    `insert into app_preferences (key, value, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export function peekStoreIdentity(): StoreIdentity {
  return identityCache;
}

export async function getStoreIdentity(db: Pool = pool): Promise<StoreIdentity> {
  const stored = await readJson<StoreIdentity>('store.identity', DEFAULT_IDENTITY, db);
  identityCache = { ...DEFAULT_IDENTITY, ...stored, taxMode: 'none' };
  return identityCache;
}

export async function patchStoreIdentity(
  patch: Partial<StoreIdentity>,
  db: Pool = pool,
): Promise<StoreIdentity> {
  const current = await getStoreIdentity(db);
  const next: StoreIdentity = { ...current, ...patch, taxMode: 'none' };
  await writeJson('store.identity', next, db);
  identityCache = next;
  return next;
}

function withCanonicalAxisLabels(axes: ProductAxisSetting[]): ProductAxisSetting[] {
  return axes.map((axis) => {
    const defaults = DEFAULT_AXES.find((entry) => entry.key === axis.key);
    return { ...axis, label: defaults?.label ?? axis.label };
  });
}

export async function getProductAxes(db: Pool = pool): Promise<ProductAxisSetting[]> {
  const stored = await readJson('store.product_axes', DEFAULT_AXES, db);
  return withCanonicalAxisLabels(stored);
}

export async function patchProductAxes(
  axes: ProductAxisSetting[],
  db: Pool = pool,
): Promise<ProductAxisSetting[]> {
  const next = withCanonicalAxisLabels(axes);
  await writeJson('store.product_axes', next, db);
  return next;
}

export async function getThemeCustomization(db: Pool = pool): Promise<ThemeCustomization> {
  return readJson('store.theme', DEFAULT_THEME, db);
}

export async function patchThemeCustomization(
  patch: Partial<ThemeCustomization>,
  db: Pool = pool,
): Promise<ThemeCustomization> {
  const current = await getThemeCustomization(db);
  const next = {
    ...current,
    ...patch,
    tokens: { ...current.tokens, ...(patch.tokens ?? {}) },
  };
  await writeJson('store.theme', next, db);
  return next;
}

export async function getStoreMenus(db: Pool = pool): Promise<StoreMenuItem[]> {
  return canonicalStoreMenus(await readJson('store.menus', DEFAULT_MENUS, db));
}

export async function patchStoreMenus(menus: StoreMenuItem[], db: Pool = pool): Promise<StoreMenuItem[]> {
  const next = canonicalStoreMenus(menus);
  await writeJson('store.menus', next, db);
  return next;
}

export async function ensureMenuForPlugin(manifest: PluginManifest, db: Pool = pool): Promise<void> {
  if (manifest.kind !== 'page' || !manifest.nav) return;
  const menus = await getStoreMenus(db);
  if (menus.some((item) => item.pluginId === manifest.id || item.key === manifest.nav!.key)) return;
  menus.push({
    key: manifest.nav.key,
    pluginId: manifest.id,
    label: manifest.name,
    visible: true,
    order: manifest.nav.order,
    bottomBar: Boolean(manifest.nav.bottomBar),
  });
  await patchStoreMenus(menus, db);
}

export { DEFAULT_THEME, DEFAULT_AXES, DEFAULT_MENUS };
