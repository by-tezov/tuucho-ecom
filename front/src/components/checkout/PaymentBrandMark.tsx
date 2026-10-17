import { useTheme } from '../../theme/themeContext';
import applePayDarkUrl from '../../assets/images/payments/apple-pay-dark.svg';
import applePayLightUrl from '../../assets/images/payments/apple-pay.svg';
import bancontactDarkUrl from '../../assets/images/payments/bancontact-dark.svg';
import bancontactLightUrl from '../../assets/images/payments/bancontact.svg';
import googlePayDarkUrl from '../../assets/images/payments/google-pay-dark.svg';
import googlePayLightUrl from '../../assets/images/payments/google-pay.svg';
import paypalDarkUrl from '../../assets/images/payments/paypal-dark.svg';
import paypalLightUrl from '../../assets/images/payments/paypal.svg';

export type PaymentBrandKey = 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay';

const MARKS: Record<PaymentBrandKey, { light: string; dark: string; width: number; height: number }> = {
  paypal: { light: paypalLightUrl, dark: paypalDarkUrl, width: 62, height: 16 },
  bancontact: { light: bancontactLightUrl, dark: bancontactDarkUrl, width: 53, height: 35 },
  google_pay: { light: googlePayLightUrl, dark: googlePayDarkUrl, width: 41, height: 17 },
  apple_pay: { light: applePayLightUrl, dark: applePayDarkUrl, width: 41, height: 26 },
};

/** Official payment acceptance marks — swaps to the dark-surface asset when
 * the resolved theme is dark (brand colors cannot use semantic theme tokens).
 * `surface` pins the asset when the mark sits on a fixed-color badge whatever
 * the theme (AcceptedPaymentMarks' white cards). */
export function PaymentBrandMark({
  brand,
  className,
  surface,
}: {
  brand: PaymentBrandKey;
  className?: string | undefined;
  surface?: 'light' | 'dark' | undefined;
}) {
  const { resolvedTheme } = useTheme();
  const mark = MARKS[brand];
  const src = (surface ?? resolvedTheme) === 'dark' ? mark.dark : mark.light;
  return (
    <img className={className} src={src} alt="" width={mark.width} height={mark.height} aria-hidden="true" />
  );
}
