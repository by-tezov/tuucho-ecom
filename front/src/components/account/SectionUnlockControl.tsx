import { CloseIcon } from '../ui/CloseIcon';
import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
import { useLang } from '../../assets/i18n';
import { useAuthSession } from '../../state/AuthContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useOtpResendCooldown } from '../../hooks/useOtpResendCooldown';
import type { SectionUnlock } from '../../hooks/useSectionUnlock';
import { Button } from '../ui/Button';
import { PasswordField } from '../auth/PasswordField';
import { OtpCodeInput } from '../auth/OtpCodeInput';
import { OtpResendFooter } from '../auth/OtpResendFooter';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { FIELD_PASSWORD_MAX } from '../../utils/fieldLimits';
import authFormStyles from '../auth/AuthForm.module.css';
import styles from './SectionUnlockControl.module.css';

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="2.5" y="6" width="9" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 6V4.2a2.5 2.5 0 0 1 5 0V6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Small lock-icon trigger shown in a section's header — hidden once
 * unlocked or while the unlock dialog is already open. */
export function SectionUnlockButton({ unlock }: { unlock: SectionUnlock }) {
  const { t } = useLang();
  if (unlock.unlocked || unlock.confirming) return null;
  return (
    <button type="button" className={styles.unlockButton} onClick={unlock.begin}>
      <LockIcon />
      {t.account.unlockButton}
    </button>
  );
}

/** Password re-entry as a centered dialog on every viewport (including
 * mobile) — deliberate stop, not a swipeable bottom sheet. */
/** Only ever mounted by the caller while unlock.confirming is true (see
 * AccountPage.tsx) — useLockBodyScroll locks for as long as this stays
 * mounted, so it must not render (even to bail out to null) while closed. */
export function SectionUnlockPrompt({ unlock }: { unlock: SectionUnlock }) {
  const { t } = useLang();
  const { user } = useAuthSession();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const otpCooldown = useOtpResendCooldown();
  const { start: startOtpCooldown, reset: resetOtpCooldown } = otpCooldown;
  const seenOtpSentRef = useRef(false);
  useLockBodyScroll();
  const requestClose = useHistoryBackClose(unlock.cancel);
  useFocusTrap(panelRef, { onEscape: requestClose, initialFocusRef: passwordInputRef });

  useEffect(() => {
    if (unlock.otpSent && !seenOtpSentRef.current) {
      seenOtpSentRef.current = true;
      startOtpCooldown();
    }
    if (!unlock.otpSent) {
      seenOtpSentRef.current = false;
      resetOtpCooldown();
    }
  }, [unlock.otpSent, startOtpCooldown, resetOtpCooldown]);

  return createPortal(
    <ModalBackdrop className={styles.backdrop ?? ''} label={t.account.unlockButton} onClose={requestClose}>
      <div ref={panelRef} className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>{t.account.unlockButton}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            aria-label={t.auth.closeAria}
          >
            <CloseIcon />
          </button>
        </div>
        <div className={styles.body}>
          {unlock.errorCode && (
            <p className={authFormStyles.error} role="alert">
              {unlock.errorCode === 'invalid_credentials'
                ? t.auth.errorInvalidCredentials
                : unlock.errorCode === 'invalid_or_expired_token'
                  ? t.auth.otpInvalidError
                  : unlock.errorCode === 'resend_limit_exceeded'
                    ? t.auth.resendConfirmationLimitReached
                    : t.auth.errorGeneric}
            </p>
          )}
          {unlock.hasPassword ? (
            <label className={authFormStyles.field}>
              <span className={authFormStyles.label}>{t.account.currentPasswordLabel}</span>
              <PasswordField
                ref={passwordInputRef}
                required
                name="current-password"
                autoComplete="current-password"
                maxLength={FIELD_PASSWORD_MAX}
                value={unlock.password}
                onChange={(e) => unlock.setPassword(e.target.value)}
              />
            </label>
          ) : (
            <>
              <p className={authFormStyles.switchPrompt}>{t.account.unlockOtpPrompt(user?.email ?? '')}</p>
              <OtpCodeInput
                value={unlock.otpCode}
                onChange={unlock.setOtpCode}
                focusOnMount={unlock.otpSent}
                aria-label={t.auth.otpLabel}
              />
              <OtpResendFooter
                cooldown={otpCooldown}
                disabled={unlock.submitting}
                onResend={() => {
                  void unlock.resendOtp().then((ok) => {
                    if (ok) otpCooldown.start();
                  });
                }}
              />
            </>
          )}
          <div className={styles.buttonRow}>
            <Button type="button" disabled={unlock.submitting} onClick={() => void unlock.submit()}>
              {t.account.unlockConfirmButton}
            </Button>
          </div>
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
