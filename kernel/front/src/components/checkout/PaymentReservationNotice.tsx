import type { Strings } from '../../assets/i18n/types';
import { Button } from '../ui/Button';
import { RESERVATION_WARNING_LEAD_MS, type PaymentReservation } from './usePaymentReservation';
import styles from '../cart/CartCheckoutSection.module.css';

/** The payment confirmations' time-limit line (RGAA 13.1): the expiry warning
 * with its one-click extension, then the expiry message, which stays until the
 * customer closes the dialog. Alerts, so they are announced even while focus is
 * inside Stripe's card fields; the extend button sits beside the alert, not in
 * it. */
export function PaymentReservationNotice({
  t,
  reservation,
}: {
  t: Strings;
  reservation: PaymentReservation;
}) {
  if (reservation.expired) {
    return (
      <p className={styles.confirmError} role="alert" data-testid="cart-reservation-expired">
        {t.cart.paymentReservationExpired}
      </p>
    );
  }
  if (!reservation.warning) return null;
  const minutes = Math.round(RESERVATION_WARNING_LEAD_MS / 60_000);
  return (
    <div className={styles.reservationWarning} data-testid="cart-reservation-warning">
      <p className={styles.reservationWarningText} role="alert">
        {t.cart.paymentReservationWarning.replace('{n}', String(minutes))}
      </p>
      <Button
        type="button"
        variant="ghost"
        disabled={reservation.extending}
        onClick={() => void reservation.extend()}
        data-testid="cart-reservation-extend"
      >
        {t.cart.paymentReservationExtend}
      </Button>
      {reservation.extendFailed && (
        <p className={styles.confirmError} role="alert">
          {t.cart.paymentReservationExtendFailed}
        </p>
      )}
    </div>
  );
}
