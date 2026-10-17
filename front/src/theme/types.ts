const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
const CONTRAST_PREFERENCES = ['system', 'standard', 'more'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ContrastPreference = (typeof CONTRAST_PREFERENCES)[number];

export type ResolvedTheme = Exclude<ThemePreference, 'system'>;
export type ResolvedContrast = Exclude<ContrastPreference, 'system'>;

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && THEME_PREFERENCES.includes(value as ThemePreference);
}

export function isContrastPreference(value: unknown): value is ContrastPreference {
  return typeof value === 'string' && CONTRAST_PREFERENCES.includes(value as ContrastPreference);
}
