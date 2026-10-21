import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { passwordAuthErrorMessage } from '../auth/passwordAuthErrorMessage';
import { useAuthSession, useAuthCommands, useAuthPrompt } from '../../state/AuthContext';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import type { Strings } from '../../assets/i18n/types';
import { ApiError } from '../../api/errors';
import { getShopSignInMethods } from '../../api/checkout';
import { type AuthSession, type SocialSignInNeedsAccountChoice } from '../../api/identity';
import { isApiRequestTimeoutError, isBackendUnavailableError } from '../../api/http';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import { RequiredMark } from '../ui/RequiredMark';
import { announce } from '../../state/liveAnnouncer';
import { PasswordField } from '../auth/PasswordField';
import { OtpCodeInput } from '../auth/OtpCodeInput';
import { OtpResendFooter } from '../auth/OtpResendFooter';
import { GoogleSignInBlock } from '../auth/GoogleSignInBlock';
import { AppleSignInBlock } from '../auth/AppleSignInBlock';
import { FacebookSignInBlock } from '../auth/FacebookSignInBlock';
import { SocialAccountChoicePanel, persistSocialAccountChoice } from '../auth/SocialAccountChoicePanel';
import { useOtpResendCooldown } from '../../hooks/useOtpResendCooldown';
import { shopConfig } from '../../config/env';
import {
  clearGuestCheckoutDraft,
  loadGuestCheckoutDraft,
  saveGuestCheckoutDraft,
  type GuestCheckoutPendingConsent,
  type GuestCheckoutPromptView,
} from '../../state/guestCheckoutDraft';
import {
  loadAuthConsentDraft,
  clearAuthConsentDraft,
  loadSocialAccountChoicePending,
} from '../../state/authConsentDraft';
import { withMinDuration, withTimeout } from '../../utils/withMinDuration';
import { FIELD_EMAIL_MAX, FIELD_PASSWORD_MAX } from '../../utils/fieldLimits';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import { AuthLegalLink } from '../auth/AuthLegalLink';
import { EmailIcon } from '../auth/EmailIcon';
import authFormStyles from '../auth/AuthForm.module.css';
import otpResendStyles from '../auth/OtpResendFooter.module.css';
import socialButtonStyles from '../auth/SocialSignInButton.module.css';
import styles from './GuestCheckoutPrompt.module.css';

const AUTH_REQUEST_TIMEOUT_MS = 20_000;

/** Signed-out identification card, pinned with the order summary on /cart. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PromptView = GuestCheckoutPromptView;

interface GuestCheckoutPromptProps {
  t: Strings;
  /** Mirrors this card's email/consent up to CartPage, which needs both to
   * gate the shared "Payer" button and to build the guest checkout request
   * — see CartPage.tsx's guestEmail/guestConsent state. Fired on mount and
   * on every edit; not a controlled-input prop, this card still owns the
   * actual input state (same sessionStorage draft either way). */
  onDraftChange?: (draft: { email: string; consent: boolean }) => void;
  /** True while Identification is focused (create/link or Accepter les
   * conditions) — CartPage raises the summary stack above a page dimmer. */
  onSocialChoiceFocusChange?: (focused: boolean) => void;
}

export function GuestCheckoutPrompt({
  t,
  onDraftChange,
  onSocialChoiceFocusChange,
}: GuestCheckoutPromptProps) {
  const { status } = useAuthSession();
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  const { loginOrRegister, requestOtp, verifyOtp } = useAuthCommands();
  const { hasPendingGuestMerge } = useAuthPrompt();
  const { lang } = useLang();
  const emailInputId = useId();
  const otpInputId = useId();
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<PromptView>(() => loadGuestCheckoutDraft().view ?? 'signup');
  // "Mot de passe oublié" switches the login view to its passwordless shape
  // (no password field, submit sends an OTP) — the link itself only changes
  // the view, so no code goes out until the customer actually submits.
  const [passwordlessLogin, setPasswordlessLogin] = useState(
    () => loadGuestCheckoutDraft().passwordlessLogin === true,
  );
  // Restored from the tab's draft (see state/guestCheckoutDraft.ts) — reading
  // the terms/privacy pages linked right below unmounts this card, and coming
  // back to an emptied form is what it looks like from here otherwise.
  const [email, setEmail] = useState(() => loadGuestCheckoutDraft().email);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPasswordRules, setShowPasswordRules] = useState(false);
  /** Guest-checkout CGU on the signup (pay as guest) path — not account login. */
  const [consent, setConsent] = useState(() => loadGuestCheckoutDraft().consent);
  const initialDraftRef = useRef({ email, consent });
  /** Account-create CGU after login/OTP without consent (LoginForm / social pattern). */
  const [accountConsentAccepted, setAccountConsentAccepted] = useState(false);
  const [pendingAfterConsent, setPendingAfterConsent] = useState<GuestCheckoutPendingConsent | null>(
    () => loadGuestCheckoutDraft().pendingAfterConsent ?? null,
  );
  const [otp, setOtp] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const otpCooldown = useOtpResendCooldown();
  const [leaving, setLeaving] = useState(false);
  const [googleOffered, setGoogleOffered] = useState(() =>
    Boolean(shopConfig.googleClientId && loadAuthConsentDraft().googleSignupToken),
  );
  const [appleOffered, setAppleOffered] = useState(() =>
    Boolean(shopConfig.appleClientId && loadAuthConsentDraft().appleSignupToken),
  );
  const [facebookOffered, setFacebookOffered] = useState(() =>
    Boolean(shopConfig.facebookAppId && loadAuthConsentDraft().facebookSignupToken),
  );
  const [facebookMobileDirectOAuthEnabled, setFacebookMobileDirectOAuthEnabled] = useState(true);
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
  const socialOffered = googleOffered || appleOffered || facebookOffered;
  const socialConsentActive = googleConsentActive || appleConsentActive || facebookConsentActive;
  const accountConsentChrome = view === 'consent' || socialConsentActive || socialChoiceConsentActive;
  const showIdentifyNotice =
    (view === 'signup' || view === 'login') &&
    !accountConsentChrome &&
    !socialAccountChoice &&
    email.trim() === '';
  /** Same page dimmer as create/link — also for Accepter les conditions (social
   * or password/OTP create). */
  const identificationFocus = socialAccountChoice != null || accountConsentChrome;
  const wasAnonymousRef = useRef(status !== 'authenticated');

  function handleNeedsAccountChoice(pending: SocialSignInNeedsAccountChoice) {
    persistSocialAccountChoice(pending, rememberMe, 'cart');
    setGoogleConsentActive(false);
    setAppleConsentActive(false);
    setFacebookConsentActive(false);
    setSocialAccountChoice(pending);
  }

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

  useEffect(() => {
    onSocialChoiceFocusChange?.(identificationFocus);
    return () => onSocialChoiceFocusChange?.(false);
  }, [identificationFocus, onSocialChoiceFocusChange]);

  useEffect(() => {
    if (!identificationFocus) return;
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [identificationFocus]);

  useEffect(() => {
    let cancelled = false;
    void getShopSignInMethods()
      .then((result) => {
        if (cancelled) return;
        const draft = loadAuthConsentDraft();
        // Keep provider offered when a consent token is pending — otherwise the
        // CGU step cannot remount after a terms/privacy detour.
        setGoogleOffered(
          (Boolean(shopConfig.googleClientId) && result.signInMethods.google) ||
            Boolean(draft.googleSignupToken),
        );
        setAppleOffered(
          (Boolean(shopConfig.appleClientId) && result.signInMethods.apple) ||
            Boolean(draft.appleSignupToken),
        );
        setFacebookOffered(
          (Boolean(shopConfig.facebookAppId) && result.signInMethods.facebook) ||
            Boolean(draft.facebookSignupToken),
        );
        setFacebookMobileDirectOAuthEnabled(result.signInMethods.facebookMobileDirectOAuthEnabled !== false);
      })
      .catch(() => {
        if (!cancelled) {
          const draft = loadAuthConsentDraft();
          setGoogleOffered(Boolean(draft.googleSignupToken));
          setAppleOffered(Boolean(draft.appleSignupToken));
          setFacebookOffered(Boolean(draft.facebookSignupToken));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // A pending guest-cart merge choice means the OTP/login flow already
    // succeeded — LoginMergeDialog takes over from here, so this card must
    // leave too even though `status` deliberately stays 'anonymous' until
    // that dialog resolves (see AuthContext's finishAuthWithGuestMerge).
    if (status === 'authenticated' || hasPendingGuestMerge) {
      // The draft exists only to survive a detour while signed out.
      clearGuestCheckoutDraft();
      if (!wasAnonymousRef.current) return;
      wasAnonymousRef.current = false;
      setLeaving(true);
      const timeout = setTimeout(() => setLeaving(false), 320);
      return () => clearTimeout(timeout);
    }
    wasAnonymousRef.current = true;
  }, [status, hasPendingGuestMerge]);

  useEffect(() => {
    onDraftChangeRef.current?.(initialDraftRef.current);
    // Mount-only: every subsequent change already goes through
    // updateEmail/updateConsent below, which report it themselves.
  }, []);

  function persistGuestDraft(patch: {
    email?: string;
    consent?: boolean;
    view?: PromptView;
    passwordlessLogin?: boolean;
    pendingAfterConsent?: GuestCheckoutPendingConsent | null;
  }): void {
    const nextEmail = patch.email ?? email;
    const nextConsent = patch.consent ?? consent;
    const nextView = patch.view ?? view;
    const nextPasswordless = patch.passwordlessLogin ?? passwordlessLogin;
    const nextPending =
      patch.pendingAfterConsent !== undefined ? patch.pendingAfterConsent : pendingAfterConsent;
    saveGuestCheckoutDraft({
      email: nextEmail,
      consent: nextConsent,
      view: nextView,
      passwordlessLogin: nextPasswordless,
      ...(nextPending ? { pendingAfterConsent: nextPending } : {}),
    });
  }

  function updateEmail(next: string) {
    setEmail(next);
    persistGuestDraft({ email: next });
    onDraftChange?.({ email: next, consent });
  }

  function updateConsent(next: boolean) {
    setConsent(next);
    persistGuestDraft({ consent: next });
    onDraftChange?.({ email, consent: next });
  }

  function updateView(
    next: PromptView,
    options?: {
      passwordlessLogin?: boolean;
      pendingAfterConsent?: GuestCheckoutPendingConsent | null;
    },
  ) {
    setView(next);
    if (options?.passwordlessLogin !== undefined) {
      setPasswordlessLogin(options.passwordlessLogin);
    }
    if (options?.pendingAfterConsent !== undefined) {
      setPendingAfterConsent(options.pendingAfterConsent);
    }
    persistGuestDraft({
      view: next,
      ...(options?.passwordlessLogin !== undefined ? { passwordlessLogin: options.passwordlessLogin } : {}),
      ...(options?.pendingAfterConsent !== undefined
        ? { pendingAfterConsent: options.pendingAfterConsent }
        : {}),
    });
  }

  function openAccountConsentStep(next: GuestCheckoutPendingConsent) {
    setAccountConsentAccepted(false);
    setError(null);
    updateView('consent', { pendingAfterConsent: next });
  }

  function validateEmail(): string | null {
    const trimmed = email.trim();
    if (!trimmed) return t.cart.guestPromptEmailRequiredError;
    if (!EMAIL_PATTERN.test(trimmed)) return t.cart.guestPromptEmailInvalidError;
    return null;
  }

  // Both the OTP and password paths below are create-or-connect (see
  // sendLoginOtp's and handleLogin's own doc comments), so this card never
  // sees email_already_used: weak_password, invalid_credentials, or
  // password_cancelled once an inbox proof (OTP, social) dropped it.
  function errorMessage(code: string, reason?: string): string {
    return passwordAuthErrorMessage(t, code, reason);
  }

  // purpose 'signup' (not 'login'): request-otp always sends a code for
  // this card's passwordless option, whether or not the address already has
  // an account — 'login' silently no-ops for an unregistered address (see
  // /auth/request-otp), which used to strand the visitor on the OTP screen
  // for a code that was never sent. verify-otp then either creates the
  // account or connects to the existing one, same as /register's OTP path.
  // GDPR is only required for a *new* address — same as LoginForm / social.
  async function sendLoginOtp(gdprAccepted: boolean) {
    const nextError = validateEmail();
    if (nextError) {
      setEmailError(nextError);
      emailInputRef.current?.focus();
      return;
    }
    setEmailError(null);
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
      otpCooldown.start();
      setPendingAfterConsent(null);
      updateView('otp', { pendingAfterConsent: null });
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      const code =
        err instanceof ApiError
          ? err.code
          : isApiRequestTimeoutError(err) || (err instanceof Error && err.message.includes('Timed out'))
            ? 'request_timeout'
            : 'unknown_error';
      if (code === 'invalid_request' && !gdprAccepted) {
        openAccountConsentStep('otp');
        return;
      }
      setError(errorMessage(code));
    } finally {
      setSubmitting(false);
      setSendingOtp(false);
    }
  }

  async function submitLoginPassword(gdprAccepted: boolean) {
    const nextError = validateEmail();
    if (nextError) {
      setEmailError(nextError);
      emailInputRef.current?.focus();
      return;
    }
    if (!password) {
      setError(t.auth.errorInvalidCredentials);
      return;
    }
    setEmailError(null);
    setError(null);
    setSubmitting(true);
    try {
      await withMinDuration(
        withTimeout(
          loginOrRegister(email.trim(), password, gdprAccepted, rememberMe, lang),
          AUTH_REQUEST_TIMEOUT_MS,
        ),
        shopConfig.loadingMinMs.normal,
      );
      setPendingAfterConsent(null);
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      const code =
        err instanceof ApiError
          ? err.code
          : isApiRequestTimeoutError(err)
            ? 'request_timeout'
            : 'unknown_error';
      if (code === 'invalid_request' && !gdprAccepted) {
        openAccountConsentStep('password');
        return;
      }
      setError(errorMessage(code, err instanceof ApiError ? err.reason : undefined));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    if (passwordlessLogin) {
      await sendLoginOtp(false);
      return;
    }
    await submitLoginPassword(false);
  }

  async function handleAccountConsentContinue() {
    if (!accountConsentAccepted) {
      setError(t.auth.gdprConsentRequiredError);
      return;
    }
    if (pendingAfterConsent === 'otp') {
      await sendLoginOtp(true);
      return;
    }
    await submitLoginPassword(true);
  }

  async function handleVerifyOtp(event: FormEvent) {
    event.preventDefault();
    if (otp.length !== 6) {
      setError(t.auth.otpInvalidError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const session = await withMinDuration(
        withTimeout(verifyOtp(email.trim(), otp, 'signup', rememberMe), AUTH_REQUEST_TIMEOUT_MS),
        shopConfig.loadingMinMs.normal,
      );
      setSubmitting(false);
      // The card leaves at once; the welcome is announced rather than held on
      // screen, which would be a timed transition (RGAA 13.1).
      announceWelcome(session);
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

  async function handleResendOtp() {
    await sendLoginOtp(true);
  }

  function announceWelcome(session: AuthSession) {
    announce(session.created ? t.auth.otpWelcomeCreated : t.auth.otpWelcomeConnected);
  }

  function handleGoogleSuccess(session: AuthSession) {
    announceWelcome(session);
  }

  if ((status === 'authenticated' || hasPendingGuestMerge) && !leaving && !submitting) return null;

  const legalLinkState = { returnTo: '/cart' };

  // Guest-pay CGU on the signup path only (not account login — that asks on create).
  function renderGuestConsentField(showError: boolean) {
    return (
      <>
        <label className={`${authFormStyles.consentField} ${styles.consent}`}>
          <input
            type="checkbox"
            onMouseDown={suppressMouseFocus}
            checked={consent}
            onChange={(event) => updateConsent(event.target.checked)}
            data-testid="guest-checkout-gdpr"
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
        {showError && (
          <p className={styles.fieldError} role="alert">
            {t.cart.guestPromptConsentRequiredError}
          </p>
        )}
      </>
    );
  }

  const loadingMessage = sendingOtp
    ? t.auth.loadingOtp(email.trim())
    : view === 'otp'
      ? t.auth.loadingOtpVerify
      : view === 'login' || view === 'consent'
        ? pendingAfterConsent === 'otp' || (view === 'login' && passwordlessLogin)
          ? t.auth.loadingOtp(email.trim())
          : t.auth.loadingLogin
        : t.auth.loadingOtp(email.trim());

  return (
    <div className={identificationFocus ? styles.focusRoot : undefined}>
      {identificationFocus && <div className={styles.focusScrim} aria-hidden="true" />}
      <div className={leaving ? `${styles.wrapper} ${styles.leaving}` : styles.wrapper}>
        <div
          ref={cardRef}
          className={identificationFocus ? `${styles.card} ${styles.cardFocused}` : styles.card}
        >
          <h2 className={styles.title}>
            {view === 'otp'
              ? t.auth.otpTitle
              : accountConsentChrome
                ? t.auth.googleConsentTitle
                : t.cart.guestPromptTitle}
          </h2>
          {showIdentifyNotice && <p className={styles.guidance}>{t.cart.guestPromptIdentifyNotice}</p>}

          {view === 'consent' && (
            <div className={authFormStyles.googleConsentShell}>
              <p className={authFormStyles.consentLead}>{t.auth.googleConsentBody}</p>
              <div className={authFormStyles.consentSeparator} aria-hidden="true" />
              <div className={authFormStyles.consentMiddle}>
                {error && (
                  <p className={styles.fieldError} role="alert">
                    {error}
                  </p>
                )}
                <label className={`${authFormStyles.consentField} ${styles.consent}`}>
                  <input
                    type="checkbox"
                    onMouseDown={suppressMouseFocus}
                    checked={accountConsentAccepted}
                    onChange={(event) => {
                      setAccountConsentAccepted(event.target.checked);
                      if (error) setError(null);
                    }}
                    data-testid="guest-checkout-account-gdpr"
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
                  disabled={submitting}
                  onClick={() => void handleAccountConsentContinue()}
                  data-testid="guest-checkout-account-consent-submit"
                >
                  {t.auth.googleConsentSubmit}
                </Button>
              </div>
              <button
                type="button"
                className={`${styles.textLink} ${styles.backLink}`}
                disabled={submitting}
                onClick={() => {
                  // Abandon account create — back to Identification’s first view.
                  clearAuthConsentDraft({ force: true });
                  setAccountConsentAccepted(false);
                  setError(null);
                  setPassword('');
                  setRememberMe(false);
                  setShowPasswordRules(false);
                  setSocialAccountChoice(null);
                  setSocialChoiceConsentActive(false);
                  setGoogleConsentActive(false);
                  setAppleConsentActive(false);
                  setFacebookConsentActive(false);
                  updateView('signup', { passwordlessLogin: false, pendingAfterConsent: null });
                }}
              >
                <span aria-hidden="true">←</span> {t.auth.googleConsentDecline}
              </button>
            </div>
          )}

          {view === 'signup' && socialAccountChoice && (
            <SocialAccountChoicePanel
              pending={socialAccountChoice}
              rememberMe={rememberMe}
              legalLinkState={legalLinkState}
              draftSurface="cart"
              onSuccess={(session) => {
                handleGoogleSuccess(session);
              }}
              onCancel={() => {
                clearAuthConsentDraft({ force: true });
                setSocialAccountChoice(null);
                setSocialChoiceConsentActive(false);
                setRememberMe(false);
              }}
              onConsentStepChange={setSocialChoiceConsentActive}
            />
          )}

          {view === 'signup' && !socialAccountChoice && (
            <div className={socialConsentActive ? authFormStyles.googleConsentShell : styles.signupStack}>
              <div className={styles.socialStack}>
                {googleOffered && !appleConsentActive && !facebookConsentActive && (
                  <GoogleSignInBlock
                    divider="none"
                    buttonText="continue_with"
                    rememberMe={rememberMe}
                    draftSurface="cart"
                    legalLinkState={legalLinkState}
                    onSuccess={handleGoogleSuccess}
                    onConsentStepChange={setGoogleConsentActive}
                    onNeedsAccountChoice={handleNeedsAccountChoice}
                    onUnavailable={() => setGoogleOffered(false)}
                  />
                )}
                {appleOffered && !googleConsentActive && !facebookConsentActive && (
                  <AppleSignInBlock
                    divider="none"
                    rememberMe={rememberMe}
                    draftSurface="cart"
                    legalLinkState={legalLinkState}
                    onSuccess={handleGoogleSuccess}
                    onConsentStepChange={setAppleConsentActive}
                    onNeedsAccountChoice={handleNeedsAccountChoice}
                    onUnavailable={() => setAppleOffered(false)}
                  />
                )}
                {facebookOffered && !googleConsentActive && !appleConsentActive && (
                  <FacebookSignInBlock
                    divider="none"
                    rememberMe={rememberMe}
                    draftSurface="cart"
                    legalLinkState={legalLinkState}
                    onSuccess={handleGoogleSuccess}
                    onConsentStepChange={setFacebookConsentActive}
                    onNeedsAccountChoice={handleNeedsAccountChoice}
                    onUnavailable={() => setFacebookOffered(false)}
                    mobileDirectOAuthEnabled={facebookMobileDirectOAuthEnabled}
                  />
                )}
              </div>
              {!socialConsentActive && (
                <>
                  {socialOffered && (
                    <button
                      type="button"
                      className={socialButtonStyles.socialButton}
                      onClick={() => {
                        setError(null);
                        updateView('login', {
                          passwordlessLogin: false,
                          pendingAfterConsent: null,
                        });
                      }}
                      data-testid="guest-checkout-login"
                    >
                      <EmailIcon />
                      <span>{t.auth.continueWithEmail}</span>
                    </button>
                  )}
                  {socialOffered && (
                    <label className={authFormStyles.checkboxField}>
                      <input
                        type="checkbox"
                        onMouseDown={suppressMouseFocus}
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        data-testid="guest-checkout-remember-me-social"
                      />
                      <span>{t.auth.rememberMeLabel}</span>
                    </label>
                  )}
                  {socialOffered && (
                    <div className={`${styles.sectionRule} ${styles.sectionRuleOr}`} aria-hidden="true">
                      {t.auth.orContinueWith}
                    </div>
                  )}
                  <div className={styles.emailField}>
                    <label className={styles.emailLabel} htmlFor={emailInputId}>
                      {t.cart.guestPromptEmailAria}
                      <RequiredMark />
                    </label>
                    <input
                      ref={emailInputRef}
                      id={emailInputId}
                      type="email"
                      className={styles.emailInput}
                      data-testid="guest-checkout-email"
                      placeholder={t.cart.guestPromptEmailPlaceholder}
                      autoComplete="email"
                      maxLength={FIELD_EMAIL_MAX}
                      aria-label={t.cart.guestPromptEmailAria}
                      value={email}
                      aria-required="true"
                      aria-invalid={emailError != null}
                      aria-describedby={emailError ? `${emailInputId}-error` : undefined}
                      onChange={(event) => {
                        updateEmail(event.target.value);
                        if (emailError) setEmailError(null);
                        if (error) setError(null);
                      }}
                    />
                    {emailError && (
                      <p id={`${emailInputId}-error`} className={styles.fieldError} role="alert">
                        {emailError}
                      </p>
                    )}
                  </div>
                  <div className={styles.consentWrap}>
                    {renderGuestConsentField(!consent && email.trim().length > 0)}
                  </div>
                </>
              )}
            </div>
          )}

          {view === 'login' && (
            <form onSubmit={handleLogin} noValidate>
              <div className={styles.signupStack}>
                <div className={styles.emailField}>
                  <label className={styles.emailLabel} htmlFor={emailInputId}>
                    {t.cart.guestPromptEmailAria}
                    <RequiredMark />
                  </label>
                  <input
                    ref={emailInputRef}
                    id={emailInputId}
                    type="email"
                    className={styles.emailInput}
                    data-testid="guest-checkout-email"
                    placeholder={t.cart.guestPromptEmailPlaceholder}
                    autoComplete="email"
                    maxLength={FIELD_EMAIL_MAX}
                    aria-label={t.cart.guestPromptEmailAria}
                    value={email}
                    aria-required="true"
                    aria-invalid={emailError != null}
                    aria-describedby={emailError ? `${emailInputId}-login-error` : undefined}
                    onChange={(event) => {
                      updateEmail(event.target.value);
                      if (emailError) setEmailError(null);
                      if (error) setError(null);
                    }}
                  />
                  {emailError && (
                    <p id={`${emailInputId}-login-error`} className={styles.fieldError} role="alert">
                      {emailError}
                    </p>
                  )}
                </div>
                {!passwordlessLogin && (
                  <div className={styles.emailField}>
                    <label className={styles.emailLabel} htmlFor="guest-checkout-password">
                      {t.auth.passwordLabel}
                      <RequiredMark />
                    </label>
                    <div className={authFormStyles.passwordFieldRow}>
                      <PasswordField
                        id="guest-checkout-password"
                        name="current-password"
                        autoComplete="current-password"
                        maxLength={FIELD_PASSWORD_MAX}
                        aria-required="true"
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          if (error) setError(null);
                        }}
                        aria-describedby={
                          showPasswordRules ? 'guest-checkout-password-requirements' : undefined
                        }
                        data-testid="guest-checkout-password"
                      />
                      <button
                        type="button"
                        className={authFormStyles.passwordRulesToggle}
                        onClick={() => setShowPasswordRules(!showPasswordRules)}
                        // The name is the action and flips with it: no aria-pressed too.
                        aria-label={showPasswordRules ? t.auth.hidePasswordRules : t.auth.showPasswordRules}
                        data-testid="guest-checkout-toggle-password-rules"
                      >
                        <PasswordRulesIcon />
                      </button>
                    </div>
                    <p className={authFormStyles.switchPrompt}>
                      {t.cart.guestPromptOtpPrompt}{' '}
                      <button
                        type="button"
                        className={authFormStyles.linkButton}
                        data-testid="guest-checkout-forgot"
                        onClick={() => {
                          setError(null);
                          setPassword('');
                          setShowPasswordRules(false);
                          updateView('login', { passwordlessLogin: true });
                        }}
                      >
                        {t.cart.guestPromptOtpLink}
                      </button>
                    </p>
                  </div>
                )}
                {passwordlessLogin && (
                  <p className={authFormStyles.switchPrompt}>
                    {t.auth.usePasswordInsteadPrompt}{' '}
                    <button
                      type="button"
                      className={authFormStyles.linkButton}
                      data-testid="guest-checkout-use-password"
                      onClick={() => {
                        setError(null);
                        updateView('login', { passwordlessLogin: false });
                      }}
                    >
                      {t.auth.usePasswordInsteadLink}
                    </button>
                  </p>
                )}
                <label className={authFormStyles.checkboxField}>
                  <input
                    type="checkbox"
                    onMouseDown={suppressMouseFocus}
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    data-testid="guest-checkout-remember-me"
                  />
                  <span>{t.auth.rememberMeLabel}</span>
                </label>
                {showPasswordRules && !passwordlessLogin && (
                  <ul id="guest-checkout-password-requirements" className={authFormStyles.passwordStepper}>
                    {passwordRequirements.map((requirement) => (
                      <li
                        key={requirement.id}
                        data-testid={`guest-checkout-password-rule-${requirement.id}`}
                        data-state={requirement.state}
                        className={
                          requirement.state === 'passed'
                            ? `${authFormStyles.passwordRequirement} ${authFormStyles.passwordRequirementPassed}`
                            : requirement.state === 'pending'
                              ? `${authFormStyles.passwordRequirement} ${authFormStyles.passwordRequirementPending}`
                              : `${authFormStyles.passwordRequirement} ${authFormStyles.passwordRequirementNeutral}`
                        }
                      >
                        <span>{requirement.label}</span>
                        <span className={authFormStyles.passwordRequirementStatus} aria-hidden="true">
                          {requirement.state === 'passed' ? '✓' : requirement.state === 'pending' ? '×' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {error && (
                  <p className={styles.fieldError} role="alert">
                    {error}
                  </p>
                )}
              </div>
              <div className={styles.actions}>
                <Button
                  type="submit"
                  data-testid="guest-checkout-login-submit"
                  disabled={submitting || (passwordlessLogin && otpCooldown.isCoolingDown)}
                >
                  {passwordlessLogin ? t.auth.otpRequestSubmit : t.cart.guestPromptLoginSubmit}
                </Button>
                {passwordlessLogin && otpCooldown.isCoolingDown && (
                  <p className={otpResendStyles.countdown} role="status" aria-live="polite">
                    {t.auth.otpResendCountdown(otpCooldown.remainingMinutes, otpCooldown.remainingSeconds)}
                  </p>
                )}
                <button
                  type="button"
                  className={`${styles.textLink} ${styles.backLink}`}
                  data-testid="guest-checkout-back"
                  onClick={() => {
                    setError(null);
                    setShowPasswordRules(false);
                    updateView('signup', { passwordlessLogin: false });
                  }}
                >
                  <span aria-hidden="true">←</span> {t.backLink}
                </button>
              </div>
            </form>
          )}

          {view === 'otp' && (
            <form onSubmit={handleVerifyOtp} noValidate>
              <p className={styles.hint}>{t.auth.otpHint(email.trim())}</p>
              <OtpCodeInput
                id={otpInputId}
                value={otp}
                onChange={(next) => {
                  setOtp(next);
                  if (error) setError(null);
                }}
                invalid={error != null}
                focusOnMount
                aria-label={t.auth.otpLabel}
                data-testid="guest-checkout-otp"
              />
              {error && (
                <p className={styles.fieldError} role="alert">
                  {error}
                </p>
              )}
              <OtpResendFooter
                cooldown={otpCooldown}
                disabled={submitting}
                onResend={() => {
                  void handleResendOtp();
                }}
              />
              <div className={styles.actions}>
                <Button type="submit" data-testid="guest-checkout-otp-submit" disabled={submitting}>
                  {t.auth.otpSubmit}
                </Button>
                <button
                  type="button"
                  className={`${styles.textLink} ${styles.backLink}`}
                  onClick={() => {
                    setOtp('');
                    setError(null);
                    updateView('signup', { passwordlessLogin: false });
                  }}
                >
                  <span aria-hidden="true">←</span> {t.backLink}
                </button>
              </div>
            </form>
          )}
        </div>
        {submitting && <LoadingModal message={loadingMessage} />}
      </div>
    </div>
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
