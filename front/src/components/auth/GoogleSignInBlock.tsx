import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useAuthCommands } from '../../state/AuthContext';
import { ApiError } from '../../api/errors';
import {
  isGoogleSignInNeedsConsent,
  isSocialSignInNeedsAccountChoice,
  type AuthSession,
  type SocialSignInNeedsAccountChoice,
} from '../../api/identity';
import { isApiRequestTimeoutError, isBackendUnavailableError } from '../../api/http';
import { shopConfig } from '../../config/env';
import { withMinDuration } from '../../utils/withMinDuration';
import { loadGoogleIdentityScript } from '../../utils/loadGoogleIdentityScript';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import authStyles from './AuthForm.module.css';
import styles from './GoogleSignInBlock.module.css';
import socialButtonStyles from './SocialSignInButton.module.css';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import googleIconUrl from '../../assets/images/brand/google-g.svg';
import {
  clearAuthConsentDraft,
  loadAuthConsentDraft,
  patchAuthConsentDraft,
  type AuthConsentDraftSurface,
} from '../../state/authConsentDraft';
import { AuthLegalLink } from './AuthLegalLink';

type GoogleButtonText = 'continue_with' | 'signin_with' | 'signup_with';
type GoogleDivider = 'before' | 'after' | 'none';

interface GoogleSignInBlockProps {
  onSuccess: (session: AuthSession) => void;
  /** When true, CGU must be ticked before Google runs (blocks with an error). */
  consentUpfront?: boolean;
  /** Passed when creating; ignored for returning Google users server-side. */
  consent?: boolean;
  legalLinkState?: unknown;
  rememberMe?: boolean;
  /** Tags the session draft so AuthModal does not steal cart /login resumes. */
  draftSurface?: AuthConsentDraftSurface;
  disabled?: boolean;
  /** GIS button label. Default continue_with for unified connect. */
  buttonText?: GoogleButtonText;
  /** Where to render the "ou" divider relative to the button. Default none
   * (parent owns the separator when Google is first). */
  divider?: GoogleDivider;
  /** Fired when the post-Google CGU step opens/closes so the parent can hide
   * the rest of the connect form. */
  onConsentStepChange?: (active: boolean) => void;
  /** Verbose social: create vs link when email is unknown. */
  onNeedsAccountChoice?: (pending: SocialSignInNeedsAccountChoice) => void;
  /** When set, consent-upfront failures call this and do not render an inline
   * consent error (parent owns placement / copy / style). */
  onConsentBlocked?: () => void;
  /** Called when Google cannot be offered (no client id, script load failure,
   * or API disabled). Parents should hide this block and fall back to email. */
  onUnavailable?: () => void;
}

export function GoogleSignInBlock({
  onSuccess,
  consentUpfront = false,
  consent = false,
  legalLinkState,
  rememberMe = false,
  draftSurface = 'auth-modal',
  disabled = false,
  buttonText = 'continue_with',
  divider = 'none',
  onConsentStepChange,
  onNeedsAccountChoice,
  onConsentBlocked,
  onUnavailable,
}: GoogleSignInBlockProps) {
  const { t, lang } = useLang();
  const { signInWithGoogle, completeGoogleSignup } = useAuthCommands();
  const hiddenGoogleButtonHostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [pendingSignupToken, setPendingSignupToken] = useState<string | null>(() => {
    const draft = loadAuthConsentDraft();
    return draft.googleSignupToken ?? null;
  });
  const [consentStepAccepted, setConsentStepAccepted] = useState(false);
  const restoredConsentRef = useRef(Boolean(pendingSignupToken));
  const unavailableNotifiedRef = useRef(false);
  const onUnavailableRef = useRef(onUnavailable);
  const handleCredentialRef = useRef<(idToken: string) => void>(() => {});
  onUnavailableRef.current = onUnavailable;

  const clientId = shopConfig.googleClientId;
  const enabled = Boolean(clientId) && !disabled;

  const notifyUnavailable = useCallback(() => {
    if (unavailableNotifiedRef.current) return;
    unavailableNotifiedRef.current = true;
    onUnavailableRef.current?.();
  }, []);

  useEffect(() => {
    if (enabled) return;
    notifyUnavailable();
  }, [enabled, notifyUnavailable]);

  useEffect(() => {
    if (!restoredConsentRef.current) return;
    restoredConsentRef.current = false;
    onConsentStepChange?.(true);
  }, [onConsentStepChange]);

  useEffect(() => {
    if (!consent) return;
    setError((prev) => (prev === t.auth.gdprConsentRequiredError ? null : prev));
  }, [consent, t.auth.gdprConsentRequiredError]);

  function openConsentStep(token: string) {
    setPendingSignupToken(token);
    setConsentStepAccepted(false);
    patchAuthConsentDraft({ googleSignupToken: token, rememberMe, surface: draftSurface });
    onConsentStepChange?.(true);
  }

  function closeConsentStep() {
    setPendingSignupToken(null);
    setConsentStepAccepted(false);
    clearAuthConsentDraft({ force: true });
    onConsentStepChange?.(false);
  }

  function blockForMissingConsent() {
    if (onConsentBlocked) {
      onConsentBlocked();
      setError(null);
      return;
    }
    setError(t.auth.gdprConsentRequiredError);
  }

  function errorMessage(code: string): string {
    switch (code) {
      case 'invalid_google_token':
        return t.auth.errorGoogleToken;
      case 'invalid_or_expired_token':
        return t.auth.otpInvalidError;
      case 'account_locked':
        return t.auth.errorAccountLocked;
      case 'account_security_locked':
        return t.auth.errorAccountSecurityLocked;
      case 'google_sign_in_disabled':
      case 'sign_in_method_forbidden':
        return t.auth.errorGoogleDisabled;
      case 'rate_limited':
      case 'request_timeout':
        return t.auth.authServiceBusy;
      case 'invalid_request':
        return t.auth.errorInvalidRequest;
      default:
        return t.auth.errorGeneric;
    }
  }

  async function handleCredential(idToken: string) {
    if (consentUpfront && !consent) {
      blockForMissingConsent();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await withMinDuration(
        signInWithGoogle({
          idToken,
          ...(consent ? { gdprAccepted: true } : {}),
          rememberMe,
          language: lang,
        }),
        shopConfig.loadingMinMs.normal,
      );
      if (isGoogleSignInNeedsConsent(result)) {
        openConsentStep(result.googleSignupToken);
        return;
      }
      if (isSocialSignInNeedsAccountChoice(result)) {
        onNeedsAccountChoice?.(result);
        return;
      }
      onSuccess(result);
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      const code =
        err instanceof ApiError
          ? err.code
          : isApiRequestTimeoutError(err)
            ? 'request_timeout'
            : 'unknown_error';
      if (code === 'google_sign_in_disabled' || code === 'sign_in_method_forbidden') {
        onUnavailable?.();
        setError(errorMessage(code));
        return;
      }
      setError(errorMessage(code));
    } finally {
      setSubmitting(false);
    }
  }

  handleCredentialRef.current = handleCredential;

  async function handleCompleteSignup() {
    if (!pendingSignupToken) return;
    if (!consentStepAccepted) {
      setError(t.auth.gdprConsentRequiredError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const session = await withMinDuration(
        completeGoogleSignup({
          googleSignupToken: pendingSignupToken,
          gdprAccepted: true,
          rememberMe: loadAuthConsentDraft().rememberMe ?? rememberMe,
        }),
        shopConfig.loadingMinMs.normal,
      );
      setPendingSignupToken(null);
      clearAuthConsentDraft({ force: true });
      onConsentStepChange?.(false);
      onSuccess(session);
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      setError(
        errorMessage(
          err instanceof ApiError
            ? err.code
            : isApiRequestTimeoutError(err)
              ? 'request_timeout'
              : 'unknown_error',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!enabled || pendingSignupToken) return;
    let cancelled = false;
    const host = hiddenGoogleButtonHostRef.current;
    if (!host) return;

    function paintButton() {
      if (cancelled || !hiddenGoogleButtonHostRef.current || !clientId) return;
      const google = window.google?.accounts?.id;
      if (!google) return;
      const hostEl = hiddenGoogleButtonHostRef.current;
      hostEl.replaceChildren();
      google.initialize({
        client_id: clientId,
        callback: (response) => {
          const token = response.credential;
          if (token) void handleCredentialRef.current(token);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      const width = Math.min(400, Math.floor(hostEl.parentElement?.getBoundingClientRect().width ?? 400));
      google.renderButton(hostEl, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: buttonText,
        width: width > 0 ? width : 400,
        locale: lang,
      });
      if (!cancelled) setSdkReady(true);
    }

    void (async () => {
      try {
        await loadGoogleIdentityScript();
        if (cancelled) return;
        paintButton();
      } catch {
        if (!cancelled) notifyUnavailable();
      }
    })();

    return () => {
      cancelled = true;
      setSdkReady(false);
    };
  }, [buttonText, clientId, enabled, lang, notifyUnavailable, pendingSignupToken]);

  function googleButtonLabel(): string {
    switch (buttonText) {
      case 'signin_with':
        return t.auth.signInWithGoogle;
      case 'signup_with':
        return t.auth.signUpWithGoogle;
      default:
        return t.auth.continueWithGoogle;
    }
  }

  if (!clientId || !enabled) return null;

  if (pendingSignupToken) {
    return (
      <div className={`${styles.googleBlock} ${styles.googleConsentStep}`}>
        <p className={styles.consentLead}>{t.auth.googleConsentBody}</p>
        <div className={styles.consentSeparator} aria-hidden="true" />
        <div className={styles.consentMiddle}>
          {error && (
            <p className={authStyles.error} role="alert">
              {error}
            </p>
          )}
          <label className={authStyles.consentField}>
            <input
              type="checkbox"
              onMouseDown={suppressMouseFocus}
              checked={consentStepAccepted}
              onChange={(event) => {
                setConsentStepAccepted(event.target.checked);
                if (error) setError(null);
              }}
              data-testid="auth-google-gdpr-consent"
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
              .
            </span>
          </label>
          <div className={styles.consentActions}>
            <Button type="button" disabled={submitting} onClick={() => void handleCompleteSignup()}>
              {t.auth.googleConsentSubmit}
            </Button>
          </div>
        </div>
        <button
          type="button"
          className={`${authStyles.backButton} ${styles.consentDecline}`}
          disabled={submitting}
          onClick={closeConsentStep}
        >
          <span aria-hidden="true">←</span> {t.auth.googleConsentDecline}
        </button>
        {submitting && <LoadingModal message={t.auth.loadingRegister} />}
      </div>
    );
  }

  const dividerEl =
    divider === 'none' ? null : (
      <div className={styles.divider} aria-hidden="true">
        {t.auth.orContinueWith}
      </div>
    );

  return (
    <div className={styles.googleBlock}>
      {divider === 'before' && dividerEl}
      {error && (
        <p className={authStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.buttonHost} data-testid="auth-google-button-host">
        {sdkReady && (
          <button
            type="button"
            className={`${socialButtonStyles.socialButton} ${styles.customGoogleButton}`}
            disabled={submitting}
            tabIndex={-1}
            aria-hidden="true"
            data-testid="auth-google-continue"
          >
            <img src={googleIconUrl} alt="" width={20} height={20} decoding="async" />
            <span>{googleButtonLabel()}</span>
          </button>
        )}
        <div
          ref={hiddenGoogleButtonHostRef}
          className={`${styles.hiddenGoogleButtonHost}${submitting ? ` ${styles.hiddenGoogleButtonHostDisabled}` : ''}`}
        />
        {consentUpfront && !consent && sdkReady && (
          <button
            type="button"
            className={styles.consentGate}
            data-testid="auth-google-consent-gate"
            aria-label={t.auth.gdprConsentRequiredError}
            onClick={blockForMissingConsent}
          />
        )}
      </div>
      {divider === 'after' && dividerEl}
      {submitting && <LoadingModal message={t.auth.loadingLogin} />}
    </div>
  );
}
