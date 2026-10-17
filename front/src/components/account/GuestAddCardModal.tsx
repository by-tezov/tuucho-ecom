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
import type { PaymentMethod } from '../../api/checkout';
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

interface GuestAddCardModalProps {
  t: Strings;
  onSuccess: (method: PaymentMethod, savedForFuture: boolean) => void | Promise<void>;
  onClose: () => void;
}

/** Signed-out equivalent of AddCardModal — same dialog shell, same
 * PaymentElement, so a guest's "add a card" looks and behaves exactly like
 * an authenticated one (see CartCheckoutSection.tsx and, on this exact
 * point, the user's own correction — a visibly different/reduced dialog
 * wasn't acceptable). The difference is only how the card gets tokenized:
 * AddCardModal confirms a real SetupIntent, which needs a Stripe Customer
 * (see stripe.service.ts's getOrCreateCustomerId) that doesn't exist yet
 * for a guest. This mounts Elements in Stripe's documented "deferred"
 * mode instead (`mode`/`currency` in place of a `clientSecret`, plus
 * `paymentMethodCreation: 'manual'`) and calls
 * stripe.createPaymentMethod({ elements }) directly — same PaymentElement
 * UI, no Intent or customer required. The resulting pm_… id is a Stripe API
 * reference (not raw card data), so it's safe to cache locally (see
 * state/guestCart.ts) until state/guestSync.ts attaches it to the real
 * customer on login. */
export function GuestAddCardModal({ t, onSuccess, onClose }: GuestAddCardModalProps) {
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
      <div ref={panelRef} className={styles.panel}>
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
              <Elements
                stripe={getStripePromise()}
                options={{
                  mode: 'setup',
                  currency: 'eur',
                  paymentMethodTypes: ['card'],
                  paymentMethodCreation: 'manual',
                  appearance: stripeAppearance,
                }}
              >
                <GuestAddCardForm t={t} onSuccess={onSuccess} />
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

function GuestAddCardForm({
  t,
  onSuccess,
}: {
  t: Strings;
  onSuccess: (method: PaymentMethod, savedForFuture: boolean) => void | Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardholderName, setCardholderName] = useState('');
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentUiReady, setPaymentUiReady] = useState(false);
  const canSubmit = Boolean(stripe && elements && paymentUiReady && !submitting);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Same portal/synthetic-event guard as AddCardModal's own form — see
    // its doc comment.
    e.stopPropagation();
    if (!stripe || !elements || !paymentUiReady || submitting) return;
    if (!cardholderName.trim()) {
      setNameError(t.paymentMethods.cardholderNameRequiredError);
      return;
    }
    setNameError(null);
    setError(null);
    // Required before createPaymentMethod when Elements was mounted in
    // deferred mode (no clientSecret) — validates/collects the
    // PaymentElement's current state (see Elements options above).
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? t.paymentMethods.saveCardError);
      return;
    }
    setSubmitting(true);
    try {
      // billing_details.name is a real PaymentMethod field (not metadata),
      // so unlike metadata it's accepted client-side, passed via `params`
      // per Stripe's deferred-intent API. allow_redisplay mirrors the
      // authenticated SetupIntent path (always = saved, limited = one-time).
      const { error: stripeError, paymentMethod } = await withTimeout(
        withMinDuration(
          stripe.createPaymentMethod({
            elements,
            params: {
              billing_details: { name: cardholderName.trim() },
              allow_redisplay: remember ? 'always' : 'limited',
            },
          }),
          shopConfig.loadingMinMs.normal,
        ),
        shopConfig.paymentTimeoutMs,
      );
      if (stripeError || !paymentMethod) {
        setError(stripeError?.message ?? t.paymentMethods.saveCardError);
        setSubmitting(false);
        return;
      }
      // Saving a guest card uses the encrypted local vault. It is still an
      // asynchronous write and must keep the same explicit loading/error UX
      // as an authenticated server-side registration.
      await withTimeout(
        Promise.resolve(
          onSuccess(
            {
              id: paymentMethod.id,
              brand: paymentMethod.card?.brand ?? 'unknown',
              last4: paymentMethod.card?.last4 ?? '',
              expMonth: paymentMethod.card?.exp_month ?? 0,
              expYear: paymentMethod.card?.exp_year ?? 0,
              cardholderName: cardholderName.trim(),
              savedForFuture: remember,
            },
            remember,
          ),
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
              aria-describedby={nameError ? 'guest-cardholder-name-error' : undefined}
            />
            {nameError && (
              <p id="guest-cardholder-name-error" className={styles.fieldError} role="alert">
                {nameError}
              </p>
            )}
          </label>
          <div className={styles.paymentElement}>
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
        <label className={styles.rememberRow}>
          <input
            type="checkbox"
            onMouseDown={suppressMouseFocus}
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          {t.paymentMethods.rememberCardLabel}
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.buttonRow}>
          <Button type="submit" disabled={!canSubmit} aria-busy={!paymentUiReady}>
            {submitting ? t.paymentMethods.savingCardButton : t.paymentMethods.useCardButton}
          </Button>
        </div>
      </form>
      {submitting && <LoadingModal message={t.paymentMethods.savingCardButton} />}
    </>
  );
}
