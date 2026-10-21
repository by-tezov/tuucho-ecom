import { CloseIcon } from '../ui/CloseIcon';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Elements, useStripe } from '@stripe/react-stripe-js';
import { getStripePromise } from '../../config/stripeClient';
import { shopConfig } from '../../config/env';
import { useAuthSession } from '../../state/AuthContext';
import * as authApi from '../../api/checkout';
import type { PaymentMethod } from '../../api/checkout';
import type { Strings } from '../../assets/i18n/types';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { withMinDuration, withTimeout } from '../../utils/withMinDuration';
import { formatPrice } from '../../utils/formatPrice';
import { checkoutFacingError } from '../../utils/checkoutFacingError';
import { useStripeAppearance } from '../../hooks/useStripeAppearance';
import type { ConfirmItemCounts, PreparedPaymentIntent } from './checkoutContracts';
import { ConfirmItemsCountSummary, ConfirmDeliveryAddressPreview } from './CheckoutConfirmationShell';
import { usePaymentReservation } from './usePaymentReservation';
import { PaymentReservationNotice } from './PaymentReservationNotice';
import styles from '../cart/CartCheckoutSection.module.css';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { ModalScrollBody } from '../ui/ModalScrollBody';
import type { ConfirmDeliveryAddressFields } from './CheckoutConfirmationShell';

const BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

/** The card PaymentIntent is deliberately created only after this
 * confirmation dialog opens, same as RedirectPaymentConfirmDialog below —
 * selection in the cart is UI state only and never reserves stock or opens
 * a Stripe PaymentIntent by itself. */
export function CardPaymentConfirmDialog({
  t,
  card,
  total,
  paymentIntent,
  paymentMethodId,
  onCancel,
  onSuccess,
  onError,
  onSubmittingChange,
  hasOutOfStockItems,
  itemCounts,
  receiptEmail,
  deliveryAddress,
}: {
  t: Strings;
  card: PaymentMethod;
  total: number;
  paymentIntent: PreparedPaymentIntent;
  paymentMethodId: string;
  onCancel: () => void;
  onSuccess: (orderNumber: string, loyaltyEarn?: number | null) => void;
  onError: (message: string) => void;
  onSubmittingChange: (value: boolean) => void;
  hasOutOfStockItems: boolean;
  itemCounts: ConfirmItemCounts;
  receiptEmail: string | null;
  deliveryAddress?: ConfirmDeliveryAddressFields | null | undefined;
}) {
  const stripeAppearance = useStripeAppearance();
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const reservation = usePaymentReservation(paymentIntent, onCancel);
  const { expired, releaseAndClose } = reservation;
  const requestClose = useHistoryBackClose(releaseAndClose);
  useFocusTrap(panelRef, { onEscape: requestClose });

  return createPortal(
    <ModalBackdrop
      className={styles.confirmBackdrop ?? ''}
      label={t.cart.cardPaymentConfirmTitle}
      onClose={requestClose}
    >
      <div ref={panelRef} className={styles.confirmDialog}>
        <div className={styles.confirmHeader}>
          <h3 className={styles.confirmTitle}>{t.cart.cardPaymentConfirmTitle}</h3>
          <button
            type="button"
            className={styles.confirmCloseButton}
            onClick={requestClose}
            aria-label={t.address.cancelButton}
          >
            <CloseIcon />
          </button>
        </div>
        <ModalScrollBody
          className={styles.confirmScrollBody ?? ''}
          contentKey={`${expired}-${error ?? ''}-${hasOutOfStockItems}-${card.id}`}
        >
          <p className={styles.confirmText}>{t.cart.cardPaymentConfirmText}</p>
          {hasOutOfStockItems && <p className={styles.headingNotice}>{t.cart.outOfStockConfirmNotice}</p>}
          <div className={styles.confirmSummary}>
            <div className={styles.confirmSummaryRow}>
              <span className={styles.confirmSummaryLabel}>{t.cart.cardPaymentConfirmCardLabel}</span>
              <span className={styles.confirmSummaryValue}>
                {card.cardholderName && (
                  <span className={styles.confirmCardholderName}>{card.cardholderName}</span>
                )}
                <span>
                  {BRAND_LABELS[card.brand] ?? card.brand} •••• {card.last4}
                </span>
              </span>
            </div>
            {receiptEmail ? (
              <div className={styles.confirmSummaryRow}>
                <span className={styles.confirmSummaryLabel}>{t.cart.confirmEmailLabel}</span>
                <span className={styles.confirmSummaryEmail}>{receiptEmail}</span>
              </div>
            ) : null}
            <ConfirmItemsCountSummary t={t} counts={itemCounts} />
            <div className={styles.confirmSummaryRow}>
              <span className={styles.confirmSummaryLabel}>{t.cart.totalLabel}</span>
              <span className={styles.confirmSummaryValue}>{formatPrice(total)}</span>
            </div>
          </div>
          <ConfirmDeliveryAddressPreview t={t} address={deliveryAddress} />
          <PaymentReservationNotice t={t} reservation={reservation} />
          {error && (
            <p className={styles.confirmError} data-testid="cart-confirm-error" role="alert">
              {error}
            </p>
          )}
          {!expired && (
            <Elements
              stripe={getStripePromise()}
              options={{ clientSecret: paymentIntent.clientSecret, appearance: stripeAppearance }}
            >
              <CardPaymentConfirmationForm
                t={t}
                clientSecret={paymentIntent.clientSecret}
                paymentMethodId={paymentMethodId}
                onSuccess={onSuccess}
                onError={(message) => {
                  setError(message);
                  onError(message);
                }}
                onSubmittingChange={onSubmittingChange}
              />
            </Elements>
          )}
        </ModalScrollBody>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}

/** Stripe Elements is intentionally scoped to the confirmation modal. The
 * saved-card list above therefore remains mounted while an address/courier
 * change replaces the backing PaymentIntent. */
function CardPaymentConfirmationForm({
  t,
  clientSecret,
  paymentMethodId,
  onSuccess,
  onError,
  onSubmittingChange,
}: {
  t: Strings;
  clientSecret: string;
  paymentMethodId: string;
  onSuccess: (orderNumber: string, loyaltyEarn?: number | null) => void;
  onError: (message: string) => void;
  onSubmittingChange: (value: boolean) => void;
}) {
  const stripe = useStripe();
  const { status, authedRequest } = useAuthSession();
  const [submitting, setSubmitting] = useState(false);
  const [paymentUiReady, setPaymentUiReady] = useState(false);
  const canConfirm = Boolean(stripe && paymentUiReady && !submitting);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const paymentErrorGeneric = t.cart.paymentErrorGeneric;

  useEffect(() => {
    if (!stripe) return;
    let cancelled = false;
    void stripe.retrievePaymentIntent(clientSecret).then((result) => {
      if (cancelled) return;
      if (result.error) {
        onErrorRef.current(checkoutFacingError(paymentErrorGeneric, result.error.message));
        return;
      }
      setPaymentUiReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [clientSecret, paymentErrorGeneric, stripe]);

  async function confirm() {
    if (!stripe || !paymentUiReady) return;
    setSubmitting(true);
    onSubmittingChange(true);
    try {
      const { error: stripeError, paymentIntent } = await withTimeout(
        withMinDuration(
          stripe.confirmCardPayment(clientSecret, {
            payment_method: paymentMethodId,
          }),
          shopConfig.loadingMinMs.short,
        ),
        shopConfig.paymentTimeoutMs,
      );
      if (stripeError) {
        // A Stripe decline returns to the browser before the asynchronous
        // webhook is guaranteed to arrive. Ask the API to re-fetch and
        // verify this PI, then promptly release only its matching stock hold.
        // If this request is interrupted, the webhook/TTL remains the
        // durable fallback and the customer still receives Stripe's error.
        const paymentIntentId = clientSecret.split('_secret_')[0];
        if (paymentIntentId?.startsWith('pi_')) {
          try {
            if (status === 'anonymous') {
              await authApi.releaseFailedGuestCheckout(paymentIntentId);
            } else {
              await authedRequest((token) => authApi.releaseFailedCheckout(token, paymentIntentId));
            }
          } catch {
            // Deliberately non-blocking: the visible payment failure is more
            // useful than replacing it with a transient release error.
          }
        }
        onError(checkoutFacingError(t.cart.paymentErrorGeneric, stripeError.message));
        setSubmitting(false);
        onSubmittingChange(false);
        return;
      }
      // Cards and PayPal use capture_method=manual → requires_capture (authorized).
      if (
        !paymentIntent ||
        (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'requires_capture')
      ) {
        onError(t.cart.paymentErrorGeneric);
        setSubmitting(false);
        onSubmittingChange(false);
        return;
      }
      const { order } = await withTimeout(
        status === 'anonymous'
          ? authApi.finalizeGuestCheckout(paymentIntent.id)
          : authedRequest((token) => authApi.finalizeCheckout(token, paymentIntent.id)),
        shopConfig.paymentTimeoutMs,
      );
      onSuccess(order.orderNumber, order.loyaltyEarn);
      setSubmitting(false);
      onSubmittingChange(false);
    } catch {
      onError(t.cart.paymentErrorGeneric);
      setSubmitting(false);
      onSubmittingChange(false);
    }
  }

  return (
    <>
      <div className={styles.confirmActions}>
        <Button
          type="button"
          disabled={!canConfirm}
          aria-busy={!paymentUiReady}
          data-testid="cart-confirm-pay"
          onClick={() => void confirm()}
        >
          {t.cart.cardPaymentConfirmButton}
        </Button>
      </div>
      {submitting && <LoadingModal message={t.cart.payingButton} />}
    </>
  );
}
