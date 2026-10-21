import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { ApiError } from '../api/errors';
import {
  getGiftLockStatus,
  getReceiverSummary,
  startGiftLockSession,
  receiverFollowsOrder,
  unlockGiftPin,
  type GiftSummary,
} from '../api/gift';
import { adminPath } from '../utils/adminRoute';
import {
  clearGiftLockSession,
  GIFT_TAB_ALIVE_HEARTBEAT_MS,
  giftReceiverTokenFromPath,
  giftReceiverVisibleHref,
  isGiftGiverPath,
  releaseReceiverLockIfGiverPath,
  preservedShopPathForToken,
  rememberGiftShopPath,
  readGiftLockSession,
  restoreRealUrlFromGiftHistory,
  routerHref,
  shouldBindGiftUrlToken,
  subscribeGiftLock,
  syncGiftLockFollowLocked,
  touchGiftLockAlive,
  withGiftRouterPath,
  writeGiftLockSession,
  type GiftLockSession,
} from '../state/giftLockSession';
import { shouldPlaySplashEntry } from '../state/splashEntryGate';
import { clearGiftPinGrant } from '../api/session/giftPinSession';
import { GiftPinModal } from '../components/GiftPinModal';

export type GiftReceiverError = 'gone' | 'inactive' | 'load';

export interface GiftReceiverContextValue {
  active: boolean;
  ready: boolean;
  token: string | null;
  summary: GiftSummary | null;
  hidePrices: boolean;
  error: GiftReceiverError | null;
  pinRequired: boolean;
  requestPin: () => void;
  applySummary: (summary: GiftSummary) => void;
  refresh: () => Promise<void>;
  canMutate: boolean;
}

const GiftReceiverContext = createContext<GiftReceiverContextValue | null>(null);

const INACTIVE: GiftReceiverContextValue = {
  active: false,
  ready: true,
  token: null,
  summary: null,
  hidePrices: true,
  error: null,
  pinRequired: false,
  requestPin: () => undefined,
  applySummary: () => undefined,
  refresh: async () => undefined,
  canMutate: false,
};

function giftErrorFrom(error: unknown): GiftReceiverError {
  if (error instanceof ApiError && error.code === 'gift_gone') return 'gone';
  if (error instanceof ApiError && error.code === 'gift_inactive') return 'inactive';
  return 'load';
}

export function GiftReceiverProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  // Admin tree does not use gift lock/summary. Short-circuit so admin routes
  // never pay for gift lock subscriptions or PIN modal work.
  if (location.pathname.startsWith(adminPath())) {
    return <GiftReceiverContext.Provider value={INACTIVE}>{children}</GiftReceiverContext.Provider>;
  }
  return <GiftReceiverProviderActive>{children}</GiftReceiverProviderActive>;
}

function GiftReceiverProviderActive({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { lang, t } = useLang();
  const pathToken = giftReceiverTokenFromPath(location.pathname);
  const giverOrAdmin = isGiftGiverPath(location.pathname) || location.pathname.startsWith(adminPath());
  const [lock, setLock] = useState<GiftLockSession | null>(() =>
    typeof window === 'undefined' ? null : readGiftLockSession(),
  );
  const [summary, setSummary] = useState<GiftSummary | null>(null);
  const [error, setError] = useState<GiftReceiverError | null>(null);
  const [ready, setReady] = useState(() => pathToken == null && lock == null);
  const [pinNeeded, setPinNeeded] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const requestIdRef = useRef(0);
  const summaryTokenRef = useRef<string | null>(null);
  const mintedForRef = useRef<string | null>(null);

  useEffect(() => subscribeGiftLock(() => setLock(readGiftLockSession())), []);

  useLayoutEffect(() => {
    if (!isGiftGiverPath(location.pathname)) return;
    requestIdRef.current += 1;
    mintedForRef.current = null;
    summaryTokenRef.current = null;
    releaseReceiverLockIfGiverPath(location.pathname);
    setLock(readGiftLockSession());
    setSummary(null);
    setError(null);
    setReady(true);
  }, [location.pathname]);

  const honorPathToken = Boolean(pathToken && shouldBindGiftUrlToken(pathToken));
  const token = giverOrAdmin ? null : honorPathToken ? pathToken : (lock?.receiverToken ?? null);
  const active = token != null;

  const applySummary = useCallback((next: GiftSummary) => {
    setSummary(next);
    setError(null);
    syncGiftLockFollowLocked(receiverFollowsOrder(next.status));
  }, []);

  const bootstrap = useCallback(async (receiverToken: string, mintSession: boolean, signal?: AbortSignal) => {
    const requestId = ++requestIdRef.current;
    if (summaryTokenRef.current !== receiverToken) {
      setReady(false);
      setError(null);
    }
    try {
      const loaded = await getReceiverSummary(receiverToken, signal ? { signal } : undefined);
      if (signal?.aborted || requestIdRef.current !== requestId) return;
      if (mintSession) {
        const session = await startGiftLockSession(receiverToken);
        if (signal?.aborted || requestIdRef.current !== requestId) return;
        const shopPath = preservedShopPathForToken(receiverToken);
        writeGiftLockSession({
          receiverToken,
          lockToken: session.lockToken,
          expiresAtMs: new Date(session.expiresAt).getTime(),
          ...(shopPath ? { shopPath } : {}),
          followLocked: receiverFollowsOrder(loaded.status),
          hidePrices: loaded.hideReceiverPrices !== false,
        });
        setLock(readGiftLockSession());
      }
      summaryTokenRef.current = receiverToken;
      setSummary(loaded);
      setError(null);
      setPinNeeded(false);
      setPinModalOpen(false);
      syncGiftLockFollowLocked(receiverFollowsOrder(loaded.status));
    } catch (err) {
      if (signal?.aborted || requestIdRef.current !== requestId) return;
      const aborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');
      if (aborted) return;
      if (err instanceof ApiError && (err.code === 'gift_pin_required' || err.code === 'gift_pin_invalid')) {
        clearGiftPinGrant('receiver', receiverToken);
        setSummary(null);
        setError(null);
        setPinNeeded(true);
        setPinModalOpen(true);
        return;
      }
      summaryTokenRef.current = null;
      setSummary(null);
      setPinNeeded(false);
      setPinModalOpen(false);
      const current = readGiftLockSession();
      if (current?.receiverToken === receiverToken) clearGiftLockSession();
      setError(giftErrorFrom(err));
    } finally {
      if (!signal?.aborted && requestIdRef.current === requestId) setReady(true);
    }
  }, []);

  /** For a tab that's locked but sitting on a normal (non-gift) page: checks
   * the lock is still live using only the scoped lock token (never the
   * receiver token — see getGiftLockStatus), and releases it the moment the
   * gift is cancelled/expired/gone. Deliberately doesn't touch `summary` —
   * the receiver-only data it already holds from the initial visit stays as
   * is, and stops mattering the instant the lock clears anyway. */
  const revalidateLock = useCallback(async (lockToken: string, signal?: AbortSignal) => {
    try {
      const { status } = await getGiftLockStatus(lockToken);
      if (signal?.aborted) return;
      // Only this off-token-page check releases the lock on cancelled/
      // expired — the token-link page itself (applySummary/bootstrap/
      // refresh above) must keep showing the gift view regardless of
      // status, same as always, so followLocked is all those update.
      if (status === null || status === 'cancelled' || status === 'expired') {
        clearGiftLockSession();
      } else {
        syncGiftLockFollowLocked(receiverFollowsOrder(status));
      }
    } catch {
      // Transient failure (network blip, offline) — leave the lock as is
      // rather than kicking the visitor out on a fluke; the next landing
      // on a normal page tries again.
    } finally {
      if (!signal?.aborted) setReady(true);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const loaded = await getReceiverSummary(token);
      summaryTokenRef.current = token;
      setSummary(loaded);
      setError(null);
      syncGiftLockFollowLocked(receiverFollowsOrder(loaded.status));
    } catch (err) {
      setError(giftErrorFrom(err));
    }
  }, [token]);

  useEffect(() => {
    if (isGiftGiverPath(location.pathname)) {
      return;
    }
    if (giverOrAdmin) {
      setReady(true);
      return;
    }
    const ac = new AbortController();
    if (pathToken) {
      if (!shouldBindGiftUrlToken(pathToken)) {
        mintedForRef.current = null;
        setReady(true);
        return;
      }
      if (mintedForRef.current === pathToken && summaryTokenRef.current === pathToken) {
        setReady(true);
        return;
      }
      mintedForRef.current = pathToken;
      void bootstrap(pathToken, true, ac.signal);
      return () => ac.abort();
    }
    mintedForRef.current = null;
    if (lock?.lockToken) {
      // Full document loads (and any provider remount) keep the lock in
      // sessionStorage but reset React summary state. Reload it before the
      // shop can hide add-to-cart behind `canMutate` (status === selecting).
      // When summary is already warm (SPA navigations), only re-check the
      // scoped lock token so a cancel/expiry elsewhere releases the tab
      // without calling the receiver endpoint again.
      if (lock.receiverToken && summaryTokenRef.current !== lock.receiverToken) {
        void bootstrap(lock.receiverToken, false, ac.signal);
      } else {
        void revalidateLock(lock.lockToken, ac.signal);
      }
      return () => ac.abort();
    }
    requestIdRef.current += 1;
    summaryTokenRef.current = null;
    setSummary(null);
    setError(null);
    setReady(true);
  }, [
    bootstrap,
    giverOrAdmin,
    lock?.lockToken,
    lock?.receiverToken,
    location.pathname,
    pathToken,
    revalidateLock,
  ]);

  useEffect(() => {
    if (!lock) return;
    const wait = lock.expiresAtMs - Date.now();
    if (wait <= 0) {
      clearGiftLockSession();
      return;
    }
    const timer = window.setTimeout(() => clearGiftLockSession(), wait);
    return () => window.clearTimeout(timer);
  }, [lock]);

  useEffect(() => {
    if (!lock) return;
    touchGiftLockAlive();
    const timer = window.setInterval(() => touchGiftLockAlive(), GIFT_TAB_ALIVE_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [lock]);

  useEffect(() => {
    if (!lock || giverOrAdmin || pathToken) return;
    if (shouldPlaySplashEntry()) return;
    rememberGiftShopPath(`${location.pathname}${location.search}${location.hash}`);
  }, [giverOrAdmin, location.hash, location.pathname, location.search, lock, pathToken]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (!lock || giverOrAdmin) return;
    const onPopState = () => {
      if (shouldPlaySplashEntry()) return;
      restoreRealUrlFromGiftHistory();
    };
    window.addEventListener('popstate', onPopState, true);
    return () => window.removeEventListener('popstate', onPopState, true);
  }, [giverOrAdmin, lock]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (shouldPlaySplashEntry()) return;
    const historyState = window.history.state;
    const routerPath = `${location.pathname}${location.search}${location.hash}`;
    if (lock && !giverOrAdmin) {
      window.history.replaceState(
        withGiftRouterPath(historyState, routerPath),
        '',
        giftReceiverVisibleHref(lock.receiverToken, lang),
      );
      return;
    }
    const windowToken = giftReceiverTokenFromPath(window.location.pathname);
    if (windowToken && !pathToken) {
      window.history.replaceState(historyState, '', routerHref(routerPath));
    }
  }, [giverOrAdmin, lang, location.hash, location.pathname, location.search, lock, pathToken]);

  const value = useMemo<GiftReceiverContextValue>(
    () => ({
      active,
      ready: !active || ready,
      token,
      summary,
      hidePrices: active && summary?.hideReceiverPrices !== false,
      error,
      pinRequired: pinNeeded,
      requestPin: () => setPinModalOpen(true),
      applySummary,
      refresh,
      canMutate: Boolean(active && summary?.status === 'selecting'),
    }),
    [active, applySummary, error, pinNeeded, ready, refresh, summary, token],
  );

  return (
    <GiftReceiverContext.Provider value={value}>
      {children}
      {pinNeeded && pinModalOpen && token ? (
        <GiftPinModal
          loadingMessage={t.gift.receiverEnterLoading}
          onUnlock={async (pin) => {
            await unlockGiftPin('receiver', token, pin);
            await bootstrap(token, Boolean(pathToken && shouldBindGiftUrlToken(pathToken)));
          }}
          onClose={() => setPinModalOpen(false)}
        />
      ) : null}
    </GiftReceiverContext.Provider>
  );
}

export function useOptionalGiftReceiver(): GiftReceiverContextValue {
  return useContext(GiftReceiverContext) ?? INACTIVE;
}

export function useGiftReceiver(): GiftReceiverContextValue {
  const context = useContext(GiftReceiverContext);
  if (!context) throw new Error('useGiftReceiver must be used within GiftReceiverProvider');
  return context;
}
