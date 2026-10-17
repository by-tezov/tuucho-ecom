import { useEffect, useState, type FormEvent } from 'react';
import { passwordAuthErrorMessage } from './passwordAuthErrorMessage';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useAuthCommands } from '../../state/AuthContext';
import { ApiError } from '../../api/errors';
import { getShopSignInMethods } from '../../api/checkout';
import { readCachedShopSignInMethods, writeCachedShopSignInMethods } from '../../api/signInMethodsCache';
import { type AuthSession, type SocialSignInNeedsAccountChoice } from '../../api/identity';
import { isApiRequestTimeoutError, isBackendUnavailableError } from '../../api/http';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import { announce } from '../../state/liveAnnouncer';
import { shopConfig } from '../../config/env';
import { withMinDuration, withTimeout } from '../../utils/withMinDuration';
import { PasswordField } from './PasswordField';
import { OtpCodeInput } from './OtpCodeInput';
import { OtpResendFooter } from './OtpResendFooter';
import { GoogleSignInBlock } from './GoogleSignInBlock';
import { AppleSignInBlock } from './AppleSignInBlock';
import { FacebookSignInBlock } from './FacebookSignInBlock';
import { EmailIcon } from './EmailIcon';
import { AuthLegalLink } from './AuthLegalLink';
import { SocialAccountChoicePanel, persistSocialAccountChoice } from './SocialAccountChoicePanel';
import { useOtpResendCooldown } from '../../hooks/useOtpResendCooldown';
import { FIELD_EMAIL_MAX, FIELD_PASSWORD_MAX } from '../../utils/fieldLimits';
import styles from './AuthForm.module.css';
import socialButtonStyles from './SocialSignInButton.module.css';
import otpResendStyles from './OtpResendFooter.module.css';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import {
  clearAuthConsentDraft,
  loadAuthConsentDraft,
  loadSocialAccountChoicePending,
  patchAuthConsentDraft,
  type AuthConsentDraftSurface,
} from '../../state/authConsentDraft';
import type { AuthReturnTo } from '../../state/authCredentialsState';

const AUTH_REQUEST_TIMEOUT_MS = 20_000;

type ConnectView = 'form' | 'otp' | 'consent';
type PendingAfterConsent = 'password' | 'otp';

interface LoginFormProps {
  /** Lifted to the parent (AuthModal / LoginPage) so switching views
   * does not discard what the user already typed. */
  email: string;
  onEmailChange: (email: string) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  onSuccess: (session: AuthSession) => void;
  legalLinkState?: unknown;
  /** Desktop AuthModal widens when the password-rules side panel is open. */
  onPasswordRulesOpenChange?: (open: boolean) => void;
  /** Parent swaps the connect title/welcome for the CGU consent chrome. */
  onConsentStepChange?: (active: boolean) => void;
  /** Closed allowlist destination after Facebook on /login (redirect return). */
  authReturnTo?: AuthReturnTo;
  /** sessionStorage draft owner — AuthModal must not resume cart /login-page. */
  draftSurface?: AuthConsentDraftSurface;
}

export function LoginForm({
  email,
  onEmailChange,
  password,
  onPasswordChange,
  onSuccess,
  legalLinkState,
  onPasswordRulesOpenChange,
  onConsentStepChange,
  authReturnTo: authReturnToOption,
  draftSurface = 'auth-modal',
}: LoginFormProps) {
  const { t, lang } = useLang();
  const { loginOrRegister, requestOtp, verifyOtp } = useAuthCommands();
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordless, setPasswordless] = useState(() => Boolean(loadAuthConsentDraft().otpSent));
  const [showPasswordRules, setShowPasswordRules] = useState(false);
  /** False until `GET /auth/sign-in-methods` settles — show an in-modal
   * placeholder instead of flashing email then switching to social.
   *
   * A cached answer counts as settled: it is the layout this visitor saw last
   * time, so painting it immediately is what avoids a flash rather than what
   * causes one. The request below still runs and corrects it. Without this the
   * modal sits on its placeholder for the API's cold-boot time, which Passenger
   * makes ~4s whenever the app has been idle for 5 minutes (see
   * api/signInMethodsCache.ts). */
  const [signInMethodsReady, setSignInMethodsReady] = useState(() => {
    const draft = loadAuthConsentDraft();
    if (draft.otpSent || draft.step === 'password' || draft.step === 'otp') return true;
    if (draft.googleSignupToken || draft.appleSignupToken || draft.facebookSignupToken) return true;
    return readCachedShopSignInMethods() !== undefined;
  });
  /** Revealed only after shop prefs resolve — never flash Vite client ids.
   * The cached answer is still gated on the build's own client id, so a
   * provider this build cannot talk to is never offered. */
  const [googleOffered, setGoogleOffered] = useState(() =>
    Boolean(
      shopConfig.googleClientId &&
      (loadAuthConsentDraft().googleSignupToken || readCachedShopSignInMethods()?.google),
    ),
  );
  const [appleOffered, setAppleOffered] = useState(() =>
    Boolean(
      shopConfig.appleClientId &&
      (loadAuthConsentDraft().appleSignupToken || readCachedShopSignInMethods()?.apple),
    ),
  );
  const [facebookOffered, setFacebookOffered] = useState(() =>
    Boolean(
      shopConfig.facebookAppId &&
      (loadAuthConsentDraft().facebookSignupToken || readCachedShopSignInMethods()?.facebook),
    ),
  );
  const [facebookMobileDirectOAuthEnabled, setFacebookMobileDirectOAuthEnabled] = useState(true);
  const socialOffered = googleOffered || appleOffered || facebookOffered;
  const [emailAuth, setEmailAuth] = useState(() => {
    const draft = loadAuthConsentDraft();
    if (draft.step === 'password' || draft.step === 'otp' || draft.otpSent) return true;
    if (draft.emailAuth) return true;
    // Pending Google/Apple/Facebook CGU step stays on the social shell.
    if (draft.googleSignupToken || draft.appleSignupToken || draft.facebookSignupToken) return false;
    // A cached answer saying this shop offers no third-party provider means
    // the social shell would render an empty row: open straight on email, the
    // same conclusion the request below reaches a moment later.
    const cached = readCachedShopSignInMethods();
    if (cached && !cached.google && !cached.apple && !cached.facebook) return true;
    // Otherwise unknown until shop prefs resolve — do not show email first.
    return false;
  });

  function setPasswordRulesOpen(open: boolean) {
    setShowPasswordRules(open);
    onPasswordRulesOpenChange?.(open);
  }

  function openEmailAuth() {
    setEmailAuth(true);
    setError(null);
    patchAuthConsentDraft({ emailAuth: true, surface: draftSurface });
  }

  function backToGoogleAuth() {
    if (!socialOffered) return;
    setEmailAuth(false);
    setPasswordless(false);
    setPasswordRulesOpen(false);
    setError(null);
    patchAuthConsentDraft({ emailAuth: false, surface: draftSurface });
  }

  function handleGoogleUnavailable() {
    setGoogleOffered(false);
    setGoogleConsentActive(false);
    if (!appleOffered && !facebookOffered) setEmailAuth(true);
  }

  function handleAppleUnavailable() {
    setAppleOffered(false);
    setAppleConsentActive(false);
    if (!googleOffered && !facebookOffered) setEmailAuth(true);
  }

  function handleFacebookUnavailable() {
    setFacebookOffered(false);
    setFacebookConsentActive(false);
    if (!googleOffered && !appleOffered) setEmailAuth(true);
  }

  const [view, setView] = useState<ConnectView>(() => {
    const draft = loadAuthConsentDraft();
    if (draft.otpSent) return 'otp';
    return draft.step === 'password' || draft.step === 'otp' ? 'consent' : 'form';
  });
  const [otp, setOtp] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const otpCooldown = useOtpResendCooldown();
  /** Password/OTP create hit the server without CGU — same step as Google needsConsent. */
  const [pendingAfterConsent, setPendingAfterConsent] = useState<PendingAfterConsent | null>(() => {
    const draft = loadAuthConsentDraft();
    return draft.step === 'password' || draft.step === 'otp' ? draft.step : null;
  });
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [googleConsentActive, setGoogleConsentActive] = useState(() =>
    Boolean(loadAuthConsentDraft().googleSignupToken),
  );
  const [appleConsentActive, setAppleConsentActive] = useState(() =>
    Boolean(loadAuthConsentDraft().appleSignupToken),
  );
  const [facebookConsentActive, setFacebookConsentActive] = useState(() =>
    Boolean(loadAuthConsentDraft().facebookSignupToken),
  );
  const [socialAccountChoice, setSocialAccountChoice] = useState<SocialSignInNeedsAccountChoice | null>(() =>
    loadSocialAccountChoicePending(),
  );
  const [socialChoiceConsentActive, setSocialChoiceConsentActive] = useState(
    () => loadAuthConsentDraft().socialChoiceStep === 'consent',
  );
  const socialConsentActive = googleConsentActive || appleConsentActive || facebookConsentActive;

  function handleNeedsAccountChoice(pending: SocialSignInNeedsAccountChoice) {
    persistSocialAccountChoice(pending, rememberMe, draftSurface);
    setGoogleConsentActive(false);
    setAppleConsentActive(false);
    setFacebookConsentActive(false);
    setSocialAccountChoice(pending);
  }

  useEffect(() => {
    let cancelled = false;
    void getShopSignInMethods()
      .then((result) => {
        if (cancelled) return;
        const draft = loadAuthConsentDraft();
        // Keep provider offered when a CGU token is pending — otherwise the
        // consent step vanishes after a terms/privacy remount.
        const google =
          (Boolean(shopConfig.googleClientId) && result.signInMethods.google) ||
          Boolean(draft.googleSignupToken);
        const apple =
          (Boolean(shopConfig.appleClientId) && result.signInMethods.apple) ||
          Boolean(draft.appleSignupToken);
        const facebook =
          (Boolean(shopConfig.facebookAppId) && result.signInMethods.facebook) ||
          Boolean(draft.facebookSignupToken);
        setGoogleOffered(google);
        setAppleOffered(apple);
        setFacebookOffered(facebook);
        setFacebookMobileDirectOAuthEnabled(result.signInMethods.facebookMobileDirectOAuthEnabled !== false);
        // Recorded after the state updates above, so a response that somehow
        // fails to apply is never the one a later visit starts from.
        writeCachedShopSignInMethods(result.signInMethods);
        const stayOnEmail =
          draft.emailAuth === true || draft.otpSent || draft.step === 'password' || draft.step === 'otp';
        const stayOnSocialConsent = Boolean(
          draft.googleSignupToken || draft.appleSignupToken || draft.facebookSignupToken,
        );
        if (!google && !apple && !facebook) {
          setEmailAuth(true);
        } else if (!stayOnEmail && !stayOnSocialConsent) {
          setEmailAuth(false);
        }
        setSignInMethodsReady(true);
      })
      .catch(() => {
        /* Fail closed: email only if the public endpoint fails — but keep a
         * pending CGU token visible so legal-detour restore still works. */
        if (!cancelled) {
          const draft = loadAuthConsentDraft();
          setGoogleOffered(Boolean(draft.googleSignupToken));
          setAppleOffered(Boolean(draft.appleSignupToken));
          setFacebookOffered(Boolean(draft.facebookSignupToken));
          if (!draft.googleSignupToken && !draft.appleSignupToken && !draft.facebookSignupToken) {
            setEmailAuth(true);
          }
          setSignInMethodsReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const active = socialConsentActive || socialChoiceConsentActive || view === 'consent';
    onConsentStepChange?.(active);
    return () => onConsentStepChange?.(false);
  }, [socialConsentActive, socialChoiceConsentActive, view, onConsentStepChange]);

  const passwordStarted = password.length > 0;
  const passwordRequirements = [
    {
      id: 'minLength',
      label: t.auth.passwordRuleMinLength,
      passed: password.length >= 8 && password.length <= FIELD_PASSWORD_MAX,
    },
    { id: 'uppercase', label: t.auth.passwordRuleUppercase, passed: /[A-Z]/.test(password) },
    { id: 'lowercase', label: t.auth.passwordRuleLowercase, passed: /[a-z]/.test(password) },
    { id: 'digit', label: t.auth.passwordRuleDigit, passed: /[0-9]/.test(password) },
    { id: 'special', label: t.auth.passwordRuleSpecial, passed: /[^A-Za-z0-9]/.test(password) },
  ].map((requirement) => ({
    ...requirement,
    state: !passwordStarted
      ? ('neutral' as const)
      : requirement.passed
        ? ('passed' as const)
        : ('pending' as const),
  }));

  function errorMessage(code: string, reason?: string): string {
    return passwordAuthErrorMessage(t, code, reason);
  }

  function openConsentStep(next: PendingAfterConsent) {
    setPendingAfterConsent(next);
    setConsentAccepted(false);
    setError(null);
    setView('consent');
    patchAuthConsentDraft({ step: next, surface: draftSurface });
  }

  async function sendConnectOtp(gdprAccepted: boolean) {
    setError(null);
    setSubmitting(true);
    setSendingOtp(true);
    try {
      await withMinDuration(
        withTimeout(
          requestOtp(email.trim(), 'signup', { gdprAccepted, language: lang }),
          AUTH_REQUEST_TIMEOUT_MS,
        ),
        shopConfig.loadingMinMs.long,
      );
      setOtp('');
      setPendingAfterConsent(null);
      patchAuthConsentDraft({ otpSent: true, surface: draftSurface });
      otpCooldown.start();
      setView('otp');
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      const code =
        err instanceof ApiError
          ? err.code
          : err instanceof Error && err.message.includes('Timed out')
            ? 'request_timeout'
            : 'unknown_error';
      if (code === 'invalid_request' && !gdprAccepted) {
        openConsentStep('otp');
        return;
      }
      setError(errorMessage(code));
    } finally {
      setSubmitting(false);
      setSendingOtp(false);
    }
  }

  async function submitPassword(gdprAccepted: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      const session = await withMinDuration(
        loginOrRegister(email.trim(), password, gdprAccepted, rememberMe, lang),
        shopConfig.loadingMinMs.normal,
      );
      setPendingAfterConsent(null);
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
      if (code === 'invalid_request' && !gdprAccepted) {
        openConsentStep('password');
        return;
      }
      setError(errorMessage(code, err instanceof ApiError ? err.reason : undefined));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (passwordless) {
      await sendConnectOtp(false);
      return;
    }

    await submitPassword(false);
  }

  async function handleConsentContinue() {
    if (!consentAccepted) {
      setError(t.auth.gdprConsentRequiredError);
      return;
    }
    if (pendingAfterConsent === 'otp') {
      await sendConnectOtp(true);
      return;
    }
    await submitPassword(true);
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      setError(t.auth.otpInvalidError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const session = await withMinDuration(
        verifyOtp(email.trim(), otp, 'signup', rememberMe),
        shopConfig.loadingMinMs.normal,
      );
      clearAuthConsentDraft({ force: true });
      setSubmitting(false);
      // Continue at once and announce the welcome: holding a message on
      // screen before moving on by itself would be a timed redirect (RGAA 13.1).
      announce(session.created ? t.auth.otpWelcomeCreated : t.auth.otpWelcomeConnected);
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

  if (view === 'consent') {
    return (
      <>
        <div className={`${styles.form} ${styles.loginForm} ${styles.googleConsentShell}`}>
          <p className={styles.consentLead}>{t.auth.googleConsentBody}</p>
          <div className={styles.consentSeparator} aria-hidden="true" />
          <div className={styles.consentMiddle}>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <label className={styles.consentField}>
              <input
                type="checkbox"
                onMouseDown={suppressMouseFocus}
                checked={consentAccepted}
                onChange={(e) => {
                  setConsentAccepted(e.target.checked);
                  if (error) setError(null);
                }}
                data-testid="auth-gdpr-consent"
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
            <Button
              type="button"
              className={styles.submitButton}
              disabled={submitting}
              onClick={() => void handleConsentContinue()}
              data-testid="auth-consent-submit"
            >
              {t.auth.googleConsentSubmit}
            </Button>
          </div>
          <button
            type="button"
            className={styles.backButton}
            disabled={submitting}
            onClick={() => {
              // Abandon create entirely — back to the first connect screen.
              clearAuthConsentDraft({ force: true });
              setView('form');
              setPendingAfterConsent(null);
              setConsentAccepted(false);
              setError(null);
              setOtp('');
              setPasswordless(false);
              setPasswordRulesOpen(false);
              setSocialAccountChoice(null);
              setSocialChoiceConsentActive(false);
              setGoogleConsentActive(false);
              setAppleConsentActive(false);
              setFacebookConsentActive(false);
              onPasswordChange('');
              if (socialOffered) setEmailAuth(false);
              else setEmailAuth(true);
            }}
            data-testid="auth-consent-decline"
          >
            <span aria-hidden="true">←</span> {t.auth.googleConsentDecline}
          </button>
        </div>
        {submitting && (
          <LoadingModal
            message={pendingAfterConsent === 'otp' ? t.auth.loadingOtp(email.trim()) : t.auth.loadingLogin}
          />
        )}
      </>
    );
  }

  if (view === 'otp') {
    return (
      <>
        <form className={`${styles.form} ${styles.loginForm}`} onSubmit={handleVerifyOtp} noValidate>
          <div className={styles.loginFields}>
            <p className={styles.switchPrompt}>{t.auth.otpHint(email.trim())}</p>
            <OtpCodeInput
              value={otp}
              onChange={(next) => {
                setOtp(next);
                if (error) setError(null);
              }}
              invalid={error != null}
              focusOnMount
              aria-label={t.auth.otpLabel}
              data-testid="auth-connect-otp"
            />
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <OtpResendFooter
              cooldown={otpCooldown}
              disabled={submitting}
              onResend={() => {
                void sendConnectOtp(true);
              }}
            />
          </div>
          <div className={styles.loginActions}>
            <Button
              type="submit"
              className={styles.submitButton}
              disabled={submitting}
              data-testid="auth-otp-submit"
            >
              {t.auth.otpSubmit}
            </Button>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => {
                setView('form');
                setOtp('');
                setError(null);
                clearAuthConsentDraft({ force: true });
              }}
              disabled={submitting}
            >
              <span aria-hidden="true">←</span> {t.auth.backToLogin}
            </button>
          </div>
        </form>
        {submitting && (
          <LoadingModal message={sendingOtp ? t.auth.loadingOtp(email.trim()) : t.auth.loadingOtpVerify} />
        )}
      </>
    );
  }

  return (
    <>
      {!signInMethodsReady && (
        <div
          className={styles.connectMethodsLoading}
          role="status"
          aria-busy="true"
          aria-live="polite"
          aria-label={t.auth.loadingSignInMethods}
          data-testid="auth-sign-in-methods-loading"
        >
          <span className={styles.connectMethodsSpinner} aria-hidden="true" />
          <p className={styles.connectMethodsLoadingMessage}>{t.auth.loadingSignInMethods}</p>
        </div>
      )}

      {signInMethodsReady && socialAccountChoice && (
        <SocialAccountChoicePanel
          pending={socialAccountChoice}
          rememberMe={rememberMe}
          legalLinkState={legalLinkState}
          draftSurface={draftSurface}
          onSuccess={onSuccess}
          onCancel={() => {
            clearAuthConsentDraft({ force: true });
            setSocialAccountChoice(null);
            setSocialChoiceConsentActive(false);
            if (socialOffered) setEmailAuth(false);
          }}
          onConsentStepChange={setSocialChoiceConsentActive}
        />
      )}

      {signInMethodsReady && !emailAuth && socialOffered && !socialAccountChoice && (
        <div
          className={
            socialConsentActive
              ? `${styles.form} ${styles.loginForm} ${styles.googleConsentShell}`
              : styles.connectTop
          }
        >
          {googleOffered && !appleConsentActive && !facebookConsentActive && (
            <GoogleSignInBlock
              divider="none"
              buttonText="continue_with"
              rememberMe={rememberMe}
              draftSurface={draftSurface}
              legalLinkState={legalLinkState}
              onSuccess={onSuccess}
              onConsentStepChange={setGoogleConsentActive}
              onNeedsAccountChoice={handleNeedsAccountChoice}
              onUnavailable={handleGoogleUnavailable}
            />
          )}
          {appleOffered && !googleConsentActive && !facebookConsentActive && (
            <AppleSignInBlock
              divider="none"
              rememberMe={rememberMe}
              draftSurface={draftSurface}
              legalLinkState={legalLinkState}
              {...(authReturnToOption ? { authReturnTo: authReturnToOption } : {})}
              onSuccess={onSuccess}
              onConsentStepChange={setAppleConsentActive}
              onNeedsAccountChoice={handleNeedsAccountChoice}
              onUnavailable={handleAppleUnavailable}
            />
          )}
          {facebookOffered && !googleConsentActive && !appleConsentActive && (
            <FacebookSignInBlock
              divider="none"
              rememberMe={rememberMe}
              draftSurface={draftSurface}
              legalLinkState={legalLinkState}
              {...(authReturnToOption ? { authReturnTo: authReturnToOption } : {})}
              onSuccess={onSuccess}
              onConsentStepChange={setFacebookConsentActive}
              onNeedsAccountChoice={handleNeedsAccountChoice}
              onUnavailable={handleFacebookUnavailable}
              mobileDirectOAuthEnabled={facebookMobileDirectOAuthEnabled}
            />
          )}
          {!socialConsentActive && (
            <>
              <button
                type="button"
                className={socialButtonStyles.socialButton}
                onClick={openEmailAuth}
                data-testid="auth-use-email-instead"
              >
                <EmailIcon />
                <span>{t.auth.continueWithEmail}</span>
              </button>
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  onMouseDown={suppressMouseFocus}
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  data-testid="auth-remember-me"
                />
                <span>{t.auth.rememberMeLabel}</span>
              </label>
            </>
          )}
        </div>
      )}

      {signInMethodsReady && emailAuth && !socialConsentActive && !socialAccountChoice && (
        <form
          className={`${styles.form} ${styles.loginForm}`}
          onSubmit={handleSubmit}
          data-testid="auth-login-form"
          noValidate
        >
          <div className={styles.loginFields}>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <label className={styles.field}>
              <span className={styles.label}>{t.auth.emailLabel}</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                maxLength={FIELD_EMAIL_MAX}
                placeholder={t.auth.emailPlaceholder}
                className={styles.input}
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                data-testid="auth-email"
              />
            </label>
            {!passwordless && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="connect-password">
                  {t.auth.passwordLabel}
                </label>
                <div className={styles.passwordFieldRow}>
                  <PasswordField
                    id="connect-password"
                    required
                    name="current-password"
                    autoComplete="current-password"
                    maxLength={FIELD_PASSWORD_MAX}
                    placeholder={t.auth.passwordPlaceholder}
                    value={password}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    aria-describedby={showPasswordRules ? 'connect-password-requirements' : undefined}
                    data-testid="auth-password"
                  />
                  <button
                    type="button"
                    className={styles.passwordRulesToggle}
                    onClick={() => setPasswordRulesOpen(!showPasswordRules)}
                    // The name is the action and flips with it: no aria-pressed too.
                    aria-label={showPasswordRules ? t.auth.hidePasswordRules : t.auth.showPasswordRules}
                    data-testid="auth-toggle-password-rules"
                  >
                    <PasswordRulesIcon />
                  </button>
                </div>
                <p className={styles.switchPrompt}>
                  {t.auth.registerPasswordlessPrompt}{' '}
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => {
                      setPasswordless(true);
                      setPasswordRulesOpen(false);
                      onPasswordChange('');
                      setError(null);
                    }}
                    data-testid="auth-passwordless-link"
                  >
                    {t.auth.receiveOtpLink}
                  </button>
                </p>
              </div>
            )}
            {passwordless && (
              <p className={styles.switchPrompt}>
                {t.auth.usePasswordInsteadPrompt}{' '}
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setPasswordless(false);
                    setError(null);
                  }}
                  data-testid="auth-use-password-link"
                >
                  {t.auth.usePasswordInsteadLink}
                </button>
              </p>
            )}
            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                onMouseDown={suppressMouseFocus}
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                data-testid="auth-remember-me-email"
              />
              <span>{t.auth.rememberMeLabel}</span>
            </label>
            {showPasswordRules && !passwordless && (
              <ul id="connect-password-requirements" className={styles.passwordStepper}>
                {passwordRequirements.map((requirement) => (
                  <li
                    key={requirement.id}
                    data-testid={`auth-password-rule-${requirement.id}`}
                    data-state={requirement.state}
                    className={
                      requirement.state === 'passed'
                        ? `${styles.passwordRequirement} ${styles.passwordRequirementPassed}`
                        : requirement.state === 'pending'
                          ? `${styles.passwordRequirement} ${styles.passwordRequirementPending}`
                          : `${styles.passwordRequirement} ${styles.passwordRequirementNeutral}`
                    }
                  >
                    <span>{requirement.label}</span>
                    <span className={styles.passwordRequirementStatus} aria-hidden="true">
                      {requirement.state === 'passed' ? '✓' : requirement.state === 'pending' ? '×' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={styles.loginActions}>
            <Button
              type="submit"
              className={styles.submitButton}
              disabled={submitting || (passwordless && otpCooldown.isCoolingDown)}
              data-testid="auth-submit"
            >
              {passwordless ? t.auth.otpRequestSubmit : t.auth.modalTitleLogin}
            </Button>
            {passwordless && otpCooldown.isCoolingDown && (
              <p className={otpResendStyles.countdown} role="status" aria-live="polite">
                {t.auth.otpResendCountdown(otpCooldown.remainingMinutes, otpCooldown.remainingSeconds)}
              </p>
            )}
            {socialOffered && (
              <button
                type="button"
                className={styles.backButton}
                onClick={backToGoogleAuth}
                data-testid="auth-back-to-social"
              >
                <span aria-hidden="true">←</span> {t.auth.backToLogin}
              </button>
            )}
          </div>
        </form>
      )}
      {submitting && !socialConsentActive && (
        <LoadingModal
          message={
            sendingOtp
              ? t.auth.loadingOtp(email.trim())
              : passwordless
                ? t.auth.loadingOtp(email.trim())
                : t.auth.loadingLogin
          }
        />
      )}
    </>
  );
}

function PasswordRulesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 10.5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" />
    </svg>
  );
}
