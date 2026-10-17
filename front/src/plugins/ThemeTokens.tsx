import { useEffect } from 'react';
import { useStorefrontBootstrap } from './StorefrontBootstrap';

export function ThemeTokens() {
  const { theme } = useStorefrontBootstrap();
  useEffect(() => {
    const root = document.documentElement;
    const applied: string[] = [];
    const tokens = theme.tokens ?? {};
    for (const [name, value] of Object.entries(tokens)) {
      if (!name.startsWith('--') || !value) continue;
      root.style.setProperty(name, value);
      applied.push(name);
    }
    return () => {
      for (const name of applied) root.style.removeProperty(name);
    };
  }, [theme.tokens]);
  return null;
}
