import type { Lang } from '../assets/i18n';
import { authHeaders, requestJson as request } from './client';
import { readImpersonationHandoff } from './session/giftPinSession';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in kernel/back). Do not redeclare them here. */
import type {
  AppleSignInNeedsConsent,
  AppleSignInResult,
  AuthOtpPurpose,
  AuthSession,
  AuthUser,
  FacebookDataDeletionStatus,
  FacebookSignInNeedsConsent,
  FacebookSignInResult,
  GoogleSignInNeedsConsent,
  GoogleSignInResult,
  ManageGuestOrderResult,
  RefreshedSession,
  SocialSignInNeedsAccountChoice,
} from './contract/identity';

export type {
  AppleSignInNeedsConsent,
  AppleSignInResult,
  AuthOtpPurpose,
  AuthSession,
  AuthUser,
  FacebookDataDeletionStatus,
  FacebookSignInNeedsConsent,
  FacebookSignInResult,
  GoogleSignInNeedsConsent,
  GoogleSignInResult,
  ManageGuestOrderResult,
  RefreshedSession,
  SocialSignInNeedsAccountChoice,
};

export { BackendUnavailableError, isBackendUnavailableError } from './http';
export { ApiError } from './errors';
export function isGoogleSignInNeedsConsent(result: GoogleSignInResult): result is GoogleSignInNeedsConsent {
  return 'needsConsent' in result && result.needsConsent === true && 'googleSignupToken' in result;
}

export function isSocialSignInNeedsAccountChoice(result: unknown): result is SocialSignInNeedsAccountChoice {
  return (
    typeof result === 'object' &&
    result !== null &&
    'needsAccountChoice' in result &&
    (result as SocialSignInNeedsAccountChoice).needsAccountChoice === true &&
    'socialPendingToken' in result
  );
}
export function isAppleSignInNeedsConsent(result: AppleSignInResult): result is AppleSignInNeedsConsent {
  return 'needsConsent' in result && result.needsConsent === true && 'appleSignupToken' in result;
}
export function isFacebookSignInNeedsConsent(
  result: FacebookSignInResult,
): result is FacebookSignInNeedsConsent {
  return 'needsConsent' in result && result.needsConsent === true && 'facebookSignupToken' in result;
}
export function register(
  email: string,
  password: string,
  gdprAccepted: boolean,
  language: Lang,
): Promise<AuthSession> {
  return request<AuthSession>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, gdprConsent: { accepted: gdprAccepted }, language }),
  }).then((session) => {
    markAuthSessionPresent();
    return session;
  });
}

export function login(email: string, password: string, rememberMe: boolean): Promise<AuthSession> {
  return request<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, rememberMe }),
  }).then((session) => {
    markAuthSessionPresent();
    return session;
  });
}

/** Unified connect form: creates the account when the email has none yet
 * (`created: true`), otherwise logs into the existing one — a wrong password
 * on an existing account still rejects with the same `invalid_credentials`
 * as login(). `gdprAccepted` is required only when the create branch runs. */
export function loginOrRegister(
  email: string,
  password: string,
  gdprAccepted: boolean,
  rememberMe: boolean,
  language: Lang,
): Promise<AuthSession> {
  return request<AuthSession>('/auth/login-or-register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      gdprConsent: { accepted: gdprAccepted },
      rememberMe,
      language,
    }),
  }).then((session) => {
    markAuthSessionPresent();
    return session;
  });
}
export function requestOtp(
  email: string,
  purpose: AuthOtpPurpose,
  options?: { gdprAccepted?: boolean; language?: Lang },
): Promise<{ success: true }> {
  return request('/auth/request-otp', {
    method: 'POST',
    body: JSON.stringify({
      email,
      purpose,
      language: options?.language,
      gdprConsent: options?.gdprAccepted ? { accepted: true } : undefined,
    }),
  });
}

export function verifyOtp(
  email: string,
  code: string,
  purpose: AuthOtpPurpose,
  rememberMe = false,
): Promise<AuthSession> {
  return request<AuthSession>('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, code, purpose, rememberMe }),
  }).then((session) => {
    markAuthSessionPresent();
    return session;
  });
}

export function signInWithGoogle(options: {
  idToken: string;
  gdprAccepted?: boolean;
  rememberMe?: boolean;
  language?: Lang;
}): Promise<GoogleSignInResult> {
  return request<GoogleSignInResult>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({
      idToken: options.idToken,
      ...(options.gdprAccepted !== undefined ? { gdprConsent: { accepted: options.gdprAccepted } } : {}),
      rememberMe: options.rememberMe ?? false,
      ...(options.language ? { language: options.language } : {}),
    }),
  }).then((result) => {
    if (!isGoogleSignInNeedsConsent(result) && !isSocialSignInNeedsAccountChoice(result)) {
      markAuthSessionPresent();
    }
    return result;
  });
}

export function completeGoogleSignup(options: {
  googleSignupToken: string;
  gdprAccepted: boolean;
  rememberMe?: boolean;
}): Promise<AuthSession> {
  return request<AuthSession>('/auth/google/complete', {
    method: 'POST',
    body: JSON.stringify({
      googleSignupToken: options.googleSignupToken,
      gdprConsent: { accepted: options.gdprAccepted },
      rememberMe: options.rememberMe ?? false,
    }),
  }).then((session) => {
    markAuthSessionPresent();
    return session;
  });
}

export function signInWithApple(options: {
  idToken: string;
  nonce: string;
  gdprAccepted?: boolean;
  rememberMe?: boolean;
  language?: Lang;
}): Promise<AppleSignInResult> {
  return request<AppleSignInResult>('/auth/apple', {
    method: 'POST',
    body: JSON.stringify({
      idToken: options.idToken,
      nonce: options.nonce,
      ...(options.gdprAccepted !== undefined ? { gdprConsent: { accepted: options.gdprAccepted } } : {}),
      rememberMe: options.rememberMe ?? false,
      ...(options.language ? { language: options.language } : {}),
    }),
  }).then((result) => {
    if (!isAppleSignInNeedsConsent(result) && !isSocialSignInNeedsAccountChoice(result)) {
      markAuthSessionPresent();
    }
    return result;
  });
}

export function completeAppleSignup(options: {
  appleSignupToken: string;
  gdprAccepted: boolean;
  rememberMe?: boolean;
}): Promise<AuthSession> {
  return request<AuthSession>('/auth/apple/complete', {
    method: 'POST',
    body: JSON.stringify({
      appleSignupToken: options.appleSignupToken,
      gdprConsent: { accepted: options.gdprAccepted },
      rememberMe: options.rememberMe ?? false,
    }),
  }).then((session) => {
    markAuthSessionPresent();
    return session;
  });
}

export function signInWithFacebook(options: {
  accessToken: string;
  gdprAccepted?: boolean;
  rememberMe?: boolean;
  language?: Lang;
}): Promise<FacebookSignInResult> {
  return request<FacebookSignInResult>('/auth/facebook', {
    method: 'POST',
    body: JSON.stringify({
      accessToken: options.accessToken,
      ...(options.gdprAccepted !== undefined ? { gdprConsent: { accepted: options.gdprAccepted } } : {}),
      rememberMe: options.rememberMe ?? false,
      ...(options.language ? { language: options.language } : {}),
    }),
  }).then((result) => {
    if (!isFacebookSignInNeedsConsent(result) && !isSocialSignInNeedsAccountChoice(result)) {
      markAuthSessionPresent();
    }
    return result;
  });
}

export function completeFacebookSignup(options: {
  facebookSignupToken: string;
  gdprAccepted: boolean;
  rememberMe?: boolean;
}): Promise<AuthSession> {
  return request<AuthSession>('/auth/facebook/complete', {
    method: 'POST',
    body: JSON.stringify({
      facebookSignupToken: options.facebookSignupToken,
      gdprConsent: { accepted: options.gdprAccepted },
      rememberMe: options.rememberMe ?? false,
    }),
  }).then((session) => {
    markAuthSessionPresent();
    return session;
  });
}

export function createSocialAccount(options: {
  socialPendingToken: string;
  gdprAccepted: boolean;
  rememberMe?: boolean;
}): Promise<AuthSession> {
  return request<AuthSession>('/auth/social/create', {
    method: 'POST',
    body: JSON.stringify({
      socialPendingToken: options.socialPendingToken,
      gdprConsent: { accepted: options.gdprAccepted },
      rememberMe: options.rememberMe ?? false,
    }),
  }).then((session) => {
    markAuthSessionPresent();
    return session;
  });
}

export function requestSocialLinkOtp(options: {
  socialPendingToken: string;
  email: string;
}): Promise<{ success: true }> {
  return request('/auth/social/link/request-otp', {
    method: 'POST',
    body: JSON.stringify({
      socialPendingToken: options.socialPendingToken,
      email: options.email,
    }),
  });
}

export function verifySocialLinkOtp(options: {
  socialPendingToken: string;
  email: string;
  code: string;
  rememberMe?: boolean;
}): Promise<AuthSession> {
  return request<AuthSession>('/auth/social/link/verify', {
    method: 'POST',
    body: JSON.stringify({
      socialPendingToken: options.socialPendingToken,
      email: options.email,
      code: options.code,
      rememberMe: options.rememberMe ?? false,
    }),
  }).then((session) => {
    markAuthSessionPresent();
    return session;
  });
}
export function getFacebookDataDeletionStatus(code: string): Promise<{
  success: true;
  confirmationCode: string;
  status: FacebookDataDeletionStatus;
  deletionScheduledFor: string | null;
  createdAt: string;
}> {
  return request(`/auth/facebook/data-deletion/${encodeURIComponent(code)}`);
}

/** Readable companion to the httpOnly refresh cookie. JS cannot see that
 * cookie, so without this hint every cold load would POST /auth/refresh and
 * log a 401 for anonymous visitors. 'anonymous' skips the probe; missing
 * (first visit / cleared storage) still probes once in case a cookie remains. */
const AUTH_HINT_KEY = 'psn-auth-hint';

function readAuthHint(): 'session' | 'anonymous' | null {
  try {
    const value = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('psn-gift-receiver-isolated') === '1' ? 'anonymous' : window.localStorage.getItem(AUTH_HINT_KEY);
    if (value === 'session' || value === 'anonymous') return value;
  } catch {
    // private mode / blocked storage
  }
  return null;
}

function writeAuthHint(hint: 'session' | 'anonymous'): void {
  try {
    if (!(hint === 'anonymous' && typeof sessionStorage !== 'undefined' && sessionStorage.getItem('psn-gift-receiver-isolated') === '1')) window.localStorage.setItem(AUTH_HINT_KEY, hint);
  } catch {
    // ignore
  }
}

export function markAuthSessionPresent(): void {
  writeAuthHint('session');
}

export function markAuthSessionAbsent(): void {
  writeAuthHint('anonymous');
}

/** No body — the refresh token travels only as the httpOnly cookie
 * (credentials:'include' above), never touched by JS.
 *
 * De-duplicates concurrent calls into a single in-flight request: the
 * backend rotates the refresh token on every use and treats a second
 * presentation of an already-rotated token as a theft signal (revokes the
 * whole session) — without this, two near-simultaneous callers (e.g. React
 * StrictMode's dev-mode double effect invocation, or two components each
 * reacting to a 401 at once) would race each other over the same starting
 * cookie and one of them would always lose, killing a session that was
 * never actually compromised. */
let inFlightRefresh: Promise<RefreshedSession> | null = null;

export function refreshSession(): Promise<RefreshedSession> {
  if (!inFlightRefresh) {
    inFlightRefresh = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('psn-gift-receiver-isolated') === '1' ? Promise.reject(new Error('recipient-tab')) : request<RefreshedSession>('/auth/refresh', { method: 'POST' }))
      .then((session) => {
        markAuthSessionPresent();
        return session;
      })
      .catch((error) => {
        markAuthSessionAbsent();
        throw error;
      })
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

/** Lets manage-order wait out a silent refresh before replacing the cookie,
 * so a late Set-Cookie cannot restore the previous remember-me account. */
export async function waitForInFlightRefresh(): Promise<void> {
  if (!inFlightRefresh) return;
  await inFlightRefresh.catch(() => undefined);
}

/** Module-level cold-boot restore. Started from main.tsx before React mounts
 * so the network overlaps provider commit; AuthProvider awaits the same
 * promise (including a settled null for anonymous). Mid-session 401 retries
 * still call refreshSession() directly. */
let bootstrapRefresh: Promise<RefreshedSession | null> | null = null;

export function startAuthBootstrap(): Promise<RefreshedSession | null> {
  if (!bootstrapRefresh) {
    if (readAuthHint() === 'anonymous') {
      bootstrapRefresh = Promise.resolve(readImpersonationHandoff());
    } else {
      bootstrapRefresh = refreshSession().catch(() => null);
    }
  }
  return bootstrapRefresh;
}

export function logout(accessToken: string): Promise<{ success: true }> {
  return (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('psn-gift-receiver-isolated') === '1' ? Promise.resolve({ success: true as const }) : request<{ success: true }>('/auth/logout', {
    method: 'POST',
    headers: authHeaders(accessToken),
  })).finally(() => {
    markAuthSessionAbsent();
  });
}

export function confirmPasswordReset(token: string, newPassword: string): Promise<{ success: true }> {
  return request('/auth/confirm-password-reset', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

export function confirmEmail(
  token: string,
): Promise<{ success: true; emailChanged: boolean; alreadyVerified: boolean }> {
  // Share one in-flight/settled promise per token so React StrictMode's
  // double effect (and email-client prefetch + real click) don't race two
  // consumes and flip the UI from "verified" to "already verified".
  const existing = confirmEmailInFlight.get(token);
  if (existing) return existing;
  const promise = request<{ success: true; emailChanged: boolean; alreadyVerified: boolean }>(
    '/auth/confirm-email',
    { method: 'POST', body: JSON.stringify({ token }) },
  ).catch((err: unknown) => {
    confirmEmailInFlight.delete(token);
    throw err;
  });
  confirmEmailInFlight.set(token, promise);
  return promise;
}

const confirmEmailInFlight = new Map<
  string,
  Promise<{ success: true; emailChanged: boolean; alreadyVerified: boolean }>
>();
export function manageGuestOrder(token: string): Promise<ManageGuestOrderResult> {
  const existing = manageGuestOrderInFlight.get(token);
  if (existing) return existing;
  const promise = request<ManageGuestOrderResult>('/auth/manage-guest-order', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
    .then((result) => {
      if ('accessToken' in result && result.accessToken) markAuthSessionPresent();
      return result;
    })
    .catch((err: unknown) => {
      manageGuestOrderInFlight.delete(token);
      throw err;
    });
  manageGuestOrderInFlight.set(token, promise);
  return promise;
}

const manageGuestOrderInFlight = new Map<string, Promise<ManageGuestOrderResult>>();

/** "This wasn't me" — locks the account until an operator reverses it (see
 * API.md). No access token: the real owner may not even be able to log in
 * as themselves anymore if this wasn't them. */
export function lockAccount(token: string): Promise<{ success: true }> {
  return request('/auth/lock-account', { method: 'POST', body: JSON.stringify({ token }) });
}

export function resendEmailConfirmation(accessToken: string): Promise<{ success: true }> {
  return request('/auth/resend-email-confirmation', { method: 'POST', headers: authHeaders(accessToken) });
}

export function getProfile(accessToken: string): Promise<{ success: true; user: AuthUser }> {
  return request('/account/profile', { headers: authHeaders(accessToken) });
}

/** Admin-only bearer session; unlike login it never creates a refresh cookie. */
export function impersonateUser(accessToken: string, email: string): Promise<AuthSession> {
  return request<AuthSession>('/admin/impersonate', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ email }),
  });
}
