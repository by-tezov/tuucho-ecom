import { CloseIcon } from '../ui/CloseIcon';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Elements, ExpressCheckoutElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { getStripePromise } from '../../config/stripeClient';
import { shopConfig } from '../../config/env';
import { useAuthSession } from '../../state/AuthContext';
import * as authApi from '../../api/checkout';
import type { Strings } from '../../assets/i18n/types';
import { LoadingModal } from '../ui/LoadingModal';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { withMinDuration, withTimeout } from '../../utils/withMinDuration';
import { formatPrice } from '../../utils/formatPrice';
import { checkoutFacingError } from '../../utils/checkoutFacingError';
import { useStripeAppearance } from '../../hooks/useStripeAppearance';
import type { ConfirmItemCounts, PreparedPaymentIntent, WalletCheckoutMethod } from './checkoutContracts';
import { ConfirmItemsCountSummary, ConfirmDeliveryAddressPreview } from './CheckoutConfirmationShell';
import type { ConfirmDeliveryAddressFields } from './CheckoutConfirmationShell';
import { usePaymentReservation } from './usePaymentReservation';
import { PaymentReservationNotice } from './PaymentReservationNotice';
import styles from '../cart/CartCheckoutSection.module.css';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { ModalScrollBody } from '../ui/ModalScrollBody';

/** Google Pay / Apple Pay confirm dialog — same reservation/summary shell as
 * PayPal, but confirms through Express Checkout Element (one wallet only).
 * Checkout-only: the PaymentIntent never sets setup_future_usage. */
export function WalletPaymentConfirmDialog({
  t,
  method,
  total,
  paymentIntent,
  onSuccess,
  onError,
  onSubmittingChange,
  onCancel,
  hasOutOfStockItems,
  itemCounts,
  receiptEmail,
  deliveryAddress,
}: {
  t: Strings;
  method: WalletCheckoutMethod;
  total: number;
  paymentIntent: PreparedPaymentIntent;
  onSuccess: (orderNumber: string, loyaltyEarn?: number | null) => void;
  onError: (message: string) => void;
  onSubmittingChange: (value: boolean) => void;
  onCancel: () => void;
  hasOutOfStockItems: boolean;
  itemCounts: ConfirmItemCounts;
  receiptEmail: string | null;
  deliveryAddress?: ConfirmDeliveryAddressFields | null | undefined;
}) {
  const stripeAppearance = useStripeAppearance();
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const title =
    method === 'google_pay' ? t.cart.googlePayPaymentConfirmTitle : t.cart.applePayPaymentConfirmTitle;
  const text =
    method === 'google_pay' ? t.cart.googlePayPaymentConfirmText : t.cart.applePayPaymentConfirmText;
  const reservation = usePaymentReservation(paymentIntent, onCancel);
  const { expired, releaseAndClose } = reservation;
  const requestClose = useHistoryBackClose(releaseAndClose);
  useFocusTrap(panelRef, { onEscape: requestClose });

  return createPortal(
    <ModalBackdrop className={styles.confirmBackdrop ?? ''} label={title} onClose={requestClose}>
      <div ref={panelRef} className={styles.confirmDialog}>
        <div className={styles.confirmHeader}>
          <h3 className={styles.confirmTitle}>{title}</h3>
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
          contentKey={`${method}-${expired}-${error ?? ''}-${hasOutOfStockItems}`}
        >
          <p className={styles.confirmText}>{text}</p>
          {hasOutOfStockItems && <p className={styles.headingNotice}>{t.cart.outOfStockConfirmNotice}</p>}
          <div className={styles.confirmSummary}>
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
              <WalletConfirmationForm
                t={t}
                method={method}
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

function WalletConfirmationForm({
  t,
  method,
  onSuccess,
  onError,
  onSubmittingChange,
}: {
  t: Strings;
  method: WalletCheckoutMethod;
  onSuccess: (orderNumber: string, loyaltyEarn?: number | null) => void;
  onError: (message: string) => void;
  onSubmittingChange: (value: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { status, authedRequest } = useAuthSession();
  const [submitting, setSubmitting] = useState(false);
  const [paymentUiReady, setPaymentUiReady] = useState(false);

  async function confirmWalletPayment() {
    if (!stripe || !elements || !paymentUiReady) return;
    setSubmitting(true);
    onSubmittingChange(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        onError(checkoutFacingError(t.cart.paymentErrorGeneric, submitError.message));
        setSubmitting(false);
        onSubmittingChange(false);
        return;
      }
      const { error: stripeError, paymentIntent } = await withTimeout(
        withMinDuration(
          stripe.confirmPayment({
            elements,
            redirect: 'if_required',
            confirmParams: { return_url: `${window.location.origin}/checkout/return` },
          }),
          shopConfig.loadingMinMs.short,
        ),
        shopConfig.paymentTimeoutMs,
      );
      if (stripeError) {
        onError(checkoutFacingError(t.cart.paymentErrorGeneric, stripeError.message));
        setSubmitting(false);
        onSubmittingChange(false);
        return;
      }
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
      <div
        className={styles.walletPaySlot}
        aria-busy={!paymentUiReady}
        {...(!paymentUiReady ? { inert: true } : {})}
      >
        <ExpressCheckoutElement
          options={{
            paymentMethods: {
              googlePay: method === 'google_pay' ? 'always' : 'never',
              applePay: method === 'apple_pay' ? 'always' : 'never',
              link: 'never',
              paypal: 'never',
              amazonPay: 'never',
              klarna: 'never',
            },
          }}
          onReady={() => setPaymentUiReady(true)}
          onLoadError={(event) => {
            setPaymentUiReady(false);
            onError(checkoutFacingError(t.cart.paymentErrorGeneric, event.error.message));
          }}
          onConfirm={() => {
            if (!paymentUiReady || submitting) return;
            void confirmWalletPayment();
          }}
        />
      </div>
      {submitting && <LoadingModal message={t.cart.payingButton} />}
    </>
  );
}
