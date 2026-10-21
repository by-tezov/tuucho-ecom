import { useEffect, useState } from 'react';
import { useLang } from '../assets/i18n';
import { ApiError } from '../api/errors';
import { OtpCodeInput } from './auth/OtpCodeInput';
import { ConfirmModal } from './ui/ConfirmModal';
import { LoadingModal } from './ui/LoadingModal';
import authFormStyles from './auth/AuthForm.module.css';
import styles from './GiftPinModal.module.css';

interface GiftPinModalProps {
  onUnlock: (pin: string) => Promise<void>;
  onClose: () => void;
  loadingMessage: string;
}

function formatWait(seconds: number, template: string): string {
  return template.replace('{n}', String(Math.max(0, seconds)));
}

export function GiftPinModal({ onUnlock, onClose, loadingMessage }: GiftPinModalProps) {
  const { t } = useLang();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [waitSec, setWaitSec] = useState(0);
  const [throttledAlert, setThrottledAlert] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const waiting = waitSec > 0;

  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => {
      setWaitSec((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [waiting]);

  function applyThrottleFromError(err: unknown) {
    if (!(err instanceof ApiError)) return;
    const retry =
      typeof err.retryAfterSec === 'number' && err.retryAfterSec > 0
        ? Math.ceil(err.retryAfterSec)
        : err.retryAt
          ? Math.max(0, Math.ceil((Date.parse(err.retryAt) - Date.now()) / 1000))
          : 0;
    if (retry > 0) setWaitSec(retry);
    if (err.throttled || err.code === 'gift_pin_throttled') setThrottledAlert(true);
  }

  async function submit() {
    if (submitting || waiting) return;
    if (pin.length !== 4) {
      setError(t.gift.pinInvalid);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onUnlock(pin);
    } catch (err) {
      setPin('');
      applyThrottleFromError(err);
      if (err instanceof ApiError && err.code === 'gift_pin_throttled') {
        setError(null);
      } else if (err instanceof ApiError && err.code === 'gift_pin_locked') {
        setError(t.gift.pinLocked);
      } else if (err instanceof ApiError && err.code === 'gift_pin_invalid') {
        setError(t.gift.pinWrong);
      } else {
        setError(t.gift.genericError);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const waitMessage = waiting ? formatWait(waitSec, t.gift.pinWait) : null;

  return (
    <>
      <ConfirmModal
        variant="dialog"
        title={t.gift.pinModalTitle}
        confirmLabel={t.gift.pinModalConfirm}
        closeLabel={t.gift.pinModalClose}
        onCancel={() => {
          if (submitting) return;
          onClose();
        }}
        onConfirm={() => {
          void submit();
        }}
        message={
          <>
            <p>{t.gift.pinModalBody}</p>
            {throttledAlert ? (
              <p className={authFormStyles.fieldError} role="alert">
                {t.gift.pinThrottleAlert}
              </p>
            ) : null}
            <div className={styles.pinWrap}>
              <OtpCodeInput
                id="gift-pin-unlock"
                data-testid="gift-pin-input"
                length={4}
                value={pin}
                onChange={(value) => {
                  setPin(value);
                  setError(null);
                }}
                invalid={error != null}
                disabled={submitting || waiting}
                compact
                focusOnMount
                autoComplete="off"
                aria-label={t.gift.pinLabel}
                {...(error || waitMessage
                  ? { 'aria-describedby': error ? 'gift-access-pin-error' : 'gift-access-pin-wait' }
                  : {})}
              />
            </div>
            {error ? (
              <p
                id="gift-access-pin-error"
                data-testid="gift-pin-error"
                className={authFormStyles.fieldError}
                role="alert"
              >
                {error}
              </p>
            ) : null}
            {waitMessage ? (
              <p id="gift-access-pin-wait" className={authFormStyles.fieldError} role="status">
                {waitMessage}
              </p>
            ) : null}
          </>
        }
      />
      {submitting ? <LoadingModal message={loadingMessage} /> : null}
    </>
  );
}
