import { useMemo } from 'react';
import { getStripeAddCardAppearance, getStripeElementsAppearance } from '../config/stripeClient';
import { useTheme } from '../theme/themeContext';

export type StripeAppearanceVariant = 'checkout' | 'add-card';

/** Stripe fields live in iframes and cannot consume CSS variables directly.
 * This hook keeps their Appearance object synchronized with the site theme;
 * React Stripe forwards mutable appearance changes to elements.update(). */
export function useStripeAppearance(variant: StripeAppearanceVariant = 'checkout') {
  const { resolvedContrast, resolvedTheme } = useTheme();
  return useMemo(
    () =>
      variant === 'add-card'
        ? getStripeAddCardAppearance(resolvedTheme, resolvedContrast)
        : getStripeElementsAppearance(resolvedTheme, resolvedContrast),
    [resolvedContrast, resolvedTheme, variant],
  );
}
