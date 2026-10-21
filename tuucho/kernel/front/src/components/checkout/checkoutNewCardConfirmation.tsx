import { CloseIcon } from '../ui/CloseIcon';
import { useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { getStripePromise } from '../../config/stripeClient';
import { shopConfig } from '../../config/env';
import { useAuthSession } from '../../state/AuthContext';
import * as authApi from '../../api/checkout';
import type { Strings } from '../../assets/i18n/types';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import { RequiredMark } from '../ui/RequiredMark';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { withMinDuration, withTimeout } from '../../utils/withMinDuration';
import { formatPrice } from '../../utils/formatPrice';
import { FIELD_CARDHOLDER_NAME_MAX } from '../../utils/fieldLimits';
import { checkoutFacingError } from '../../utils/checkoutFacingError';
import { useStripeAppearance } from '../../hooks/useStripeAppearance';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import type { ConfirmItemCounts, PreparedPaymentIntent } from './checkoutContracts';
import { ConfirmItemsCountSummary, ConfirmDeliveryAddressPreview } from './CheckoutConfirmationShell';
import type { ConfirmDeliveryAddressFields } from './CheckoutConfirmationShell';
import { usePaymentReservation } from './usePaymentReservation';
import { PaymentReservationNotice } from './PaymentReservationNotice';
import styles from '../cart/CartCheckoutSection.module.css';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { ModalScrollBody } from '../ui/ModalScrollBody';
import { loadGuestCards, saveGuestCards } from '../../state/guestCardVault';
import { addEphemeralCard } from '../../state/ephemeralCards';
import type { PaymentMethod } from '../../api/checkout';

/** Pay with a card collected in this sheet (no prior SetupIntent). The
 * PaymentIntent already carries the order amount and setup_future_usage. */
export function NewCardPaymentConfirmDialog({
  t,
  total,
  paymentIntent,
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
  total: number;
  paymentIntent: PreparedPaymentIntent;
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
      closeOnBackdropClick={false}
    >
      <div ref={panelRef} className={styles.confirmDialog} data-testid="cart-new-card-confirm">
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
          contentKey={`${expired}-${error ?? ''}-${hasOutOfStockItems}`}
        >
          <p className={styles.confirmText}>{t.cart.newCardPaymentConfirmText}</p>
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
              options={{
                clientSecret: paymentIntent.clientSecret,
                appearance: stripeAppearance,
              }}
            >
              <NewCardPaymentConfirmationForm
                t={t}
                clientSecret={paymentIntent.clientSecret}
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

function NewCardPaymentConfirmationForm({
  t,
  clientSecret,
  onSuccess,
  onError,
  onSubmittingChange,
}: {
  t: Strings;
  clientSecret: string;
  onSuccess: (orderNumber: string, loyaltyEarn?: number | null) => void;
  onError: (message: string) => void;
  onSubmittingChange: (value: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { status, authedRequest } = useAuthSession();
  const [cardholderName, setCardholderName] = useState('');
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [paymentUiReady, setPaymentUiReady] = useState(false);
  const canConfirm = Boolean(stripe && elements && paymentUiReady && !submitting);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!stripe || !elements || !paymentUiReady || submitting) return;
    if (!cardholderName.trim()) {
      setNameError(t.paymentMethods.cardholderNameRequiredError);
      return;
    }
    setSubmitting(true);
    onSubmittingChange(true);
    setNameError(null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        onError(checkoutFacingError(t.cart.paymentErrorGeneric, submitError.message));
        setSubmitting(false);
        onSubmittingChange(false);
        return;
      }
      if (status === 'anonymous') {
        const paymentIntentId = clientSecret.split('_secret_')[0];
        if (paymentIntentId?.startsWith('pi_')) {
          await authApi.rememberGuestCheckoutCard(paymentIntentId, remember);
        }
      }
      const { error: stripeError, paymentIntent } = await withTimeout(
        withMinDuration(
          stripe.confirmPayment({
            elements,
            clientSecret,
            redirect: 'if_required',
            confirmParams: {
              return_url: `${window.location.origin}/checkout/return`,
              payment_method_data: {
                billing_details: { name: cardholderName.trim() },
                allow_redisplay: remember ? 'always' : 'limited',
              },
            },
          }),
          shopConfig.loadingMinMs.short,
        ),
        shopConfig.paymentTimeoutMs,
      );
      if (stripeError) {
        const paymentIntentId = clientSecret.split('_secret_')[0];
        if (paymentIntentId?.startsWith('pi_')) {
          try {
            if (status === 'anonymous') {
              await authApi.releaseFailedGuestCheckout(paymentIntentId);
            } else {
              await authedRequest((token) => authApi.releaseFailedCheckout(token, paymentIntentId));
            }
          } catch {
            // Non-blocking: surface the payment failure.
          }
        }
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

      const rawPm = paymentIntent.payment_method;
      const paymentMethodId = typeof rawPm === 'string' ? rawPm : rawPm?.id;
      if (paymentMethodId) {
        if (status === 'anonymous') {
          await authApi.registerCheckoutSessionPaymentMethod(paymentMethodId);
          const entry: PaymentMethod = {
            id: paymentMethodId,
            brand: 'unknown',
            last4: '',
            expMonth: 0,
            expYear: 0,
            cardholderName: cardholderName.trim(),
            savedForFuture: remember,
          };
          if (typeof rawPm === 'object' && rawPm && 'card' in rawPm && rawPm.card) {
            const card = rawPm.card as {
              brand?: string | null;
              last4?: string | null;
              exp_month?: number | null;
              exp_year?: number | null;
            };
            entry.brand = card.brand ?? 'unknown';
            entry.last4 = card.last4 ?? '';
            entry.expMonth = card.exp_month ?? 0;
            entry.expYear = card.exp_year ?? 0;
          }
          if (remember) {
            const current = await loadGuestCards();
            await saveGuestCards({
              paymentMethods: [
                ...current.paymentMethods.filter((m) => m.id !== paymentMethodId),
                entry,
              ],
              defaultPaymentMethod: current.defaultPaymentMethod,
            });
          } else {
            addEphemeralCard(entry);
          }
        } else {
          await authedRequest((token) =>
            authApi.registerPaymentMethod(token, paymentMethodId, remember),
          );
        }
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
      <form onSubmit={(e) => void confirm(e)} noValidate className={styles.newCardPayForm}>
        <label className={styles.confirmNameField}>
          <span className={styles.confirmNameLabel}>
            {t.paymentMethods.cardholderNameLabel}
            <RequiredMark />
          </span>
          <input
            className={styles.confirmNameInput}
            name="ccname"
            data-testid="cart-new-card-cardholder-name"
            autoComplete="cc-name"
            maxLength={FIELD_CARDHOLDER_NAME_MAX}
            aria-required="true"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'cart-new-card-cardholder-error' : undefined}
            value={cardholderName}
            onChange={(e) => {
              setCardholderName(e.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder={t.paymentMethods.cardholderNamePlaceholder}
          />
          {nameError && (
            <p id="cart-new-card-cardholder-error" className={styles.confirmNameError} role="alert">
              {nameError}
            </p>
          )}
        </label>
        <PaymentElement
          options={{
            paymentMethodOrder: ['card'],
            wallets: { applePay: 'never', googlePay: 'never' },
            fields: {
              billingDetails: {
                name: 'never',
              },
            },
          }}
          onReady={() => setPaymentUiReady(true)}
          onLoadError={(event) => {
            setPaymentUiReady(false);
            onError(checkoutFacingError(t.cart.paymentErrorGeneric, event.error.message));
          }}
        />
        <label className={styles.newCardRememberRow}>
          <input
            type="checkbox"
            checked={remember}
            onMouseDown={suppressMouseFocus}
            onChange={(e) => setRemember(e.target.checked)}
            data-testid="cart-new-card-remember"
          />
          <span>{t.paymentMethods.rememberCardLabel}</span>
        </label>
        <div className={styles.confirmActions}>
          <Button
            type="submit"
            disabled={!canConfirm}
            aria-busy={!paymentUiReady}
            data-testid="cart-confirm-pay"
          >
            {t.cart.cardPaymentConfirmButton}
          </Button>
        </div>
      </form>
      {submitting && <LoadingModal message={t.cart.payingButton} />}
    </>
  );
}
