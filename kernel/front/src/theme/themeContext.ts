import { createContext, useContext } from 'react';
import type { ContrastPreference, ResolvedContrast, ResolvedTheme, ThemePreference } from './types';

export interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  contrastPreference: ContrastPreference;
  resolvedContrast: ResolvedContrast;
  setContrastPreference: (preference: ContrastPreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
