import { CloseIcon } from '../ui/CloseIcon';
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { getStripePromise } from '../../config/stripeClient';
import { shopConfig } from '../../config/env';
import { useAuthSession } from '../../state/AuthContext';
import * as authApi from '../../api/checkout';
import type { Strings } from '../../assets/i18n/types';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import { RequiredFieldsNote } from '../ui/RequiredMark';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { withMinDuration, withTimeout } from '../../utils/withMinDuration';
import { formatPrice } from '../../utils/formatPrice';
import { FIELD_FIRST_NAME_MAX, FIELD_LAST_NAME_MAX } from '../../utils/fieldLimits';
import { checkoutFacingError } from '../../utils/checkoutFacingError';
import { useStripeAppearance } from '../../hooks/useStripeAppearance';
import type { ConfirmItemCounts, PreparedPaymentIntent } from './checkoutContracts';
import { ConfirmItemsCountSummary, ConfirmDeliveryAddressPreview } from './CheckoutConfirmationShell';
import type { ConfirmDeliveryAddressFields } from './CheckoutConfirmationShell';
import { usePaymentReservation } from './usePaymentReservation';
import { PaymentReservationNotice } from './PaymentReservationNotice';
import styles from '../cart/CartCheckoutSection.module.css';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { ModalScrollBody } from '../ui/ModalScrollBody';

/** PayPal / Bancontact intent is deliberately created only after this
 * confirmation dialog opens. Selection in the cart is UI state only and never
 * reserves stock or initializes an external payment flow. */
export function RedirectPaymentConfirmDialog({
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
  method: 'paypal' | 'bancontact';
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
  const title = method === 'paypal' ? t.cart.paypalPaymentConfirmTitle : t.cart.bancontactPaymentConfirmTitle;
  const confirmText =
    method === 'paypal' ? t.cart.paypalPaymentConfirmText : t.cart.bancontactPaymentConfirmText;
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
          <p className={styles.confirmText}>{confirmText}</p>
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
              <RedirectConfirmationForm
                t={t}
                method={method}
                receiptEmail={receiptEmail}
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

function RedirectConfirmationForm({
  t,
  method,
  receiptEmail,
  onSuccess,
  onError,
  onSubmittingChange,
}: {
  t: Strings;
  method: 'paypal' | 'bancontact';
  receiptEmail: string | null;
  onSuccess: (orderNumber: string, loyaltyEarn?: number | null) => void;
  onError: (message: string) => void;
  onSubmittingChange: (value: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { status, user, authedRequest } = useAuthSession();
  const firstNameId = useId();
  const lastNameId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [paymentUiReady, setPaymentUiReady] = useState(false);
  // Bancontact requires billing name; Stripe's Payment Element often keeps
  // those inputs hidden until confirm fails — collect them here up front.
  const [firstName, setFirstName] = useState(() => user?.firstName?.trim() ?? '');
  const [lastName, setLastName] = useState(() => user?.lastName?.trim() ?? '');
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);
  const confirmButton =
    method === 'paypal' ? t.cart.paypalPaymentConfirmButton : t.cart.bancontactPaymentConfirmButton;
  const needsBillingName = method === 'bancontact';
  const canConfirm = Boolean(stripe && elements && paymentUiReady && !submitting);

  async function confirmRedirectPayment() {
    if (!stripe || !elements || !paymentUiReady) return;
    if (needsBillingName) {
      const first = firstName.trim();
      const last = lastName.trim();
      const nextFirstError = first ? null : t.account.firstNameRequiredError;
      const nextLastError = last ? null : t.account.lastNameRequiredError;
      setFirstNameError(nextFirstError);
      setLastNameError(nextLastError);
      if (nextFirstError || nextLastError) return;
    }
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
      const billingName = needsBillingName
        ? `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ').trim()
        : undefined;
      const { error: stripeError, paymentIntent } = await withTimeout(
        withMinDuration(
          stripe.confirmPayment({
            elements,
            redirect: 'if_required',
            confirmParams: {
              return_url: `${shopConfig.siteUrl}/checkout/return`,
              ...(billingName
                ? {
                    payment_method_data: {
                      billing_details: {
                        name: billingName,
                        ...(typeof receiptEmail === 'string' && receiptEmail.trim()
                          ? { email: receiptEmail.trim() }
                          : user?.email
                            ? { email: user.email }
                            : {}),
                      },
                    },
                  }
                : {}),
            },
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
      // Bancontact (and some redirect methods) can resolve with requires_action
      // instead of navigating — follow Stripe's redirect URL ourselves.
      const redirectUrl =
        paymentIntent?.status === 'requires_action' && paymentIntent.next_action?.type === 'redirect_to_url'
          ? paymentIntent.next_action.redirect_to_url?.url
          : null;
      if (redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }
      // Bancontact settles as succeeded (automatic capture); PayPal may be
      // requires_capture. Accept both so finalize matches either path.
      if (
        paymentIntent &&
        (paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture')
      ) {
        const { order } = await withTimeout(
          status === 'anonymous'
            ? authApi.finalizeGuestCheckout(paymentIntent.id)
            : authedRequest((token) => authApi.finalizeCheckout(token, paymentIntent.id)),
          shopConfig.paymentTimeoutMs,
        );
        onSuccess(order.orderNumber, order.loyaltyEarn);
        setSubmitting(false);
        onSubmittingChange(false);
        return;
      }
      onError(
        checkoutFacingError(
          t.cart.paymentErrorGeneric,
          paymentIntent?.status ? t.cart.errorPaymentPrepareFailed(paymentIntent.status) : null,
        ),
      );
      setSubmitting(false);
      onSubmittingChange(false);
    } catch (failure) {
      const detail = failure instanceof Error && failure.message.trim() ? failure.message.trim() : null;
      onError(checkoutFacingError(t.cart.paymentErrorGeneric, detail));
      setSubmitting(false);
      onSubmittingChange(false);
    }
  }

  return (
    <>
      {needsBillingName && (
        <div className={styles.confirmNameFields}>
          <RequiredFieldsNote className={styles.confirmNameNote} />
          <label className={styles.confirmNameField} htmlFor={firstNameId}>
            <span className={styles.confirmNameLabel}>
              {t.account.firstNameLabel}
              <span className={styles.confirmNameRequired} aria-hidden="true">
                *
              </span>
            </span>
            <input
              id={firstNameId}
              type="text"
              name="bancontact-first-name"
              autoComplete="given-name"
              data-testid="cart-bancontact-first-name"
              className={styles.confirmNameInput}
              value={firstName}
              maxLength={FIELD_FIRST_NAME_MAX}
              aria-required="true"
              aria-invalid={firstNameError != null}
              aria-describedby={firstNameError ? `${firstNameId}-error` : undefined}
              onChange={(event) => {
                setFirstName(event.target.value);
                if (firstNameError) setFirstNameError(null);
              }}
            />
            {firstNameError && (
              <p id={`${firstNameId}-error`} className={styles.confirmNameError} role="alert">
                {firstNameError}
              </p>
            )}
          </label>
          <label className={styles.confirmNameField} htmlFor={lastNameId}>
            <span className={styles.confirmNameLabel}>
              {t.account.lastNameLabel}
              <span className={styles.confirmNameRequired} aria-hidden="true">
                *
              </span>
            </span>
            <input
              id={lastNameId}
              type="text"
              name="bancontact-last-name"
              autoComplete="family-name"
              data-testid="cart-bancontact-last-name"
              className={styles.confirmNameInput}
              value={lastName}
              maxLength={FIELD_LAST_NAME_MAX}
              aria-required="true"
              aria-invalid={lastNameError != null}
              aria-describedby={lastNameError ? `${lastNameId}-error` : undefined}
              onChange={(event) => {
                setLastName(event.target.value);
                if (lastNameError) setLastNameError(null);
              }}
            />
            {lastNameError && (
              <p id={`${lastNameId}-error`} className={styles.confirmNameError} role="alert">
                {lastNameError}
              </p>
            )}
          </label>
        </div>
      )}
      <PaymentElement
        options={{
          paymentMethodOrder: [method],
          // Only suppress Stripe's name fields — we collect first/last above.
          // Do not set email/phone/address to "never" unless we also pass them
          // in confirmParams.payment_method_data.billing_details (Stripe rejects
          // the confirm otherwise).
          ...(needsBillingName
            ? {
                fields: {
                  billingDetails: {
                    name: 'never',
                  },
                },
              }
            : {}),
        }}
        onReady={() => setPaymentUiReady(true)}
        onLoadError={(event) => {
          setPaymentUiReady(false);
          onError(checkoutFacingError(t.cart.paymentErrorGeneric, event.error.message));
        }}
      />
      <div className={styles.confirmActions}>
        <Button
          type="button"
          disabled={!canConfirm}
          aria-busy={!paymentUiReady}
          data-testid="cart-confirm-pay"
          onClick={() => void confirmRedirectPayment()}
        >
          {confirmButton}
        </Button>
      </div>
      {submitting && <LoadingModal message={t.cart.payingButton} />}
    </>
  );
}
