import { CloseIcon } from '../ui/CloseIcon';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { adminPath, isStaffRole } from '../../utils/adminRoute';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import type { AuthMode } from '../../state/AuthContext';
import {
  clearAuthConsentDraft,
  endAuthLegalDetour,
  hasPendingAuthConsentDraft,
  loadAuthConsentDraft,
} from '../../state/authConsentDraft';
import { LoginForm } from './LoginForm';
import { AuthWelcome } from './AuthWelcome';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import styles from './AuthModal.module.css';
import { useScrollHint } from '../../hooks/useScrollHint';
import { useDragScroll } from '../../hooks/useDragScroll';

export type { AuthMode };

interface AuthModalProps {
  initialMode?: AuthMode;
  /** Pre-fills the email field — e.g. from the cart page's guest checkout
   * card, so typing it once there carries over instead of asking again. */
  initialEmail?: string;
  /** True while /terms|/privacy is shown — keep React tree mounted (consent
   * step state) but hide the overlay and release scroll/history ownership. */
  suspended?: boolean;
  onClose: () => void;
}

/** Desktop connect overlay — same portal/scroll-lock/focus-trap recipe as
 * the gallery modals (PhotoLightbox.tsx), but deliberately does NOT close
 * on a backdrop click (unlike those) — this modal holds a partially-filled
 * form (email/password), and a click "outside" fires just as easily from
 * selecting/copying text (e.g. from a password manager) as from an actual
 * intent to dismiss, silently discarding what was typed. Escape and the
 * explicit close button remain the only ways out. Below the 1024px
 * desktop-nav breakpoint, AccountControl navigates to dedicated pages
 * instead of opening this.
 *
 * CGU/privacy links leave the modal mounted but `suspended` so Back restores
 * "Accepter les conditions" instead of remounting on the social-first screen. */
export function AuthModal({ initialEmail, suspended = false, onClose }: AuthModalProps) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [consentStepActive, setConsentStepActive] = useState(() => {
    const draft = loadAuthConsentDraft();
    return (
      Boolean(draft.googleSignupToken || draft.appleSignupToken || draft.facebookSignupToken) ||
      draft.step === 'password' ||
      draft.step === 'otp' ||
      draft.socialChoiceStep === 'consent'
    );
  });
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const { scrollHint, updateScrollHint } = useScrollHint(bodyRef);
  const isConsent = consentStepActive;
  const bodyDragScroll = useDragScroll<HTMLDivElement>({
    ignore: 'input, select, textarea, button, a, iframe, label',
    preventSelection: false,
    enabled: !isConsent,
  });
  const title = t.auth.modalTitleLogin;

  useLockBodyScroll(!suspended);

  const requestClose = useHistoryBackClose(handleClose, !suspended);

  function handleClose() {
    // While suspended on CGU/privacy, platform back should leave the legal
    // page (history) — not dismiss connect. Overlay reclaim is disabled via
    // `enabled: !suspended`; this is a safety net if close still fires.
    if (suspended) return;
    clearAuthConsentDraft({ force: true });
    onClose();
  }

  function handleExplicitClose() {
    endAuthLegalDetour();
    clearAuthConsentDraft({ force: true });
    requestClose();
  }

  useFocusTrap(dialogRef, {
    onEscape: handleExplicitClose,
    enabled: !suspended,
  });

  // After return from legal pages, drop the detour flag once consent chrome
  // is stable so a later ✕ / back is a real dismiss.
  useEffect(() => {
    if (suspended || !consentStepActive) return;
    if (!hasPendingAuthConsentDraft()) return;
    const timer = window.setTimeout(() => endAuthLegalDetour(), 500);
    return () => window.clearTimeout(timer);
  }, [suspended, consentStepActive]);

  useLayoutEffect(() => {
    if (suspended) return;
    bodyRef.current?.scrollTo({ top: 0 });
    updateScrollHint();
    window.addEventListener('resize', updateScrollHint);
    return () => window.removeEventListener('resize', updateScrollHint);
  }, [isConsent, suspended, updateScrollHint]);

  useEffect(() => {
    if (suspended) return;
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
  }, [isConsent, suspended, updateScrollHint]);

  const closeButton = (
    <button
      type="button"
      className={styles.closeButton}
      onClick={handleExplicitClose}
      aria-label={t.auth.closeAria}
      data-modal-close
    >
      <CloseIcon />
    </button>
  );

  // One portal tree so LoginForm is not remounted when the CGU chrome
  // swaps — that used to wipe the OTP screen and dump the visitor back
  // on Google / Facebook with no error. `suspended` only hides the overlay
  // (legal detour) without tearing down that tree.
  return createPortal(
    <ModalBackdrop
      className={styles.backdrop ?? ''}
      label={title}
      onClose={handleExplicitClose}
      closeOnBackdropClick={false}
      hidden={suspended}
    >
      <div
        ref={dialogRef}
        className={isConsent ? `${styles.dialog} ${styles.dialogConsent}` : styles.dialog}
        {...(isConsent ? { 'aria-labelledby': 'auth-consent-title' } : { 'aria-label': title })}
      >
        {isConsent ? (
          <div className={styles.consentHeader}>
            <h2 id="auth-consent-title" className={styles.consentTitle}>
              {t.auth.googleConsentTitle}
            </h2>
            {closeButton}
          </div>
        ) : (
          <div className={styles.header}>
            <h2 className={`${styles.title} ${styles.authTitle}`}>{title}</h2>
            {closeButton}
          </div>
        )}
        <div className={isConsent ? styles.consentBody : styles.bodyWrap}>
          <div
            ref={bodyRef}
            className={isConsent ? styles.consentBodyInner : styles.body}
            onScroll={isConsent ? undefined : updateScrollHint}
            {...bodyDragScroll}
          >
            <div ref={contentRef} {...(isConsent ? { className: styles.consentContent } : {})}>
              <AuthWelcome
                sentences={t.auth.loginWelcome}
                className={
                  isConsent
                    ? (styles.chromeHidden ?? '')
                    : `${styles.authWelcome ?? ''} ${styles.authWelcomeInBody ?? ''}`
                }
                {...(styles.authWelcomeLast ? { lastClassName: styles.authWelcomeLast } : {})}
              />
              <LoginForm
                email={email}
                onEmailChange={setEmail}
                password={password}
                onPasswordChange={setPassword}
                onConsentStepChange={setConsentStepActive}
                onSuccess={(session) => {
                  clearAuthConsentDraft({ force: true });
                  onClose();
                  if (isStaffRole(session.user.role)) navigate(adminPath());
                }}
              />
            </div>
          </div>
          {!isConsent && scrollHint.up && (
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
          {!isConsent && scrollHint.down && (
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
          {!isConsent && (scrollHint.up || scrollHint.down) && (
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
