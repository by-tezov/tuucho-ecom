import type { Strings } from '../../assets/i18n/types';
import authFormStyles from '../auth/AuthForm.module.css';
import styles from './AddressFormModal.module.css';

/** AddressFormModal's "home or pickup point" switch for a new delivery
 * address: home is the form on screen, pickup opens the relay picker. The
 * current choice is exposed with aria-pressed, not by its colour alone. */
export function DeliveryTypeChoice({ t, onChoosePickup }: { t: Strings; onChoosePickup: () => void }) {
  return (
    <fieldset className={styles.deliveryType}>
      <legend className={authFormStyles.label}>{t.address.networkField}</legend>
      <div className={styles.deliveryTypeOptions}>
        <button
          type="button"
          className={`${styles.deliveryTypeOption} ${styles.deliveryTypeOptionActive}`}
          data-testid="address-delivery-home"
          aria-pressed="true"
        >
          <span aria-hidden="true">⌂</span>
          {t.address.homeDeliveryOption}
        </button>
        <button
          type="button"
          className={styles.deliveryTypeOption}
          data-testid="address-delivery-pickup"
          aria-pressed="false"
          onClick={onChoosePickup}
        >
          <span aria-hidden="true">⌖</span>
          {t.address.pickupDeliveryOption}
        </button>
      </div>
    </fieldset>
  );
}
