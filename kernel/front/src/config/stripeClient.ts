import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js';
import type { ResolvedContrast, ResolvedTheme } from '../theme/types';
import { shopConfig } from './env';

let stripePromise: Promise<Stripe | null> | undefined;

/** loadStripe() must only ever be called once per publishable key (it
 * injects Stripe.js's own <script> tag) — every caller (CartPage's
 * checkout, AccountPaymentMethodsPage's "add card") shares this one
 * promise instead of loading the script again.
 * `developerTools.assistant.enabled: false` hides Stripe’s floating
 * sandbox testing widget (it only appears with test keys; live never shows it). */
export function getStripePromise(): Promise<Stripe | null> {
  if (!shopConfig.stripePublishableKey) return Promise.resolve(null);
  stripePromise ??= loadStripe(shopConfig.stripePublishableKey, {
    developerTools: { assistant: { enabled: false } },
  });
  return stripePromise;
}

/** Shared by checkout's payment panels and the add-card dialog. `colorText`
 * and `colorTextSecondary` are explicit so labels and helper text inside the
 * Stripe iframe stay readable on the site's dark card surface. */
export function getStripeElementsAppearance(
  theme: ResolvedTheme,
  contrast: ResolvedContrast = 'standard',
): Appearance {
  const dark = theme === 'dark';
  const enhanced = contrast === 'more';
  const colors = enhanced
    ? dark
      ? {
          background: '#000000',
          border: '#ffffff',
          primary: '#ffdf00',
          text: '#ffffff',
          textSecondary: '#e6e6e6',
          textPlaceholder: '#e6e6e6',
          danger: '#ff8a8a',
          success: '#82ff9f',
          warning: '#ffe066',
        }
      : {
          background: '#ffffff',
          border: '#000000',
          primary: '#003366',
          text: '#000000',
          textSecondary: '#333333',
          textPlaceholder: '#333333',
          danger: '#8b0000',
          success: '#005a24',
          warning: '#5a3d00',
        }
    : dark
      ? {
          background: 'transparent',
          border: '#a8a8a8',
          primary: '#f2f2f2',
          text: '#f2f2f2',
          textSecondary: '#c4c4c4',
          textPlaceholder: '#c4c4c4',
          danger: '#f08b82',
          success: '#91dda3',
          warning: '#f0cb75',
        }
      : {
          background: 'transparent',
          border: '#6b6b6b',
          primary: '#121212',
          text: '#1a1a1a',
          textSecondary: '#5c5c5c',
          textPlaceholder: '#5c5c5c',
          danger: '#b3413a',
          success: '#2f6b3a',
          warning: '#7a5c14',
        };

  return {
    theme: dark ? 'night' : 'stripe',
    variables: {
      colorBackground: colors.background,
      colorPrimary: colors.primary,
      colorText: colors.text,
      colorTextSecondary: colors.textSecondary,
      colorTextPlaceholder: colors.textPlaceholder,
      colorDanger: colors.danger,
      colorSuccess: colors.success,
      colorWarning: colors.warning,
      iconColor: colors.primary,
      iconHoverColor: colors.primary,
    },
    rules: {
      '.Block': {
        backgroundColor: 'transparent',
        boxShadow: 'none',
        border: 'none',
      },
      '.AccordionItem': {
        backgroundColor: 'transparent',
        boxShadow: 'none',
        border: 'none',
      },
      ...(enhanced
        ? {
            '.Input': {
              border: `2px solid ${colors.border}`,
              boxShadow: 'none',
            },
            '.Input:focus': {
              borderColor: colors.primary,
              boxShadow: `0 0 0 1px ${colors.primary}`,
            },
            '.Label': {
              fontWeight: '600',
            },
          }
        : {}),
    },
  };
}

/** Add-card / guest-add-card only. The deliberately hidden single-method
 * accordion label must match the current modal surface; normal checkout
 * panels keep their Stripe method label visible. */
export function getStripeAddCardAppearance(
  theme: ResolvedTheme,
  contrast: ResolvedContrast = 'standard',
): Appearance {
  const dark = theme === 'dark';
  const appearance = getStripeElementsAppearance(theme, contrast);
  const modalSurface = contrast === 'more' ? (dark ? '#000000' : '#ffffff') : dark ? '#242424' : '#ffffff';

  return {
    ...appearance,
    variables: {
      ...appearance.variables,
      accordionItemLabelColorText: modalSurface,
      accordionItemLabelSelectedColorText: modalSurface,
    },
  };
}
