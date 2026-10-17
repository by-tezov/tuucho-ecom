import type { ReactNode } from 'react';
import { CardBrandMark } from '../account/CardBrandMark';
import { useAcceptedPaymentMethods } from '../../state/acceptedPaymentMethods';
import { acceptedPaymentBrands, type AcceptedPaymentBrand } from '../../utils/acceptedPaymentBrands';
import { PaymentBrandMark } from './PaymentBrandMark';
import styles from './AcceptedPaymentMarks.module.css';

const MARKS: Record<AcceptedPaymentBrand, { name: string; mark: ReactNode }> = {
  visa: { name: 'Visa', mark: <CardBrandMark brand="visa" /> },
  mastercard: { name: 'Mastercard', mark: <CardBrandMark brand="mastercard" /> },
  bancontact: { name: 'Bancontact', mark: <PaymentBrandMark brand="bancontact" surface="light" /> },
  apple_pay: { name: 'Apple Pay', mark: <PaymentBrandMark brand="apple_pay" surface="light" /> },
  google_pay: { name: 'Google Pay', mark: <PaymentBrandMark brand="google_pay" surface="light" /> },
  paypal: { name: 'PayPal', mark: <PaymentBrandMark brand="paypal" surface="light" /> },
};

/**
 * Row of payment acceptance marks, one white card per method, the way shops
 * show them in a footer. Which methods appear follows the shop switches and
 * country lists (see acceptedPaymentBrands); `deliveryCountry` is the cart's
 * chosen address country, absent in the footer.
 *
 * The marks are decorative images; each card carries the method name as
 * visually hidden text so a screen reader hears the list.
 */
export function AcceptedPaymentMarks({
  label,
  deliveryCountry,
  className,
}: {
  label: string;
  deliveryCountry?: string | null | undefined;
  className?: string | undefined;
}) {
  const methods = useAcceptedPaymentMethods();
  if (!methods) return null;
  const brands = acceptedPaymentBrands(methods.shop, methods.countries, deliveryCountry, methods.geoCountry);
  if (brands.length === 0) return null;

  return (
    <ul className={className ? `${styles.list} ${className}` : styles.list} aria-label={label}>
      {brands.map((brand) => (
        <li key={brand} className={styles.card}>
          {MARKS[brand].mark}
          <span className="visuallyHidden">{MARKS[brand].name}</span>
        </li>
      ))}
    </ul>
  );
}
