import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { updateLanguagePreference } from '../api/account';
import * as authApi from '../api/identity';
import { ApiError } from '../api/errors';
import { type AuthSession, type AuthUser } from '../api/identity';
import type { Lang } from '../assets/i18n';
import { preferredLanguage } from '../assets/i18n/languagePreference';
import { useLang } from '../assets/i18n';
import { LoginMergeDialog } from '../components/cart/LoginMergeDialog';
import { shopConfig } from '../config/env';
import { delay } from '../utils/withMinDuration';
import {
  completeGuestCartMerge,
  mergeGuestStateIntoAccount,
  parkGuestCartAsUnconnected,
  type GuestCartMergeChoice,
} from './guestSync';
import { clearRememberedGuestCheckout } from './guestCardVault';
import { clearEphemeralAddresses } from './ephemeralAddresses';
import { clearEphemeralCards } from './ephemeralCards';
import { invalidateProductCache } from './productCache';
import { invalidateCartBootstrapCache } from './cartBootstrapCache';
import { initializeCheckoutPrivacySession, resetCheckoutPrivacySession } from './checkoutPrivacySession';
import { clearAuthConsentDraft } from './authConsentDraft';
import { clearGiftLockSession } from './giftLockSession';
import { clearAdminBrowserSession } from './adminSessionLand';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

/** Which view AuthModal should open on — lives here (not in AuthModal.tsx)
 * so any component can request the prompt via promptAuth() below without
 * importing the modal component itself. */
export type AuthMode = 'login' | 'register';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string, rememberMe: boolean) => Promise<authApi.AuthSession>;
  /** Cart-page password flow — see authApi.loginOrRegister's own doc comment. */
  loginOrRegister: (
    email: string,
    password: string,
    gdprAccepted: boolean,
    rememberMe: boolean,
    language: Lang,
  ) => Promise<authApi.AuthSession>;
  register: (
    email: string,
    password: string,
    gdprAccepted: boolean,
    language: Lang,
  ) => Promise<authApi.AuthSession>;
  requestOtp: (
    email: string,
    purpose: authApi.AuthOtpPurpose,
    options?: { gdprAccepted?: boolean; language?: Lang },
  ) => Promise<void>;
  verifyOtp: (
    email: string,
    code: string,
    purpose: authApi.AuthOtpPurpose,
    rememberMe?: boolean,
  ) => Promise<authApi.AuthSession>;
  signInWithGoogle: (options: {
    idToken: string;
    gdprAccepted?: boolean;
    rememberMe?: boolean;
    language?: Lang;
  }) => Promise<authApi.GoogleSignInResult | authApi.AuthSession>;
  completeGoogleSignup: (options: {
    googleSignupToken: string;
    gdprAccepted: boolean;
    rememberMe?: boolean;
  }) => Promise<authApi.AuthSession>;
  signInWithApple: (options: {
    idToken: string;
    nonce: string;
    gdprAccepted?: boolean;
    rememberMe?: boolean;
    language?: Lang;
  }) => Promise<authApi.AppleSignInResult | authApi.AuthSession>;
  completeAppleSignup: (options: {
    appleSignupToken: string;
    gdprAccepted: boolean;
    rememberMe?: boolean;
  }) => Promise<authApi.AuthSession>;
  signInWithFacebook: (options: {
    accessToken: string;
    gdprAccepted?: boolean;
    rememberMe?: boolean;
    language?: Lang;
  }) => Promise<authApi.FacebookSignInResult | authApi.AuthSession>;
  completeFacebookSignup: (options: {
    facebookSignupToken: string;
    gdprAccepted: boolean;
    rememberMe?: boolean;
  }) => Promise<authApi.AuthSession>;
  createSocialAccount: (options: {
    socialPendingToken: string;
    gdprAccepted: boolean;
    rememberMe?: boolean;
  }) => Promise<authApi.AuthSession>;
  requestSocialLinkOtp: (options: {
    socialPendingToken: string;
    email: string;
  }) => Promise<{ success: true }>;
  verifySocialLinkOtp: (options: {
    socialPendingToken: string;
    email: string;
    code: string;
    rememberMe?: boolean;
  }) => Promise<authApi.AuthSession>;
  completeManageGuestOrder: (token: string) => Promise<{ alreadyManaged: boolean }>;
  completeGiftGiverEnter: <T extends AuthSession>(claim: () => Promise<T>) => Promise<T>;
  logout: () => Promise<void>;
  impersonate: (email: string) => Promise<void>;
  stopImpersonating: () => void;
  isImpersonating: boolean;
  setUser: (user: AuthUser) => void;
  /** Runs an authenticated API call with the current access token; on a 401
   * (access token expired mid-session — it's short-lived by design), tries
   * one silent refresh and retries once before giving up and logging out
   * locally. Every account/*-calling component should go through this
   * rather than calling api/auth.ts's authenticated functions directly with
   * a token read once at render time. */
  authedRequest: <T>(fn: (accessToken: string) => Promise<T>) => Promise<T>;
  /** Set whenever something wants to interrupt with a login/register prompt
   * (the cart page's guest checkout card) — rendered once, app-wide, by
   * GlobalAuthModal (mounted in Layout.tsx), so any component can trigger it
   * without owning its own modal instance. */
  authPromptMode: AuthMode | null;
  /** Pre-fills the modal's email field — e.g. the guest checkout card's own
   * email input, so typing it once there carries over instead of asking
   * again inside the modal. */
  authPromptEmail: string | null;
  promptAuth: (mode?: AuthMode, email?: string) => void;
  dismissAuthPrompt: () => void;
  /** True once a login/register/OTP verify has succeeded but the guest cart
   * merge choice (LoginMergeDialog) is still waiting on the customer — status
   * deliberately stays 'anonymous' during this window (see
   * finishAuthWithGuestMerge), so callers that only close on 'authenticated'
   * (e.g. GuestCheckoutPrompt) need this to know the flow has moved on. */
  hasPendingGuestMerge: boolean;
}

export type AuthSessionContextValue = Pick<
  AuthContextValue,
  'status' | 'user' | 'isImpersonating' | 'setUser' | 'authedRequest'
>;

export type AuthCommandsContextValue = Pick<
  AuthContextValue,
  | 'login'
  | 'loginOrRegister'
  | 'register'
  | 'requestOtp'
  | 'verifyOtp'
  | 'signInWithGoogle'
  | 'completeGoogleSignup'
  | 'signInWithApple'
  | 'completeAppleSignup'
  | 'signInWithFacebook'
  | 'completeFacebookSignup'
  | 'createSocialAccount'
  | 'requestSocialLinkOtp'
  | 'verifySocialLinkOtp'
  | 'completeManageGuestOrder'
  | 'completeGiftGiverEnter'
  | 'logout'
  | 'impersonate'
  | 'stopImpersonating'
>;

export type AuthPromptContextValue = Pick<
  AuthContextValue,
  'authPromptMode' | 'authPromptEmail' | 'promptAuth' | 'dismissAuthPrompt' | 'hasPendingGuestMerge'
>;

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);
const AuthCommandsContext = createContext<AuthCommandsContextValue | null>(null);
const AuthPromptContext = createContext<AuthPromptContextValue | null>(null);

interface PendingGuestMerge {
  session: AuthSession;
  choice: GuestCartMergeChoice;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t, lang } = useLang();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUserState] = useState<AuthUser | null>(null);
  // authedRequest must remain stable when profile fields change: account
  // bootstrap effects depend on it, and a freshly applied profile must not
  // recursively trigger the same GET again. The ref still gives the 401
  // impersonation retry path the current user rather than a stale closure.
  const userRef = useRef<AuthUser | null>(user);
  userRef.current = user;
  const [authPromptMode, setAuthPromptMode] = useState<AuthMode | null>(null);
  const [authPromptEmail, setAuthPromptEmail] = useState<string | null>(null);
  const [pendingGuestMerge, setPendingGuestMerge] = useState<PendingGuestMerge | null>(null);
  // Access token lives only in memory (React state/ref), never localStorage —
  // see the plan's token-storage rationale (an XSS can only ride this
  // short-lived token, not the httpOnly long-lived refresh cookie).
  const accessTokenRef = useRef<string | null>(null);
  const adminSessionRef = useRef<{ user: AuthUser; accessToken: string } | null>(null);
  // Bumped on explicit login/logout/manage-order so a cold-boot silent
  // refresh that was already in flight cannot overwrite that newer session
  // (remember-me cookie vs a pasted guest manage-order link).
  const sessionGenerationRef = useRef(0);
  /** Wall-clock start + loading floor for the in-flight connect call — used so
   * LoginMergeDialog opens only after the caller's LoadingModal min duration. */
  const authOpStartedAtRef = useRef<number | null>(null);
  const authOpMinMsRef = useRef(shopConfig.loadingMinMs.normal);
  const promptAuth = useCallback((mode: AuthMode = 'login', email?: string) => {
    // Already signed in — never reopen login/register (AccountControl and
    // similar callers already branch, but defend against any other path).
    if (accessTokenRef.current) return;
    // 'register' is accepted for older callers and mapped to unified connect.
    setAuthPromptMode(mode === 'register' ? 'login' : mode);
    setAuthPromptEmail(email ?? null);
  }, []);
  const dismissAuthPrompt = useCallback(() => setAuthPromptMode(null), []);

  const applySession = useCallback((session: { user: AuthUser; accessToken: string }) => {
    sessionGenerationRef.current += 1;
    accessTokenRef.current = session.accessToken;
    authApi.markAuthSessionPresent();
    // A signed-in customer can see products an anonymous one cannot (user
    // library), and those responses are `private, no-store` — anything
    // cached as 'anon' must not be reused now. See state/productCache.ts.
    invalidateProductCache('login');
    invalidateCartBootstrapCache('login');
    setUserState(session.user);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    sessionGenerationRef.current += 1;
    accessTokenRef.current = null;
    adminSessionRef.current = null;
    // Mirror of applySession: drop this account's private catalogue view
    // rather than leaving it readable to whoever uses the tab next.
    invalidateProductCache('logout');
    invalidateCartBootstrapCache('logout');
    setUserState(null);
    setStatus('anonymous');
    authApi.markAuthSessionAbsent();
    clearAdminBrowserSession();
  }, []);

  const unlockAuthenticatedVault = useCallback(async (accessToken: string) => {
    try {
      await initializeCheckoutPrivacySession(accessToken);
    } catch {
      // Leave any sessionStorage ciphertext for a later retry after refresh;
      // do not wipe it on a transient vault-key fetch failure.
    }
  }, []);

  // Silent refresh on first load — the refresh-token cookie (if any) is the
  // only thing that can restore a session across a page reload, since the
  // access token itself was never persisted. main.tsx starts the same
  // promise early via startAuthBootstrap() so the round-trip overlaps mount.
  // Skipped when localStorage already recorded a prior anonymous probe.
  useEffect(() => {
    let cancelled = false;
    const generationAtStart = sessionGenerationRef.current;
    (async () => {
      const refreshed = await authApi.startAuthBootstrap();
      if (cancelled || sessionGenerationRef.current !== generationAtStart) return;
      if (!refreshed) {
        clearSession();
        await initializeCheckoutPrivacySession();
        return;
      }
      accessTokenRef.current = refreshed.accessToken;
      // Auto-login restores the session without going through applySession,
      // so the product cache has to be dropped here too — see its own
      // invalidateProductCache call for why the audience matters.
      invalidateProductCache('login');
      invalidateCartBootstrapCache('login');
      if (refreshed.user) {
        await unlockAuthenticatedVault(refreshed.accessToken);
        if (cancelled || sessionGenerationRef.current !== generationAtStart) return;
        setUserState(refreshed.user);
        setStatus('authenticated');
        return;
      }
      // Deploy overlap: older backends returned tokens only.
      try {
        const profile = await authApi.getProfile(refreshed.accessToken);
        if (cancelled || sessionGenerationRef.current !== generationAtStart) return;
        await unlockAuthenticatedVault(refreshed.accessToken);
        if (cancelled || sessionGenerationRef.current !== generationAtStart) return;
        setUserState(profile.user);
        setStatus('authenticated');
      } catch {
        if (!cancelled && sessionGenerationRef.current === generationAtStart) {
          clearSession();
          await initializeCheckoutPrivacySession();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession, unlockAuthenticatedVault]);

  // Covers the short initial window while a refresh is still restoring the
  // session: a language picked then is already cached locally, and is
  // persisted as soon as the account becomes available.
  useEffect(() => {
    if (status !== 'authenticated' || !accessTokenRef.current) return;
    void updateLanguagePreference(accessTokenRef.current, preferredLanguage()).catch(() => {
      // Local language selection remains authoritative for this browser;
      // retrying will happen on the next switch or restored session.
    });
  }, [status]);

  const authedRequest = useCallback(
    async <T,>(fn: (accessToken: string) => Promise<T>): Promise<T> => {
      const token = accessTokenRef.current;
      if (!token) throw new ApiError('unauthorized', 401);
      const generationAtCall = sessionGenerationRef.current;
      try {
        return await fn(token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'unauthorized') throw error;
        let refreshed: Awaited<ReturnType<typeof authApi.refreshSession>>;
        try {
          refreshed = await authApi.refreshSession();
        } catch (refreshError) {
          if (sessionGenerationRef.current !== generationAtCall) {
            const current = accessTokenRef.current;
            if (current) return await fn(current);
            throw error;
          }
          clearSession();
          throw refreshError;
        }
        if (sessionGenerationRef.current !== generationAtCall) {
          const current = accessTokenRef.current;
          if (!current) throw error;
          return await fn(current);
        }
        const currentUser = userRef.current;
        if (adminSessionRef.current && currentUser) {
          const adminUser = refreshed.user ?? adminSessionRef.current.user;
          adminSessionRef.current = { user: adminUser, accessToken: refreshed.accessToken };
          const impersonated = await authApi.impersonateUser(refreshed.accessToken, currentUser.email);
          accessTokenRef.current = impersonated.accessToken;
          return await fn(impersonated.accessToken);
        }
        accessTokenRef.current = refreshed.accessToken;
        // Refresh succeeded. A still-unauthorized retry is the endpoint, not
        // a dead cookie — logging out here would kick an administrator out
        // of the dashboard when one of several parallel /admin calls 401s.
        return await fn(refreshed.accessToken);
      }
    },
    [clearSession],
  );

  const finishAuthWithGuestMerge = useCallback(
    async (session: AuthSession) => {
      // Claim the session before awaits so a late silent-refresh cannot
      // restore the previous remember-me account over this one.
      sessionGenerationRef.current += 1;
      // Switch to the server vault key before guest merge writes one-time
      // address/card copies into the encrypted session cache.
      await unlockAuthenticatedVault(session.accessToken);
      const mergeResult = await mergeGuestStateIntoAccount(session.accessToken, {
        attachRememberedCheckout: session.created === true,
      }).catch((): { status: 'done' } => ({ status: 'done' }));
      if (mergeResult.status === 'needs_cart_choice') {
        // Hold the session in memory but do not flip status yet — the merge
        // dialog must resolve first so CartProvider doesn't fetch mid-merge.
        // Drop any remember-me user that silent-refresh already applied:
        // otherwise the previous account stays visible (and /orders would
        // load as them) while this token's user is still pending.
        accessTokenRef.current = session.accessToken;
        setUserState(null);
        setStatus('anonymous');
        dismissAuthPrompt();
        // Callers wrap this in withMinDuration(loginMin) which races the
        // network against a parallel delay — so pendingGuestMerge must not
        // mount LoginMergeDialog until that same floor has elapsed, or the
        // merge prompt appears on top of the still-visible LoadingModal.
        const started = authOpStartedAtRef.current ?? Date.now();
        const minMs = authOpMinMsRef.current;
        const waitMs = Math.max(0, minMs - (Date.now() - started));
        if (waitMs > 0) await delay(waitMs);
        setPendingGuestMerge({ session, choice: mergeResult.choice });
        return session;
      }
      applySession(session);
      dismissAuthPrompt();
      return session;
    },
    [applySession, dismissAuthPrompt, unlockAuthenticatedVault],
  );

  function beginAuthOp(minMs: number) {
    authOpStartedAtRef.current = Date.now();
    authOpMinMsRef.current = minMs;
  }

  function endAuthOp() {
    authOpStartedAtRef.current = null;
  }

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      beginAuthOp(shopConfig.loadingMinMs.normal);
      try {
        const session = await authApi.login(email, password, rememberMe);
        return await finishAuthWithGuestMerge(session);
      } finally {
        endAuthOp();
      }
    },
    [finishAuthWithGuestMerge],
  );

  const loginOrRegister = useCallback(
    async (email: string, password: string, gdprAccepted: boolean, rememberMe: boolean, language: Lang) => {
      beginAuthOp(shopConfig.loadingMinMs.normal);
      try {
        const session = await authApi.loginOrRegister(email, password, gdprAccepted, rememberMe, language);
        return await finishAuthWithGuestMerge(session);
      } finally {
        endAuthOp();
      }
    },
    [finishAuthWithGuestMerge],
  );

  const register = useCallback(
    async (email: string, password: string, gdprAccepted: boolean, language: Lang) => {
      beginAuthOp(shopConfig.loadingMinMs.normal);
      try {
        const session = await authApi.register(email, password, gdprAccepted, language);
        return await finishAuthWithGuestMerge(session);
      } finally {
        endAuthOp();
      }
    },
    [finishAuthWithGuestMerge],
  );

  const requestOtp = useCallback(
    async (
      email: string,
      purpose: authApi.AuthOtpPurpose,
      options?: { gdprAccepted?: boolean; language?: Lang },
    ) => {
      await authApi.requestOtp(email, purpose, options);
    },
    [],
  );

  const verifyOtp = useCallback(
    async (email: string, code: string, purpose: authApi.AuthOtpPurpose, rememberMe = false) => {
      beginAuthOp(shopConfig.loadingMinMs.normal);
      try {
        const session = await authApi.verifyOtp(email, code, purpose, rememberMe);
        return await finishAuthWithGuestMerge(session);
      } finally {
        endAuthOp();
      }
    },
    [finishAuthWithGuestMerge],
  );

  const signInWithGoogle = useCallback(
    async (options: { idToken: string; gdprAccepted?: boolean; rememberMe?: boolean; language?: Lang }) => {
      beginAuthOp(shopConfig.loadingMinMs.normal);
      try {
        const result = await authApi.signInWithGoogle(options);
        if (authApi.isGoogleSignInNeedsConsent(result)) return result;
        if (authApi.isSocialSignInNeedsAccountChoice(result)) return result;
        return await finishAuthWithGuestMerge(result);
      } finally {
        endAuthOp();
      }
    },
    [finishAuthWithGuestMerge],
  );

  const completeGoogleSignup = useCallback(
    async (options: { googleSignupToken: string; gdprAccepted: boolean; rememberMe?: boolean }) => {
      beginAuthOp(shopConfig.loadingMinMs.normal);
      try {
        const session = await authApi.completeGoogleSignup(options);
        return await finishAuthWithGuestMerge(session);
      } finally {
        endAuthOp();
      }
    },
    [finishAuthWithGuestMerge],
  );

  const signInWithApple = useCallback(
    async (options: {
      idToken: string;
      nonce: string;
      gdprAccepted?: boolean;
      rememberMe?: boolean;
      language?: Lang;
    }) => {
      beginAuthOp(shopConfig.loadingMinMs.normal);
      try {
        const result = await authApi.signInWithApple(options);
        if (authApi.isAppleSignInNeedsConsent(result)) return result;
        if (authApi.isSocialSignInNeedsAccountChoice(result)) return result;
        return await finishAuthWithGuestMerge(result);
      } finally {
        endAuthOp();
      }
    },
    [finishAuthWithGuestMerge],
  );

  const completeAppleSignup = useCallback(
    async (options: { appleSignupToken: string; gdprAccepted: boolean; rememberMe?: boolean }) => {
      beginAuthOp(shopConfig.loadingMinMs.normal);
      try {
        const session = await authApi.completeAppleSignup(options);
        return await finishAuthWithGuestMerge(session);
      } finally {
        endAuthOp();
      }
    },
    [finishAuthWithGuestMerge],
  );

  const signInWithFacebook = useCallback(
    async (options: {
      accessToken: string;
      gdprAccepted?: boolean;
      rememberMe?: boolean;
      language?: Lang;
    }) => {
      beginAuthOp(shopConfig.loadingMinMs.normal);
      try {
        const result = await authApi.signInWithFacebook(options);
        if (authApi.isFacebookSignInNeedsConsent(result)) return result;
        if (authApi.isSocialSignInNeedsAccountChoice(result)) return result;
        return await finishAuthWithGuestMerge(result);
      } finally {
        endAuthOp();
      }
    },
    [finishAuthWithGuestMerge],
  );

  const completeFacebookSignup = useCallback(
    async (options: { facebookSignupToken: string; gdprAccepted: boolean; rememberMe?: boolean }) => {
      beginAuthOp(shopConfig.loadingMinMs.normal);
      try {
        const session = await authApi.completeFacebookSignup(options);
        return await finishAuthWithGuestMerge(session);
      } finally {
        endAuthOp();
      }
    },
    [finishAuthWithGuestMerge],
  );

  const createSocialAccount = useCallback(
    async (options: { socialPendingToken: string; gdprAccepted: boolean; rememberMe?: boolean }) => {
      beginAuthOp(shopConfig.loadingMinMs.normal);
      try {
        const session = await authApi.createSocialAccount(options);
        return await finishAuthWithGuestMerge(session);
      } finally {
        endAuthOp();
      }
    },
    [finishAuthWithGuestMerge],
  );

  const requestSocialLinkOtp = useCallback(async (options: { socialPendingToken: string; email: string }) => {
    return authApi.requestSocialLinkOtp(options);
  }, []);

  const verifySocialLinkOtp = useCallback(
    async (options: { socialPendingToken: string; email: string; code: string; rememberMe?: boolean }) => {
      beginAuthOp(shopConfig.loadingMinMs.normal);
      try {
        const session = await authApi.verifySocialLinkOtp(options);
        return await finishAuthWithGuestMerge(session);
      } finally {
        endAuthOp();
      }
    },
    [finishAuthWithGuestMerge],
  );

  const logout = useCallback(async () => {
    const token = accessTokenRef.current;
    try {
      if (token) await authApi.logout(token);
    } finally {
      // Drop ciphertext + RAM key so the next visitor cannot read one-time
      // checkout details left by this account in the same tab.
      resetCheckoutPrivacySession();
      clearEphemeralAddresses();
      clearEphemeralCards();
      // A signup/consent draft belongs to the session which just ended.  If
      // it survived, GlobalAuthModal can reopen a stale CGU dialog over the
      // logged-out home page and block the next shopper's login.
      clearAuthConsentDraft({ force: true });
      dismissAuthPrompt();
      clearSession();
      void initializeCheckoutPrivacySession();
    }
  }, [clearSession, dismissAuthPrompt]);

  const completeManageGuestOrder = useCallback(
    async (token: string) => {
      sessionGenerationRef.current += 1;
      // The email link is proof for one address. Any other restored session
      // (remember-me or a live login) must be dropped first, otherwise its
      // refresh cookie keeps that account signed in and the token cannot
      // sign in the matching user.
      await authApi.waitForInFlightRefresh();
      if (accessTokenRef.current) {
        try {
          await authApi.logout(accessTokenRef.current);
        } catch {
          // Cookie/session may already be gone; still drop local state so
          // the token can issue a new one.
        }
        resetCheckoutPrivacySession();
        clearEphemeralAddresses();
        clearEphemeralCards();
        clearSession();
      }
      const result = await authApi.manageGuestOrder(token);
      if (!('accessToken' in result) || !result.accessToken) return { alreadyManaged: true };
      await clearRememberedGuestCheckout();
      sessionGenerationRef.current += 1;
      await unlockAuthenticatedVault(result.accessToken);
      const mergeResult = await mergeGuestStateIntoAccount(result.accessToken, {
        attachRememberedCheckout: false,
      }).catch((): { status: 'done' } => ({ status: 'done' }));
      if (mergeResult.status === 'needs_cart_choice') {
        try {
          await parkGuestCartAsUnconnected(result.accessToken, mergeResult.choice);
        } catch {
          // Guest lines stay in the local vault for a later login; still
          // sign the token's user in so /orders is reachable.
        }
      }
      applySession(result);
      dismissAuthPrompt();
      return { alreadyManaged: false };
    },
    [applySession, clearSession, dismissAuthPrompt, unlockAuthenticatedVault],
  );

  const completeGiftGiverEnter = useCallback(
    async <T extends AuthSession>(claim: () => Promise<T>): Promise<T> => {
      // Invalidate a silent remember-me apply, then drop that account through
      // POST /auth/logout (the only path that receives Path=/auth cookies).
      // open-pay cannot see or revoke them; a session Set-Cookie also does
      // not reliably replace a persistent remember-me cookie.
      sessionGenerationRef.current += 1;
      const bootstrapped = await authApi.startAuthBootstrap();
      const previousAccess = accessTokenRef.current ?? bootstrapped?.accessToken ?? null;
      if (previousAccess) {
        try {
          await authApi.logout(previousAccess);
        } catch {
          // Cookie/session may already be gone; still drop local state.
        }
        resetCheckoutPrivacySession();
        clearEphemeralAddresses();
        clearEphemeralCards();
        clearSession();
      }
      const session = await claim();
      await clearRememberedGuestCheckout();
      sessionGenerationRef.current += 1;
      await unlockAuthenticatedVault(session.accessToken);
      const mergeResult = await mergeGuestStateIntoAccount(session.accessToken, {
        attachRememberedCheckout: false,
      }).catch((): { status: 'done' } => ({ status: 'done' }));
      if (mergeResult.status === 'needs_cart_choice') {
        try {
          await parkGuestCartAsUnconnected(session.accessToken, mergeResult.choice);
        } catch {
          // Guest lines stay in the local vault; still sign the giver in.
        }
      }
      clearGiftLockSession();
      applySession(session);
      dismissAuthPrompt();
      return session;
    },
    [applySession, clearSession, dismissAuthPrompt, unlockAuthenticatedVault],
  );

  const impersonate = useCallback(
    async (email: string) => {
      const token = accessTokenRef.current;
      if (!token || !user || user.role === 'user') throw new ApiError('forbidden', 403);
      const session = await authApi.impersonateUser(token, email);
      adminSessionRef.current = { user, accessToken: token };
      applySession(session);
    },
    [applySession, user],
  );

  const stopImpersonating = useCallback(() => {
    const admin = adminSessionRef.current;
    if (!admin) return;
    adminSessionRef.current = null;
    applySession(admin);
  }, [applySession]);

  const setUser = useCallback((next: AuthUser) => setUserState(next), []);

  const confirmGuestMerge = useCallback(
    async (mode: 'new' | 'merge', targetCartId?: string, name?: string) => {
      if (!pendingGuestMerge) return;
      const { session, choice } = pendingGuestMerge;
      try {
        await completeGuestCartMerge(session.accessToken, choice, mode, targetCartId, name);
      } catch {
        // The chosen import failed (cart limit raced, target deleted…) — park
        // the lines rather than dropping them on the floor.
        // A failure here propagates to LoginMergeDialog, which restores its
        // controls and shows a retryable error instead of trapping the user.
        await parkGuestCartAsUnconnected(session.accessToken, choice);
      }
      setPendingGuestMerge(null);
      applySession(session);
    },
    [pendingGuestMerge, applySession],
  );

  /** Closing the dialog without choosing keeps the guest lines: they land in
   * the account's Unconnected cart, left inactive so the customer stays on the
   * cart they logged into. */
  const closePendingGuestMerge = useCallback(async () => {
    if (!pendingGuestMerge) return;
    const { session, choice } = pendingGuestMerge;
    // Closing is also a server write; a failure reaches LoginMergeDialog,
    // which keeps the guest cart and restores its controls for a retry.
    await parkGuestCartAsUnconnected(session.accessToken, choice);
    setPendingGuestMerge(null);
    applySession(session);
  }, [pendingGuestMerge, applySession]);

  const sessionValue = useMemo<AuthSessionContextValue>(
    () => ({
      status,
      user,
      isImpersonating: adminSessionRef.current !== null,
      setUser,
      authedRequest,
    }),
    [status, user, setUser, authedRequest],
  );

  const commandsValue = useMemo<AuthCommandsContextValue>(
    () => ({
      login,
      loginOrRegister,
      register,
      requestOtp,
      verifyOtp,
      signInWithGoogle,
      completeGoogleSignup,
      signInWithApple,
      completeAppleSignup,
      signInWithFacebook,
      completeFacebookSignup,
      createSocialAccount,
      requestSocialLinkOtp,
      verifySocialLinkOtp,
      completeManageGuestOrder,
      completeGiftGiverEnter,
      logout,
      impersonate,
      stopImpersonating,
    }),
    [
      login,
      loginOrRegister,
      register,
      requestOtp,
      verifyOtp,
      signInWithGoogle,
      completeGoogleSignup,
      signInWithApple,
      completeAppleSignup,
      signInWithFacebook,
      completeFacebookSignup,
      createSocialAccount,
      requestSocialLinkOtp,
      verifySocialLinkOtp,
      completeManageGuestOrder,
      completeGiftGiverEnter,
      logout,
      impersonate,
      stopImpersonating,
    ],
  );

  const promptValue = useMemo<AuthPromptContextValue>(
    () => ({
      authPromptMode,
      authPromptEmail,
      promptAuth,
      dismissAuthPrompt,
      hasPendingGuestMerge: pendingGuestMerge !== null,
    }),
    [authPromptMode, authPromptEmail, promptAuth, dismissAuthPrompt, pendingGuestMerge],
  );

  return (
    <AuthSessionContext.Provider value={sessionValue}>
      <AuthCommandsContext.Provider value={commandsValue}>
        <AuthPromptContext.Provider value={promptValue}>
          {children}
          {pendingGuestMerge && (
            <LoginMergeDialog
              carts={pendingGuestMerge.choice.carts}
              cartLimit={pendingGuestMerge.choice.cartLimit}
              t={t}
              lang={lang}
              onConfirm={async (mode, targetCartId, name) => {
                await confirmGuestMerge(mode, targetCartId, name);
              }}
              onDiscard={closePendingGuestMerge}
            />
          )}
        </AuthPromptContext.Provider>
      </AuthCommandsContext.Provider>
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionContextValue {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) throw new Error('useAuthSession must be used within AuthProvider');
  return ctx;
}

export function useAuthCommands(): AuthCommandsContextValue {
  const ctx = useContext(AuthCommandsContext);
  if (!ctx) throw new Error('useAuthCommands must be used within AuthProvider');
  return ctx;
}

export function useAuthPrompt(): AuthPromptContextValue {
  const ctx = useContext(AuthPromptContext);
  if (!ctx) throw new Error('useAuthPrompt must be used within AuthProvider');
  return ctx;
}
