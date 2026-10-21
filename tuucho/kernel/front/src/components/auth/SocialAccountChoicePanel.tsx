import { useEffect, useState, type FormEvent } from 'react';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useAuthCommands } from '../../state/AuthContext';
import { ApiError } from '../../api/errors';
import { type AuthSession, type SocialSignInNeedsAccountChoice } from '../../api/identity';
import { isApiRequestTimeoutError, isBackendUnavailableError } from '../../api/http';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import { OtpCodeInput } from './OtpCodeInput';
import { OtpResendFooter } from './OtpResendFooter';
import { AuthLegalLink } from './AuthLegalLink';
import { useOtpResendCooldown } from '../../hooks/useOtpResendCooldown';
import { shopConfig } from '../../config/env';
import { withMinDuration, withTimeout } from '../../utils/withMinDuration';
import { FIELD_EMAIL_MAX } from '../../utils/fieldLimits';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import {
  clearAuthConsentDraft,
  loadAuthConsentDraft,
  patchAuthConsentDraft,
  type AuthConsentDraftSurface,
} from '../../state/authConsentDraft';
import styles from './AuthForm.module.css';
import otpResendStyles from './OtpResendFooter.module.css';

const AUTH_REQUEST_TIMEOUT_MS = 20_000;

type ChoiceView = 'choice' | 'consent' | 'linkEmail' | 'linkOtp';

function isChoiceView(value: unknown): value is ChoiceView {
  return value === 'choice' || value === 'consent' || value === 'linkEmail' || value === 'linkOtp';
}

interface SocialAccountChoicePanelProps {
  pending: SocialSignInNeedsAccountChoice;
  rememberMe: boolean;
  legalLinkState?: unknown;
  onSuccess: (session: AuthSession) => void;
  onCancel: () => void;
  /** Parent swaps title chrome for the CGU step (AuthModal / cart Identification). */
  onConsentStepChange?: (active: boolean) => void;
  draftSurface?: AuthConsentDraftSurface;
}

export function SocialAccountChoicePanel({
  pending,
  rememberMe,
  legalLinkState,
  onSuccess,
  onCancel,
  onConsentStepChange,
  draftSurface = 'auth-modal',
}: SocialAccountChoicePanelProps) {
  const { t, lang } = useLang();
  const { createSocialAccount, requestSocialLinkOtp, verifySocialLinkOtp } = useAuthCommands();
  const [view, setViewState] = useState<ChoiceView>(() => {
    const step = loadAuthConsentDraft().socialChoiceStep;
    return isChoiceView(step) ? step : 'choice';
  });
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [email, setEmail] = useState(() => loadAuthConsentDraft().socialLinkEmail ?? '');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [linkBlocked, setLinkBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const otpCooldown = useOtpResendCooldown();

  useEffect(() => {
    onConsentStepChange?.(view === 'consent');
    return () => onConsentStepChange?.(false);
  }, [view, onConsentStepChange]);

  function setView(next: ChoiceView) {
    setViewState(next);
    patchAuthConsentDraft({
      socialChoiceStep: next,
      surface: draftSurface,
      ...((next === 'linkEmail' || next === 'linkOtp') && email.trim()
        ? { socialLinkEmail: email.trim() }
        : {}),
    });
  }

  function isLinkConflict(code: string): boolean {
    return (
      code === 'google_already_linked' ||
      code === 'apple_already_linked' ||
      code === 'facebook_already_linked'
    );
  }

  function errorMessage(code: string): string {
    switch (code) {
      case 'account_not_found':
        return t.auth.errorSocialAccountNotFound;
      case 'google_already_linked':
      case 'apple_already_linked':
      case 'facebook_already_linked':
        return t.auth.errorSocialLinkImpossible;
      case 'email_already_used':
        return t.account.errorEmailAlreadyUsed;
      case 'apple_email_required':
        return t.auth.errorAppleEmailRequired;
      case 'invalid_or_expired_token':
        return t.auth.otpInvalidError;
      case 'resend_limit_exceeded':
        return t.auth.resendConfirmationLimitReached;
      case 'rate_limited':
      case 'request_timeout':
        return t.auth.authServiceBusy;
      default:
        return t.auth.errorGeneric;
    }
  }

  async function handleCreate() {
    setError(null);
    setLinkBlocked(false);
    if (!consentAccepted) {
      setView('consent');
      return;
    }
    setSubmitting(true);
    try {
      const session = await withMinDuration(
        withTimeout(
          createSocialAccount({
            socialPendingToken: pending.socialPendingToken,
            gdprAccepted: true,
            rememberMe,
          }),
          AUTH_REQUEST_TIMEOUT_MS,
        ),
        shopConfig.loadingMinMs.normal,
      );
      clearAuthConsentDraft({ force: true });
      onSuccess(session);
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      const code =
        err instanceof ApiError
          ? err.code
          : isApiRequestTimeoutError(err)
            ? 'request_timeout'
            : 'unknown_error';
      setError(errorMessage(code));
    } finally {
      setSubmitting(false);
    }
  }

  async function sendLinkOtp() {
    if (linkBlocked) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setError(t.auth.emailRequiredError);
      return;
    }
    setError(null);
    setSubmitting(true);
    setSendingOtp(true);
    try {
      await withMinDuration(
        withTimeout(
          requestSocialLinkOtp({
            socialPendingToken: pending.socialPendingToken,
            email: trimmed,
          }),
          AUTH_REQUEST_TIMEOUT_MS,
        ),
        shopConfig.loadingMinMs.long,
      );
      otpCooldown.start();
      setOtp('');
      setView('linkOtp');
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      const code =
        err instanceof ApiError
          ? err.code
          : isApiRequestTimeoutError(err)
            ? 'request_timeout'
            : 'unknown_error';
      if (isLinkConflict(code)) setLinkBlocked(true);
      setError(errorMessage(code));
    } finally {
      setSubmitting(false);
      setSendingOtp(false);
    }
  }

  async function handleVerifyLink(event: FormEvent) {
    event.preventDefault();
    if (linkBlocked) return;
    if (otp.length !== 6) {
      setError(t.auth.otpInvalidError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const session = await withMinDuration(
        withTimeout(
          verifySocialLinkOtp({
            socialPendingToken: pending.socialPendingToken,
            email: email.trim(),
            code: otp,
            rememberMe,
          }),
          AUTH_REQUEST_TIMEOUT_MS,
        ),
        shopConfig.loadingMinMs.normal,
      );
      clearAuthConsentDraft({ force: true });
      onSuccess(session);
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      const code =
        err instanceof ApiError
          ? err.code
          : isApiRequestTimeoutError(err)
            ? 'request_timeout'
            : 'unknown_error';
      if (isLinkConflict(code)) setLinkBlocked(true);
      setError(errorMessage(code));
    } finally {
      setSubmitting(false);
    }
  }

  if (view === 'consent') {
    return (
      <div className={`${styles.form} ${styles.loginForm}`}>
        <p className={styles.switchPrompt}>{t.auth.socialAccountChoiceConsentBody}</p>
        <label className={styles.consentField}>
          <input
            type="checkbox"
            onMouseDown={suppressMouseFocus}
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
          />
          <span>
            {t.auth.gdprConsentPrefix}{' '}
            <AuthLegalLink to={localizedPath('/terms', lang)} state={legalLinkState}>
              {t.footer.termsLink}
            </AuthLegalLink>{' '}
            {t.auth.gdprConsentAnd}{' '}
            <AuthLegalLink to={localizedPath('/privacy', lang)} state={legalLinkState}>
              {t.footer.privacyLink}
            </AuthLegalLink>
          </span>
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.loginActions}>
          <Button
            type="button"
            className={styles.submitButton}
            disabled={submitting}
            onClick={() => void handleCreate()}
          >
            {t.auth.socialAccountChoiceCreate}
          </Button>
          <button
            type="button"
            className={styles.backButton}
            disabled={submitting}
            onClick={() => {
              // Leave create/link entirely — parent returns to the first connect screen.
              clearAuthConsentDraft({ force: true });
              onCancel();
            }}
          >
            <span aria-hidden="true">←</span> {t.auth.googleConsentDecline}
          </button>
        </div>
        {submitting && <LoadingModal message={t.auth.loadingRegister} />}
      </div>
    );
  }

  if (view === 'linkEmail') {
    return (
      <form
        className={`${styles.form} ${styles.loginForm}`}
        onSubmit={(e) => {
          e.preventDefault();
          void sendLinkOtp();
        }}
        noValidate
      >
        <p className={styles.switchPrompt}>{t.auth.socialAccountChoiceLinkHint}</p>
        <label className={styles.field}>
          <span className={styles.label}>{t.auth.emailLabel}</span>
          <input
            type="email"
            autoComplete="email"
            maxLength={FIELD_EMAIL_MAX}
            value={email}
            disabled={linkBlocked}
            onChange={(e) => {
              const next = e.target.value;
              setEmail(next);
              patchAuthConsentDraft(next.trim() ? { socialLinkEmail: next.trim() } : {});
              if (error) setError(null);
            }}
            required
          />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.loginActions}>
          {!linkBlocked && (
            <Button
              type="submit"
              className={styles.submitButton}
              disabled={submitting || otpCooldown.isCoolingDown}
            >
              {t.auth.otpRequestSubmit}
            </Button>
          )}
          {!linkBlocked && otpCooldown.isCoolingDown && (
            <p className={otpResendStyles.countdown} role="status" aria-live="polite">
              {t.auth.otpResendCountdown(otpCooldown.remainingMinutes, otpCooldown.remainingSeconds)}
            </p>
          )}
          <button
            type="button"
            className={styles.backButton}
            disabled={submitting}
            onClick={() => {
              setView('choice');
              setError(null);
              setLinkBlocked(false);
            }}
          >
            <span aria-hidden="true">←</span> {t.auth.backToLogin}
          </button>
        </div>
        {submitting && (
          <LoadingModal message={sendingOtp ? t.auth.loadingOtp(email.trim()) : t.auth.loadingLogin} />
        )}
      </form>
    );
  }

  if (view === 'linkOtp') {
    return (
      <form className={`${styles.form} ${styles.loginForm}`} onSubmit={handleVerifyLink} noValidate>
        <p className={styles.switchPrompt}>{t.auth.otpHint(email.trim())}</p>
        <OtpCodeInput
          value={otp}
          onChange={(next) => {
            setOtp(next);
            if (error && !linkBlocked) setError(null);
          }}
          invalid={error != null}
          focusOnMount={!linkBlocked}
          aria-label={t.auth.otpLabel}
          disabled={linkBlocked}
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {!linkBlocked && (
          <OtpResendFooter
            cooldown={otpCooldown}
            disabled={submitting}
            onResend={() => {
              void sendLinkOtp();
            }}
          />
        )}
        <div className={styles.loginActions}>
          {!linkBlocked && (
            <Button type="submit" className={styles.submitButton} disabled={submitting}>
              {t.auth.otpSubmit}
            </Button>
          )}
          <button
            type="button"
            className={styles.backButton}
            disabled={submitting}
            onClick={() => {
              setView('linkEmail');
              setOtp('');
              if (!linkBlocked) setError(null);
            }}
          >
            <span aria-hidden="true">←</span> {t.auth.backToLogin}
          </button>
        </div>
        {submitting && !sendingOtp && <LoadingModal message={t.auth.loadingOtpVerify} />}
        {submitting && sendingOtp && <LoadingModal message={t.auth.loadingOtp(email.trim())} />}
      </form>
    );
  }

  return (
    <div className={`${styles.form} ${styles.loginForm}`}>
      {pending.socialEmail && (
        <p className={styles.switchPrompt}>
          {t.auth.socialAccountChoiceEmailLabel}: {pending.socialEmail}
        </p>
      )}
      <p className={styles.choicePrompt}>{t.auth.socialAccountChoicePrompt}</p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.loginActions}>
        <Button
          type="button"
          className={styles.choiceActionButton}
          disabled={submitting}
          onClick={() => {
            setError(null);
            void handleCreate();
          }}
        >
          {t.auth.socialAccountChoiceCreate}
        </Button>
        <button
          type="button"
          className={styles.choiceLink}
          disabled={submitting}
          onClick={() => {
            setError(null);
            setView('linkEmail');
          }}
        >
          {t.auth.socialAccountChoiceLink}
        </button>
        <button
          type="button"
          className={styles.backButton}
          disabled={submitting}
          onClick={() => {
            clearAuthConsentDraft({ force: true });
            onCancel();
          }}
        >
          <span aria-hidden="true">←</span> {t.auth.backToLogin}
        </button>
      </div>
      {submitting && <LoadingModal message={t.auth.loadingRegister} />}
    </div>
  );
}

export function persistSocialAccountChoice(
  pending: SocialSignInNeedsAccountChoice,
  rememberMe: boolean,
  surface: AuthConsentDraftSurface = 'auth-modal',
) {
  patchAuthConsentDraft({
    socialPendingToken: pending.socialPendingToken,
    socialProvider: pending.provider,
    socialEmail: pending.socialEmail,
    socialChoiceStep: 'choice',
    rememberMe,
    surface,
  });
}
