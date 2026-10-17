import type { Strings } from '../../assets/i18n/types';
import styles from '../cart/CartFeature.module.css';

interface CheckoutOverflowMoreLinkProps {
  t: Strings;
  visible: boolean;
  onOpen: () => void;
}

/** Bottom-right “+ more” affordance for checkout overflow pickers. */
export function CheckoutOverflowMoreLink({ t, visible, onOpen }: CheckoutOverflowMoreLinkProps) {
  if (!visible) return null;
  return (
    <div className={styles.sectionTextLinkRow}>
      <button type="button" className={styles.textLink} onClick={onOpen}>
        + {t.cart.overflowMore}
      </button>
    </div>
  );
}
