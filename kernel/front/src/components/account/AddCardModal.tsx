import { CloseIcon } from '../ui/CloseIcon';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { getStripePromise } from '../../config/stripeClient';
import { shopConfig } from '../../config/env';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import type { Strings } from '../../assets/i18n/types';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { RequiredFieldsNote, RequiredMark } from '../ui/RequiredMark';
import { withMinDuration, withTimeout } from '../../utils/withMinDuration';
import { FIELD_CARDHOLDER_NAME_MAX } from '../../utils/fieldLimits';
import styles from './AddCardModal.module.css';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import { useScrollHint } from '../../hooks/useScrollHint';
import { useStripeAppearance } from '../../hooks/useStripeAppearance';
import { useDragScroll } from '../../hooks/useDragScroll';

interface AddCardModalProps {
  t: Strings;
  clientSecret: string;
  /** Called with the newly-saved card's PaymentMethod id — lets a caller
   * that manages a selection (CartCheckoutSection) select the card the
   * customer just added, rather than leaving whatever was previously
   * selected untouched. `savedForFuture` mirrors the remember checkbox
   * (always true when allowOneTimeUse is false). */
  /** Resolves only once the caller has persisted the method and updated the
   * list behind this modal. Keeping the modal mounted until then avoids a
   * brief, misleading state where it has closed but the new card cannot yet
   * be selected. */
  onSuccess: (paymentMethodId: string, savedForFuture: boolean) => void | Promise<void>;
  onClose: () => void;
  /** Checkout: remember is optional (default unchecked). Account page:
   * omit / false — card is always saved and the checkbox is hidden. */
  allowOneTimeUse?: boolean;
}

/** Dialog on desktop, bottom sheet on mobile (same shell as
 * AddressFormModal) — a plain SetupIntent flow, no
 * charge involved, for the "add a card" action on the payment-methods
 * management page. */
export function AddCardModal({
  t,
  clientSecret,
  onSuccess,
  onClose,
  allowOneTimeUse = false,
}: AddCardModalProps) {
  const stripeAppearance = useStripeAppearance('add-card');
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyDragScroll = useDragScroll<HTMLDivElement>({
    ignore: 'input, select, textarea, button, a, iframe, label',
    preventSelection: false,
  });
  const { scrollHint, updateScrollHint } = useScrollHint(bodyRef);

  useLockBodyScroll();
  const requestClose = useHistoryBackClose(onClose);
  useFocusTrap(panelRef, { onEscape: requestClose });

  // Same technique as FilterSheet / AddressFormModal: hide the visual
  // scrollbar, show up/down chevrons + vertical track, mouse-drag to scroll.

  useLayoutEffect(() => {
    updateScrollHint();
    window.addEventListener('resize', updateScrollHint);
    return () => window.removeEventListener('resize', updateScrollHint);
  }, [updateScrollHint]);

  // PaymentElement mounts asynchronously and grows the form without
  // resizing the viewport — observe both the scroll shell and its content.
  useEffect(() => {
    const container = bodyRef.current;
    const content = contentRef.current;
    if (!container || !content || typeof ResizeObserver === 'undefined') {
      updateScrollHint();
      return;
    }
    const observer = new ResizeObserver(updateScrollHint);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [updateScrollHint]);

  return createPortal(
    <ModalBackdrop
      className={styles.backdrop ?? ''}
      label={t.paymentMethods.addCardModalTitle}
      onClose={requestClose}
      closeOnBackdropClick={false}
    >
      <div ref={panelRef} className={styles.panel} data-testid="card-add-modal">
        <div className={styles.header}>
          <span className={styles.title}>{t.paymentMethods.addCardModalTitle}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            aria-label={t.address.cancelButton}
          >
            <CloseIcon />
          </button>
        </div>
        <div className={styles.bodyWrap}>
          <div ref={bodyRef} className={styles.body} onScroll={updateScrollHint} {...bodyDragScroll}>
            <div ref={contentRef}>
              <Elements stripe={getStripePromise()} options={{ clientSecret, appearance: stripeAppearance }}>
                <AddCardForm t={t} onSuccess={onSuccess} allowOneTimeUse={allowOneTimeUse} />
              </Elements>
            </div>
          </div>
          {scrollHint.up && (
            <span className={styles.scrollHintUp} aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 7.5L6 4L9.5 7.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
          {scrollHint.down && (
            <span className={styles.scrollHintDown} aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 4.5L6 8L9.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
          {(scrollHint.up || scrollHint.down) && (
            <span
              className={[
                styles.scrollHintBar,
                scrollHint.up && styles.scrollHintBarFromUp,
                scrollHint.down && styles.scrollHintBarToDown,
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}

function AddCardForm({
  t,
  onSuccess,
  allowOneTimeUse,
}: {
  t: Strings;
  onSuccess: (paymentMethodId: string, savedForFuture: boolean) => void | Promise<void>;
  allowOneTimeUse: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardholderName, setCardholderName] = useState('');
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentUiReady, setPaymentUiReady] = useState(false);
  const savedForFuture = allowOneTimeUse ? remember : true;
  const canSubmit = Boolean(stripe && elements && paymentUiReady && !submitting);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // This modal is rendered via createPortal — its DOM sits outside any
    // surrounding <form> (e.g. CartCheckoutSection's own payment form), but
    // React's synthetic events bubble through the *React* tree, not the DOM
    // tree, so without this, submitting this form here would *also* fire
    // that outer form's onSubmit (paying with whatever card happens to be
    // selected there) in the same tick.
    e.stopPropagation();
    if (!stripe || !elements || !paymentUiReady || submitting) return;
    if (!cardholderName.trim()) {
      setNameError(t.paymentMethods.cardholderNameRequiredError);
      return;
    }
    setSubmitting(true);
    setNameError(null);
    setError(null);
    try {
      // billing_details.name is collected outside Payment Element — Stripe's
      // fields.billingDetails.name: 'always' is beta-gated and silent-no-ops
      // without access (falls back to auto, which hides name for cards).
      const { error: stripeError, setupIntent } = await withTimeout(
        withMinDuration(
          stripe.confirmSetup({
            elements,
            redirect: 'if_required',
            confirmParams: {
              return_url: `${shopConfig.siteUrl}/account/payment-methods`,
              payment_method_data: {
                billing_details: { name: cardholderName.trim() },
                // `always` = reusable saved card; `limited` = checkout one-time
                // (hidden from listPaymentMethods, kept for refunds until TTL).
                // Server registerCard re-asserts this and handles fingerprint
                // dedupe / upgrade.
                allow_redisplay: savedForFuture ? 'always' : 'limited',
              },
            },
          }),
          shopConfig.loadingMinMs.normal,
        ),
        shopConfig.paymentTimeoutMs,
      );
      if (stripeError) {
        setError(stripeError.message ?? t.paymentMethods.saveCardError);
        setSubmitting(false);
        return;
      }
      // A succeeded SetupIntent always has an attached payment method — the
      // whole point of it succeeding.
      const paymentMethod = setupIntent.payment_method!;
      // Stripe has tokenized the card at this point, but it is not usable in
      // the shop until the owner registers it with the API and refreshes its
      // list. Keep the loading overlay active for that network phase too.
      await withTimeout(
        Promise.resolve(
          onSuccess(typeof paymentMethod === 'string' ? paymentMethod : paymentMethod.id, savedForFuture),
        ),
        shopConfig.paymentTimeoutMs,
      );
      // Leave submitting true until the parent unmounts this modal.
    } catch {
      setError(t.paymentMethods.saveCardError);
      setSubmitting(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate>
        <RequiredFieldsNote />
        <div className={styles.paymentBlock}>
          <label className={styles.cardholderNameField}>
            <span className={styles.cardholderNameLabel}>
              {t.paymentMethods.cardholderNameLabel}
              <RequiredMark />
            </span>
            <input
              className={styles.cardholderNameInput}
              name="ccname"
              data-testid="card-cardholder-name"
              autoComplete="cc-name"
              maxLength={FIELD_CARDHOLDER_NAME_MAX}
              aria-required="true"
              value={cardholderName}
              onChange={(e) => {
                setCardholderName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder={t.paymentMethods.cardholderNamePlaceholder}
              aria-invalid={nameError != null}
              aria-describedby={nameError ? 'cardholder-name-error' : undefined}
            />
            {nameError && (
              <p id="cardholder-name-error" className={styles.fieldError} role="alert">
                {nameError}
              </p>
            )}
          </label>
          <div className={styles.paymentElement} data-testid="card-payment-element">
            <PaymentElement
              options={{
                paymentMethodOrder: ['card'],
                wallets: { applePay: 'never', googlePay: 'never' },
              }}
              onReady={() => setPaymentUiReady(true)}
              onLoadError={(event) => {
                setPaymentUiReady(false);
                setError(event.error.message ?? t.paymentMethods.saveCardError);
              }}
            />
          </div>
        </div>
        {allowOneTimeUse && (
          <label className={styles.rememberRow}>
            <input
              type="checkbox"
              onMouseDown={suppressMouseFocus}
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            {t.paymentMethods.rememberCardLabel}
          </label>
        )}
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.buttonRow}>
          <Button type="submit" disabled={!canSubmit} aria-busy={!paymentUiReady} data-testid="card-submit">
            {submitting
              ? t.paymentMethods.savingCardButton
              : allowOneTimeUse
                ? t.paymentMethods.useCardButton
                : t.paymentMethods.saveCardButton}
          </Button>
        </div>
      </form>
      {submitting && <LoadingModal message={t.paymentMethods.savingCardButton} />}
    </>
  );
}
