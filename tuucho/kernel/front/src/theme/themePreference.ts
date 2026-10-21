import {
  isContrastPreference,
  isThemePreference,
  type ContrastPreference,
  type ResolvedContrast,
  type ResolvedTheme,
  type ThemePreference,
} from './types';
import { takeLocalKey } from '../utils/storageMigrate';

const THEME_STORAGE_KEY = 'psn-theme-preference-v1';
const CONTRAST_STORAGE_KEY = 'psn-contrast-preference-v1';
const LEGACY_THEME_STORAGE_KEY = 'pamsurin-theme-preference';
const LEGACY_CONTRAST_STORAGE_KEY = 'pamsurin-contrast-preference';
const CHANGE_EVENT = 'tuucho-appearance-preference-change';

let themePreferenceRevision = 0;
let contrastPreferenceRevision = 0;
let initialized = false;
let memoryPreference: ThemePreference = 'system';
let memoryContrastPreference: ContrastPreference = 'system';

export interface ThemeSnapshot {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  contrastPreference: ContrastPreference;
  resolvedContrast: ResolvedContrast;
}

const SERVER_THEME_SNAPSHOT: ThemeSnapshot = {
  preference: 'system',
  resolvedTheme: 'light',
  contrastPreference: 'system',
  resolvedContrast: 'standard',
};
let cachedThemeSnapshot = SERVER_THEME_SNAPSHOT;

/** The saved choice is browser-local for guests and a fast cache for signed-in
 * users. ThemeProvider reconciles it with the account preference. */
export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = takeLocalKey(THEME_STORAGE_KEY, LEGACY_THEME_STORAGE_KEY);
    if (isThemePreference(saved)) memoryPreference = saved;
    return memoryPreference;
  } catch {
    return memoryPreference;
  }
}

/** The explicit contrast choice is independent from the light/dark palette.
 * `system` follows `prefers-contrast: more`; guests use this browser value,
 * while signed-in users reconcile it with their account preference. */
export function getContrastPreference(): ContrastPreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = takeLocalKey(CONTRAST_STORAGE_KEY, LEGACY_CONTRAST_STORAGE_KEY);
    if (isContrastPreference(saved)) memoryContrastPreference = saved;
    return memoryContrastPreference;
  } catch {
    return memoryContrastPreference;
  }
}

/** Maps `system` to the current OS appearance. */
function resolveTheme(preference: ThemePreference = getThemePreference()): ResolvedTheme {
  if (preference !== 'system') return preference;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveContrast(preference: ContrastPreference = getContrastPreference()): ResolvedContrast {
  if (preference !== 'system') return preference;
  if (typeof window === 'undefined') return 'standard';
  return window.matchMedia('(prefers-contrast: more)').matches ? 'more' : 'standard';
}

/** Stable snapshots for React's useSyncExternalStore. The server value is
 * deterministic so prerendered markup and hydration agree; the client value
 * takes over immediately after hydration. */
export function getThemeSnapshot(): ThemeSnapshot {
  const preference = getThemePreference();
  const contrastPreference = getContrastPreference();
  const resolvedTheme = resolveTheme(preference);
  const resolvedContrast = resolveContrast(contrastPreference);
  if (
    cachedThemeSnapshot.preference !== preference ||
    cachedThemeSnapshot.resolvedTheme !== resolvedTheme ||
    cachedThemeSnapshot.contrastPreference !== contrastPreference ||
    cachedThemeSnapshot.resolvedContrast !== resolvedContrast
  ) {
    cachedThemeSnapshot = { preference, resolvedTheme, contrastPreference, resolvedContrast };
  }
  return cachedThemeSnapshot;
}

export function getServerThemeSnapshot(): ThemeSnapshot {
  return SERVER_THEME_SNAPSHOT;
}

function updateBrowserThemeColor(theme: ResolvedTheme, contrast: ResolvedContrast): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const color = meta?.dataset[contrast === 'more' ? `${theme}More` : theme];
  if (meta && color) meta.content = color;
}

function applyAppearancePreferences(
  preference: ThemePreference,
  contrastPreference: ContrastPreference,
): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const theme = resolveTheme(preference);
  const contrast = resolveContrast(contrastPreference);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.contrast = contrast;
  document.documentElement.dataset.contrastPreference = contrastPreference;
  updateBrowserThemeColor(theme, contrast);
}

function applyThemePreference(preference: ThemePreference): void {
  applyAppearancePreferences(preference, getContrastPreference());
}

function applyContrastPreference(preference: ContrastPreference): void {
  applyAppearancePreferences(getThemePreference(), preference);
}

/** Writes and applies one browser preference. Every write advances a revision
 * used by ThemeProvider to reject a stale account read. */
export function setThemePreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return;
  themePreferenceRevision += 1;
  memoryPreference = preference;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    // Storage-restricted browsers still keep the selection for this page.
  }
  applyThemePreference(preference);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getThemePreferenceRevision(): number {
  return themePreferenceRevision;
}

export function setContrastPreference(preference: ContrastPreference): void {
  if (typeof window === 'undefined') return;
  contrastPreferenceRevision += 1;
  memoryContrastPreference = preference;
  try {
    window.localStorage.setItem(CONTRAST_STORAGE_KEY, preference);
    window.localStorage.removeItem(LEGACY_CONTRAST_STORAGE_KEY);
  } catch {
    // Storage-restricted browsers still keep the selection for this page.
  }
  applyContrastPreference(preference);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getContrastPreferenceRevision(): number {
  return contrastPreferenceRevision;
}

/** Subscribe React state in this tab and keep open tabs synchronized. */
export function subscribeThemePreference(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      themePreferenceRevision += 1;
      memoryPreference = isThemePreference(event.newValue) ? event.newValue : 'system';
    } else if (event.key === CONTRAST_STORAGE_KEY) {
      contrastPreferenceRevision += 1;
      memoryContrastPreference = isContrastPreference(event.newValue) ? event.newValue : 'system';
    } else {
      return;
    }
    applyAppearancePreferences(memoryPreference, memoryContrastPreference);
    listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Run before React paints. System mode remains live when the OS changes. */
export function initializeThemePreference(): void {
  if (typeof window === 'undefined') return;
  applyAppearancePreferences(getThemePreference(), getContrastPreference());
  if (initialized) return;
  initialized = true;

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePreference() !== 'system') return;
    applyThemePreference('system');
    window.dispatchEvent(new Event(CHANGE_EVENT));
  });
  window.matchMedia('(prefers-contrast: more)').addEventListener('change', () => {
    if (getContrastPreference() !== 'system') return;
    applyContrastPreference('system');
    window.dispatchEvent(new Event(CHANGE_EVENT));
  });
}
