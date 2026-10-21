import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { ToggleSwitch } from '../../components/ui/ToggleSwitch';
import { useLang } from '../../assets/i18n';
import styles from '../AdminOrdersPage.module.css';
import type { OrderAction } from './AdminOrderDetail';

/** Confirmation sheet of an order status move. The move's options (capture,
 * customer update, label bypass) live here, next to the button that runs
 * it, instead of as toggles that had to be set before a separate confirm. */
export function OrderActionConfirm({
  action,
  orderNumber,
  t,
  capturePayment,
  setCapturePayment,
  notifyCustomer,
  setNotifyCustomer,
  skipShippingLabel,
  setSkipShippingLabel,
  onConfirm,
  onCancel,
}: {
  action: OrderAction;
  orderNumber: string;
  t: ReturnType<typeof useLang>['t'];
  capturePayment: boolean;
  setCapturePayment: (value: boolean) => void;
  notifyCustomer: boolean;
  setNotifyCustomer: (value: boolean) => void;
  skipShippingLabel: boolean;
  setSkipShippingLabel: (value: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmModal
      title={
        action === 'prepare'
          ? t.admin.prepareOrder
          : action === 'release'
            ? t.admin.sendOrder
            : action === 'ship'
              ? t.admin.advanceToSent
              : action === 'received'
                ? t.admin.advanceToReceived
                : t.admin.advanceToReturnReview
      }
      message={
        <div className={styles.confirmOptions}>
          <strong>{orderNumber}</strong>
          {action === 'prepare' && (
            <>
              <label className={styles.check}>
                <ToggleSwitch
                  checked={capturePayment}
                  onChange={setCapturePayment}
                  aria-label={t.admin.capturePayment}
                />
                {t.admin.capturePayment}
              </label>
              <label className={styles.check}>
                <ToggleSwitch
                  checked={notifyCustomer}
                  onChange={setNotifyCustomer}
                  aria-label={t.admin.notifyCustomer}
                />
                {t.admin.notifyCustomer}
              </label>
            </>
          )}
          {action === 'release' && (
            <>
              <label className={styles.check}>
                <ToggleSwitch
                  checked={notifyCustomer}
                  onChange={setNotifyCustomer}
                  aria-label={t.admin.notifyCustomer}
                />
                {t.admin.notifyCustomer}
              </label>
              <label className={styles.check}>
                <ToggleSwitch
                  checked={skipShippingLabel}
                  onChange={setSkipShippingLabel}
                  aria-label={t.admin.skipShippingLabel}
                />
                {t.admin.skipShippingLabel}
              </label>
              {skipShippingLabel && (
                <p className={styles.skipShippingLabelHint}>{t.admin.skipShippingLabelHint}</p>
              )}
            </>
          )}
          {action === 'ship' && <p className={styles.skipShippingLabelHint}>{t.admin.advanceToSentHint}</p>}
          {action === 'received' && (
            <p className={styles.skipShippingLabelHint}>{t.admin.advanceToReceivedHint}</p>
          )}
          {action === 'return' && (
            <p className={styles.skipShippingLabelHint}>{t.admin.advanceToReturnReviewHint}</p>
          )}
        </div>
      }
      confirmLabel={
        action === 'prepare'
          ? t.admin.prepareOrder
          : action === 'release'
            ? t.admin.sendOrder
            : t.admin.confirmForcedAction
      }
      closeLabel={t.gallery.close}
      confirmDanger={action === 'return'}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
