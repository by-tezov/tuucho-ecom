import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLang } from '@kernel/front/assets/i18n';
import * as accountApi from '@kernel/front/api/account';
import { fetchCartRules, type PublicCartRule } from '@kernel/front/api/gallery';
import { useAuthPrompt, useAuthSession } from '@kernel/front/state/AuthContext';
import {
  consumeOnboardingReplay,
  isLocalOnboardingCompleted,
  isOnboardingDeferredForProductShare,
  markLocalOnboardingCompleted,
  subscribeOnboardingGate,
  syncProductShareOnboardingDeferral,
  useOnboardingDeferredForProductShare,
  useOnboardingReplayRequested,
} from '@kernel/front/state/onboardingGate';
import {
  getSplashResumePath,
  shouldPlaySplashEntry,
  useSplashEntryActive,
} from '@kernel/front/state/splashEntryGate';
import { adminPath } from '@kernel/front/utils/adminRoute';
import { stripLangPrefix } from '@kernel/front/config/i18nRoutes';
import { buildOnboardingSlides } from './onboardingSlides';

const OnboardingOverlay = lazy(() =>
  import('./OnboardingOverlay').then((m) => ({ default: m.OnboardingOverlay })),
);

const BLOCKED_PATHS = new Set([
  '/',
  '/checkout/return',
  '/auth/apple-return',
  '/auth/facebook-return',
  '/auth/facebook-data-deletion',
]);

function isBlockedPath(pathname: string): boolean {
  if (pathname.startsWith(adminPath())) return true;
  const { rest } = stripLangPrefix(pathname);
  if (BLOCKED_PATHS.has(rest)) return true;
  // Claim splash and receiver landing must not be covered by the tour.
  return rest.startsWith('/gift/');
}

type AccountPrefState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Decides when to show the post-splash onboarding overlay and persists
 * completion for guests (localStorage) and signed-in accounts (API).
 */
export function OnboardingController() {
  const { t, lang } = useLang();
  const location = useLocation();
  const splashActive = useSplashEntryActive();
  const splashOwed = shouldPlaySplashEntry();
  const { status, isImpersonating, authedRequest } = useAuthSession();
  const { authPromptMode } = useAuthPrompt();
  const replayRequested = useOnboardingReplayRequested();
  const shareDeferActive = useOnboardingDeferredForProductShare();

  const [open, setOpen] = useState(false);
  const [cartRules, setCartRules] = useState<PublicCartRule[] | null | undefined>(undefined);
  const [accountCompleted, setAccountCompleted] = useState<boolean | null>(null);
  const [accountPrefState, setAccountPrefState] = useState<AccountPrefState>('idle');
  const [gateTick, setGateTick] = useState(0);
  const syncedAccountRef = useRef<string | null>(null);
  const completingRef = useRef(false);

  useEffect(() => subscribeOnboardingGate(() => setGateTick((n) => n + 1)), []);

  // Splash may stash `/gallery?product=` before React mounts; honour that so
  // the tour does not open on the splash exit into the shared set.
  useEffect(() => {
    const resume = getSplashResumePath();
    if (resume && /(?:\?|&)product=/.test(resume)) {
      try {
        const url = new URL(resume, window.location.origin);
        syncProductShareOnboardingDeferral(url.pathname, url.search);
      } catch {
        // Malformed resume — live location sync below still covers the land.
      }
    }
  }, []);

  useEffect(() => {
    syncProductShareOnboardingDeferral(location.pathname, location.search);
  }, [location.pathname, location.search]);

  const localCompleted = isLocalOnboardingCompleted();
  void gateTick;
  void shareDeferActive;

  const pathBlocked = isBlockedPath(location.pathname);
  const authSettled = status !== 'loading';
  // Prerendered locale dicts lose function formatters until the real chunk
  // upgrades LanguageContext — opening earlier throws in stepAria / deals.
  const dictionaryReady = typeof t.onboarding.stepAria === 'function';
  const eligibleSurface =
    !splashActive && !splashOwed && authSettled && !pathBlocked && !isImpersonating && dictionaryReady;

  // Prefetch cart rules once the surface is eligible (or a replay is pending).
  useEffect(() => {
    if (!eligibleSurface && !replayRequested) return;
    if (cartRules !== undefined) return;
    let cancelled = false;
    void fetchCartRules(lang)
      .then((rules) => {
        if (!cancelled) setCartRules(rules);
      })
      .catch(() => {
        if (!cancelled) setCartRules(null);
      });
    return () => {
      cancelled = true;
    };
  }, [eligibleSurface, replayRequested, cartRules, lang]);

  // Read / sync account preference when signed in.
  useEffect(() => {
    if (status !== 'authenticated' || isImpersonating) {
      setAccountCompleted(null);
      setAccountPrefState('idle');
      syncedAccountRef.current = null;
      return;
    }

    let cancelled = false;
    setAccountPrefState('loading');

    void (async () => {
      try {
        if (localCompleted) {
          // Guest dismissal on this browser wins: push onto the account.
          if (syncedAccountRef.current !== 'local-sync') {
            await authedRequest((token) => accountApi.updateOnboardingPreference(token));
            if (cancelled) return;
            syncedAccountRef.current = 'local-sync';
          }
          if (!cancelled) {
            setAccountCompleted(true);
            setAccountPrefState('ready');
          }
          return;
        }

        const result = await authedRequest((token) => accountApi.getOnboardingPreference(token));
        if (cancelled) return;
        setAccountCompleted(result.completed === true);
        setAccountPrefState('ready');
        if (result.completed) markLocalOnboardingCompleted();
      } catch {
        if (!cancelled) {
          setAccountCompleted(null);
          setAccountPrefState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, isImpersonating, authedRequest, localCompleted]);

  // Auto-open decision.
  useEffect(() => {
    if (open) return;
    // Wait for cart-rules attempt so slide 2 can include live amounts.
    if (cartRules === undefined) return;
    // Lazy onboarding can finish after the customer already opened sign-in.
    // The overlay sits above the auth modal (z-index) and would swallow it.
    if (authPromptMode) return;
    if (replayRequested) {
      if (consumeOnboardingReplay()) setOpen(true);
      return;
    }
    if (!eligibleSurface) return;
    if (isOnboardingDeferredForProductShare()) return;
    if (localCompleted) return;
    if (status === 'authenticated') {
      if (accountPrefState === 'loading') return;
      if (accountPrefState === 'ready' && accountCompleted) return;
      // error: fall through and show based on local flag only
    }
    setOpen(true);
  }, [
    open,
    authPromptMode,
    replayRequested,
    eligibleSurface,
    localCompleted,
    status,
    accountPrefState,
    accountCompleted,
    cartRules,
    shareDeferActive,
  ]);

  const slides = useMemo(
    () =>
      buildOnboardingSlides({
        copy: t.onboarding,
        cartRules: cartRules === undefined ? null : cartRules,
      }),
    [t.onboarding, cartRules],
  );

  const handleComplete = useCallback(() => {
    if (completingRef.current) return;
    completingRef.current = true;
    markLocalOnboardingCompleted();
    setOpen(false);
    if (status === 'authenticated' && !isImpersonating) {
      void authedRequest((token) => accountApi.updateOnboardingPreference(token)).catch(() => {
        // Local mark still prevents re-show in this browser.
      });
    }
    // Allow a later replay to open again in this session.
    completingRef.current = false;
  }, [status, isImpersonating, authedRequest]);

  if (!open || slides.length === 0) return null;

  return (
    <Suspense fallback={null}>
      <OnboardingOverlay slides={slides} onComplete={handleComplete} />
    </Suspense>
  );
}
