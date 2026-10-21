import type { ReactNode } from 'react';
import type { Strings } from '../../assets/i18n/types';
import styles from './ReassuranceStrip.module.css';

/**
 * The shop's reassurance strip ("bandeau de réassurance"): short promises
 * shown where a visitor decides to buy, under the product page and zoom
 * modal add buttons and in the cart summary. Each line restates a fact the
 * FAQ and CGV already commit to, so the wording changes there first.
 */
export type ReassuranceKey = 'handmade' | 'madeAndShipped' | 'tracked' | 'securePayment' | 'kit';

export const PRODUCT_REASSURANCE: readonly ReassuranceKey[] = [
  'handmade',
  'madeAndShipped',
  'tracked',
  'securePayment',
];

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS: Record<ReassuranceKey, ReactNode> = {
  handmade: (
    <Icon>
      <path
        d="M7 12.1 2.45 7.55C1.35 6.45 1.35 4.65 2.45 3.55 3.55 2.45 5.35 2.45 6.45 3.55L7 4.1l.55-.55c1.1-1.1 2.9-1.1 4 0 1.1 1.1 1.1 2.9 0 4L7 12.1Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  madeAndShipped: (
    <Icon>
      <path
        d="M1.5 4h6v6h-6zM7.5 6.2h2.4l2.1 2.1V10h-4.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="4" cy="10.4" r="1" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="9.6" cy="10.4" r="1" stroke="currentColor" strokeWidth="1.1" />
    </Icon>
  ),
  tracked: (
    <Icon>
      <path
        d="M7 12.5S3.2 8.9 3.2 6a3.8 3.8 0 0 1 7.6 0c0 2.9-3.8 6.5-3.8 6.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="6" r="1.3" stroke="currentColor" strokeWidth="1.1" />
    </Icon>
  ),
  securePayment: (
    <Icon>
      <rect x="2.5" y="6" width="9" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 6V4.2a2.5 2.5 0 0 1 5 0V6" stroke="currentColor" strokeWidth="1.2" />
    </Icon>
  ),
  kit: (
    <Icon>
      <rect x="2" y="5" width="10" height="2.8" rx="0.6" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M3 7.8v4.7h8V7.8M7 5v7.5M7 5C6 2.6 3.6 2.8 3.9 4.1 4.1 4.9 5.6 5 7 5Zm0 0c1-2.4 3.4-2.2 3.1-.9C9.9 4.9 8.4 5 7 5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </Icon>
  ),
};

function label(t: Strings, key: ReassuranceKey): string {
  switch (key) {
    case 'handmade':
      return t.gallery.trustHandmadeFrance;
    case 'madeAndShipped':
      return t.gallery.trustMadeAndShipped;
    case 'tracked':
      return t.gallery.trustTracked;
    case 'securePayment':
      return t.gallery.trustSecurePayment;
    case 'kit':
      return t.cart.trustKitIncluded;
  }
}

export function ReassuranceStrip({
  t,
  items = PRODUCT_REASSURANCE,
  layout = 'row',
  className,
}: {
  t: Strings;
  items?: readonly ReassuranceKey[];
  /** `row` wraps inline under a buy button; `list` stacks one per line. */
  layout?: 'row' | 'list';
  className?: string | undefined;
}) {
  const rootClass = `${styles.strip} ${layout === 'list' ? styles.list : styles.row}`;
  return (
    <ul className={className ? `${rootClass} ${className}` : rootClass}>
      {items.map((key) => (
        <li key={key} className={styles.item}>
          {ICONS[key]}
          {label(t, key)}
        </li>
      ))}
    </ul>
  );
}
