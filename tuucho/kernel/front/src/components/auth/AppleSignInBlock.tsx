import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useAuthCommands } from '../../state/AuthContext';
import { ApiError } from '../../api/errors';
import {
  isAppleSignInNeedsConsent,
  isSocialSignInNeedsAccountChoice,
  type AuthSession,
  type SocialSignInNeedsAccountChoice,
} from '../../api/identity';
import { isApiRequestTimeoutError, isBackendUnavailableError } from '../../api/http';
import { shopConfig } from '../../config/env';
import { withMinDuration } from '../../utils/withMinDuration';
import { loadAppleAuthScript } from '../../utils/loadAppleAuthScript';
import { createAppleSignInNonce } from '../../utils/appleNonce';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import authStyles from './AuthForm.module.css';
import styles from './GoogleSignInBlock.module.css';
import socialButtonStyles from './SocialSignInButton.module.css';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import appleIconUrl from '../../assets/images/brand/apple.svg';
import {
  clearAuthConsentDraft,
  loadAuthConsentDraft,
  patchAuthConsentDraft,
  type AuthConsentDraftSurface,
} from '../../state/authConsentDraft';
import { AuthLegalLink } from './AuthLegalLink';
import type { AuthReturnTo } from '../../state/authCredentialsState';

type AppleDivider = 'before' | 'after' | 'none';

interface AppleSignInBlockProps {
  onSuccess: (session: AuthSession) => void;
  /** When true, CGU must be ticked before Apple runs (blocks with an error). */
  consentUpfront?: boolean;
  /** Passed when creating; ignored for returning Apple users server-side. */
  consent?: boolean;
  legalLinkState?: unknown;
  rememberMe?: boolean;
  draftSurface?: AuthConsentDraftSurface;
  disabled?: boolean;
  /** Where to render the "ou" divider relative to the button. Default none. */
  divider?: AppleDivider;
  /** Fired when the post-Apple CGU step opens/closes so the parent can hide
   * the rest of the connect form. */
  onConsentStepChange?: (active: boolean) => void;
  /** Fired when Apple returns a social identity that needs an email choice. */
  onNeedsAccountChoice?: (pending: SocialSignInNeedsAccountChoice) => void;
  /** When set, consent-upfront failures call this and do not render an inline
   * consent error (parent owns placement / copy / style). */
  onConsentBlocked?: () => void;
  /** Called when Apple cannot be offered (no client id, script load failure,
   * or API disabled). Parents should hide this block and fall back. */
  onUnavailable?: () => void;
  /** Closed allowlist destination after a successful /login Apple redirect. */
  authReturnTo?: AuthReturnTo;
}

function appleRedirectUri(): string {
  return shopConfig.appleRedirectUri.replace(/\/$/, '');
}

function newAppleState(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `apple-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AppleSignInBlock({
  onSuccess,
  consentUpfront = false,
  consent = false,
  legalLinkState,
  rememberMe = false,
  draftSurface = 'auth-modal',
  disabled = false,
  divider = 'none',
  onConsentStepChange,
  onNeedsAccountChoice,
  onConsentBlocked,
  onUnavailable,
}: AppleSignInBlockProps) {
  const { t, lang } = useLang();
  const { signInWithApple, completeAppleSignup } = useAuthCommands();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [pendingSignupToken, setPendingSignupToken] = useState<string | null>(() => {
    const draft = loadAuthConsentDraft();
    return draft.appleSignupToken ?? null;
  });
  const [consentStepAccepted, setConsentStepAccepted] = useState(false);
  const restoredConsentRef = useRef(Boolean(pendingSignupToken));
  const unavailableNotifiedRef = useRef(false);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  const initStateRef = useRef(newAppleState());
  const nonceRawRef = useRef<string | null>(null);

  const clientId = shopConfig.appleClientId;
  const enabled = Boolean(clientId) && !disabled;

  const notifyUnavailable = useCallback(() => {
    if (unavailableNotifiedRef.current) return;
    unavailableNotifiedRef.current = true;
    onUnavailableRef.current?.();
  }, []);

  useEffect(() => {
    if (clientId) return;
    notifyUnavailable();
  }, [clientId, notifyUnavailable]);

  useEffect(() => {
    if (!restoredConsentRef.current) return;
    restoredConsentRef.current = false;
    onConsentStepChange?.(true);
  }, [onConsentStepChange]);

  useEffect(() => {
    if (!consent) return;
    setError((prev) => (prev === t.auth.gdprConsentRequiredError ? null : prev));
  }, [consent, t.auth.gdprConsentRequiredError]);

  useEffect(() => {
    if (!enabled || !clientId || pendingSignupToken) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadAppleAuthScript();
        if (cancelled || !window.AppleID?.auth) {
          if (!cancelled) notifyUnavailable();
          return;
        }
        const { raw, hashed } = await createAppleSignInNonce();
        if (cancelled) return;
        nonceRawRef.current = raw;
        window.AppleID.auth.init({
          clientId,
          scope: 'name email',
          redirectURI: appleRedirectUri(),
          usePopup: true,
          state: initStateRef.current,
          nonce: hashed,
        });
        if (!cancelled) setSdkReady(true);
      } catch {
        if (!cancelled) notifyUnavailable();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, clientId, notifyUnavailable, pendingSignupToken]);

  function openConsentStep(token: string) {
    setPendingSignupToken(token);
    setConsentStepAccepted(false);
    patchAuthConsentDraft({ appleSignupToken: token, rememberMe, surface: draftSurface });
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
      case 'invalid_apple_token':
        return t.auth.errorAppleToken;
      case 'apple_email_required':
        return t.auth.errorAppleEmailRequired;
      case 'invalid_or_expired_token':
        return t.auth.otpInvalidError;
      case 'account_locked':
        return t.auth.errorAccountLocked;
      case 'account_security_locked':
        return t.auth.errorAccountSecurityLocked;
      case 'apple_sign_in_disabled':
      case 'sign_in_method_forbidden':
        return t.auth.errorAppleDisabled;
      case 'rate_limited':
      case 'request_timeout':
        return t.auth.authServiceBusy;
      case 'invalid_request':
        return t.auth.errorInvalidRequest;
      default:
        return t.auth.errorGeneric;
    }
  }

  async function handleIdToken(idToken: string, nonce: string) {
    if (consentUpfront && !consent) {
      blockForMissingConsent();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await withMinDuration(
        signInWithApple({
          idToken,
          nonce,
          ...(consent ? { gdprAccepted: true } : {}),
          rememberMe,
          language: lang,
        }),
        shopConfig.loadingMinMs.normal,
      );
      if (isAppleSignInNeedsConsent(result)) {
        openConsentStep(result.appleSignupToken);
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
      if (code === 'apple_sign_in_disabled' || code === 'sign_in_method_forbidden') {
        onUnavailable?.();
        setError(errorMessage(code));
        return;
      }
      setError(errorMessage(code));
    } finally {
      setSubmitting(false);
    }
  }

  function startAppleSignIn() {
    if (consentUpfront && !consent) {
      blockForMissingConsent();
      return;
    }
    if (!window.AppleID?.auth) {
      notifyUnavailable();
      return;
    }
    const nonce = nonceRawRef.current;
    if (!nonce) {
      notifyUnavailable();
      return;
    }
    setError(null);
    // Must run from this click handler — Apple popup requires a user gesture.
    void window.AppleID.auth
      .signIn()
      .then((response) => {
        const token = response.authorization?.id_token;
        if (token) void handleIdToken(token, nonce);
      })
      .catch(() => {
        // User closed the popup — no error banner.
      });
  }

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
        completeAppleSignup({
          appleSignupToken: pendingSignupToken,
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

  if (!clientId || !enabled) return null;

  if (pendingSignupToken) {
    return (
      <div className={`${styles.googleBlock} ${styles.googleConsentStep}`}>
        <p className={styles.consentLead}>{t.auth.appleConsentBody}</p>
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
              data-testid="auth-apple-gdpr-consent"
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
              {t.auth.appleConsentSubmit}
            </Button>
          </div>
        </div>
        <button
          type="button"
          className={`${authStyles.backButton} ${styles.consentDecline}`}
          disabled={submitting}
          onClick={closeConsentStep}
        >
          <span aria-hidden="true">←</span> {t.auth.appleConsentDecline}
        </button>
        {submitting && <LoadingModal message={t.auth.loadingRegister} />}
      </div>
    );
  }

  if (!sdkReady) return null;

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
      <div className={styles.buttonHost} data-testid="auth-apple-button-host">
        <button
          type="button"
          className={socialButtonStyles.socialButton}
          data-provider="apple"
          disabled={submitting}
          onClick={startAppleSignIn}
          data-testid="auth-apple-continue"
        >
          <img src={appleIconUrl} alt="" width={20} height={20} decoding="async" />
          <span>{t.auth.continueWithApple}</span>
        </button>
        {consentUpfront && !consent && (
          <button
            type="button"
            className={styles.consentGate}
            data-testid="auth-apple-consent-gate"
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
