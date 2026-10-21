import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useAuthCommands } from '../../state/AuthContext';
import { ApiError } from '../../api/errors';
import {
  isFacebookSignInNeedsConsent,
  isSocialSignInNeedsAccountChoice,
  type AuthSession,
  type SocialSignInNeedsAccountChoice,
} from '../../api/identity';
import { isApiRequestTimeoutError, isBackendUnavailableError } from '../../api/http';
import { shopConfig } from '../../config/env';
import { withMinDuration } from '../../utils/withMinDuration';
import { loadFacebookSdk } from '../../utils/loadFacebookSdk';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import authStyles from './AuthForm.module.css';
import styles from './GoogleSignInBlock.module.css';
import socialButtonStyles from './SocialSignInButton.module.css';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import {
  clearAuthConsentDraft,
  loadAuthConsentDraft,
  patchAuthConsentDraft,
  type AuthConsentDraftSurface,
} from '../../state/authConsentDraft';
import { AuthLegalLink } from './AuthLegalLink';
import {
  beginFacebookOAuthReturn,
  createFacebookOAuthState,
  facebookBrowserOAuthUrl,
  facebookLoginDialogOptions,
  isFacebookMobileBrowser,
  takeFacebookOAuthReturnPending,
} from '../../state/facebookOAuthReturn';
import type { AuthReturnTo } from '../../state/authCredentialsState';
import facebookIconUrl from '../../assets/images/brand/facebook-f.svg';

type FacebookDivider = 'before' | 'after' | 'none';

interface FacebookSignInBlockProps {
  onSuccess: (session: AuthSession) => void;
  consentUpfront?: boolean;
  consent?: boolean;
  legalLinkState?: unknown;
  rememberMe?: boolean;
  draftSurface?: AuthConsentDraftSurface;
  disabled?: boolean;
  divider?: FacebookDivider;
  onConsentStepChange?: (active: boolean) => void;
  onNeedsAccountChoice?: (pending: SocialSignInNeedsAccountChoice) => void;
  onConsentBlocked?: () => void;
  onUnavailable?: () => void;
  /** Closed allowlist destination after a successful /login Facebook redirect. */
  authReturnTo?: AuthReturnTo;
  /** Mobile only: direct web OAuth when true; desktop always uses FB.login. */
  mobileDirectOAuthEnabled?: boolean;
}

export function FacebookSignInBlock({
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
  authReturnTo: authReturnToOption,
  mobileDirectOAuthEnabled = true,
}: FacebookSignInBlockProps) {
  const { t, lang } = useLang();
  const location = useLocation();
  const { signInWithFacebook, completeFacebookSignup } = useAuthCommands();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [pendingSignupToken, setPendingSignupToken] = useState<string | null>(() => {
    const draft = loadAuthConsentDraft();
    return draft.facebookSignupToken ?? null;
  });
  const [consentStepAccepted, setConsentStepAccepted] = useState(false);
  const restoredConsentRef = useRef(Boolean(pendingSignupToken));
  const unavailableNotifiedRef = useRef(false);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  const appId = shopConfig.facebookAppId;
  const enabled = Boolean(appId) && !disabled;
  const mobileBrowser = isFacebookMobileBrowser();

  const notifyUnavailable = useCallback(() => {
    if (unavailableNotifiedRef.current) return;
    unavailableNotifiedRef.current = true;
    onUnavailableRef.current?.();
  }, []);

  useEffect(() => {
    if (appId) return;
    notifyUnavailable();
  }, [appId, notifyUnavailable]);

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
    if (!enabled || !appId || pendingSignupToken) return;
    if (mobileBrowser && mobileDirectOAuthEnabled) {
      setSdkReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await loadFacebookSdk(appId);
        if (!cancelled) setSdkReady(true);
      } catch {
        if (!cancelled) notifyUnavailable();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, appId, mobileBrowser, mobileDirectOAuthEnabled, notifyUnavailable, pendingSignupToken]);

  function openConsentStep(token: string) {
    setPendingSignupToken(token);
    setConsentStepAccepted(false);
    patchAuthConsentDraft({ facebookSignupToken: token, rememberMe, surface: draftSurface });
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
      case 'invalid_facebook_token':
        return t.auth.errorFacebookToken;
      case 'facebook_email_required':
        return t.auth.errorFacebookEmailRequired;
      case 'invalid_or_expired_token':
        return t.auth.otpInvalidError;
      case 'account_locked':
        return t.auth.errorAccountLocked;
      case 'account_security_locked':
        return t.auth.errorAccountSecurityLocked;
      case 'facebook_sign_in_disabled':
      case 'sign_in_method_forbidden':
        return t.auth.errorFacebookDisabled;
      case 'rate_limited':
      case 'request_timeout':
        return t.auth.authServiceBusy;
      case 'invalid_request':
        return t.auth.errorInvalidRequest;
      default:
        return t.auth.errorGeneric;
    }
  }

  async function handleAccessToken(accessToken: string) {
    takeFacebookOAuthReturnPending();
    if (consentUpfront && !consent) {
      blockForMissingConsent();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await withMinDuration(
        signInWithFacebook({
          accessToken,
          ...(consent ? { gdprAccepted: true } : {}),
          rememberMe,
          language: lang,
        }),
        shopConfig.loadingMinMs.normal,
      );
      if (isFacebookSignInNeedsConsent(result)) {
        openConsentStep(result.facebookSignupToken);
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
      if (code === 'facebook_sign_in_disabled' || code === 'sign_in_method_forbidden') {
        onUnavailable?.();
        setError(errorMessage(code));
        return;
      }
      setError(errorMessage(code));
    } finally {
      setSubmitting(false);
    }
  }

  function startFacebookLogin() {
    if (consentUpfront && !consent) {
      blockForMissingConsent();
      return;
    }
    const directOauthState =
      mobileBrowser && mobileDirectOAuthEnabled ? createFacebookOAuthState() : undefined;
    beginFacebookOAuthReturn({
      resumePath: `${location.pathname}${location.search}`,
      purpose: 'signIn',
      rememberMe,
      language: lang,
      ...(authReturnToOption ? { authReturnTo: authReturnToOption } : {}),
      ...(directOauthState ? { oauthState: directOauthState } : {}),
    });

    if (mobileBrowser && mobileDirectOAuthEnabled) {
      const url = facebookBrowserOAuthUrl(directOauthState!);
      if (!url) {
        notifyUnavailable();
        return;
      }
      window.location.assign(url);
      return;
    }

    if (!window.FB) {
      notifyUnavailable();
      return;
    }
    window.FB.login((response) => {
      const token = response.authResponse?.accessToken;
      if (token) void handleAccessToken(token);
      else if (response.status !== 'connected') {
        // User closed the dialog — no error banner.
      }
    }, facebookLoginDialogOptions());
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
        completeFacebookSignup({
          facebookSignupToken: pendingSignupToken,
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

  if (!appId || !enabled) return null;

  if (pendingSignupToken) {
    return (
      <div className={`${styles.googleBlock} ${styles.googleConsentStep}`}>
        <p className={styles.consentLead}>{t.auth.facebookConsentBody}</p>
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
              data-testid="auth-facebook-gdpr-consent"
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
              {t.auth.facebookConsentSubmit}
            </Button>
          </div>
        </div>
        <button
          type="button"
          className={`${authStyles.backButton} ${styles.consentDecline}`}
          disabled={submitting}
          onClick={closeConsentStep}
        >
          <span aria-hidden="true">←</span> {t.auth.facebookConsentDecline}
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
      <div className={styles.buttonHost} data-testid="auth-facebook-button-host">
        <button
          type="button"
          className={socialButtonStyles.socialButton}
          data-provider="facebook"
          disabled={submitting}
          onClick={startFacebookLogin}
          data-testid="auth-facebook-continue"
        >
          <img src={facebookIconUrl} alt="" width={20} height={20} decoding="async" />
          <span>{t.auth.continueWithFacebook}</span>
        </button>
        {consentUpfront && !consent && (
          <button
            type="button"
            className={styles.consentGate}
            data-testid="auth-facebook-consent-gate"
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
