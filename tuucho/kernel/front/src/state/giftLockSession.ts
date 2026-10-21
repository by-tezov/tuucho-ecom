import { stripLangPrefix, localizedPath } from '../config/i18nRoutes';
import type { Lang } from '../assets/i18n';
import { shopConfig } from '../config/env';
import { GIFT_RECEIVER_ISOLATED_KEY } from '../api/session/giftPinSession';

/** Origin-wide priced-shop block. Payload is only `{ expiresAtMs }` — never tokens. */
export const GIFT_LOCK_STORAGE_KEY = 'psn-gift-lock-v1';
/** Tab-scoped capability (receiver + lock tokens + last shop path). */
export const GIFT_LOCK_SESSION_STORAGE_KEY = 'psn-gift-lock-session-v1';

export interface GiftLockSession {
  receiverToken: string;
  lockToken: string;
  expiresAtMs: number;
  /** Last real shop path while this tab’s lock was live (`/fr/cart`, …). Refresh
   * of `/gift/:token` and splash resume use it so Julie lands back on the
   * page she was on, not the gift landing gallery. After confirm, opening
   * the gift link always lands on the follow order (`/cart`) instead. */
  shopPath?: string;
  /** True after Julie confirms. Opening `/gift/:token` goes to the follow
   * order, not the gallery, even if `shopPath` is a browse page. */
  followLocked?: boolean;
  /** The gifter's own choice on `/gift/create`, carried over from `GiftSummary`.
   * Gates the origin-wide block below: with prices visible there is nothing
   * to protect Julie from seeing, so leaving the shop must not lock her out. */
  hidePrices?: boolean;
  /** Written on mint, navigation, heartbeat, and pagehide. Chrome/Firefox
   * restore `sessionStorage` with the tab; a stale value means this is a
   * restarted browser, not a refresh. */
  lastAliveAtMs?: number;
}

/** Refresh unloads then loads within this window. A restarted browser is slower. */
const GIFT_TAB_RESUME_GRACE_MS = 10_000;
export const GIFT_TAB_ALIVE_HEARTBEAT_MS = 4_000;

export interface GiftOriginBlock {
  expiresAtMs: number;
}

const listeners = new Set<() => void>();
let discardedStaleThisDocument = false;
let restoredStaleGiftTab = false;
let aliveGuardInstalled = false;

function notify(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key === GIFT_LOCK_STORAGE_KEY) {
    // Another tab wiped the origin block (giver espace cadeau, logout, expiry).
    // Drop this tab’s capability too so Marc is not stuck in Julie chrome.
    if (event.newValue == null && typeof window !== 'undefined') {
      window.sessionStorage.removeItem(GIFT_LOCK_SESSION_STORAGE_KEY);
    }
    notify();
    return;
  }
  if (event.key === GIFT_LOCK_SESSION_STORAGE_KEY) {
    notify();
  }
}

export function subscribeGiftLock(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

/** Strip leftover capability tokens from origin storage (older builds). */
function migrateLegacyOriginLock(): void {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(GIFT_LOCK_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as GiftLockSession;
    if (!parsed?.receiverToken && !parsed?.lockToken) return;
    const expiresAtMs = typeof parsed.expiresAtMs === 'number' ? parsed.expiresAtMs : 0;
    if (expiresAtMs > Date.now()) {
      window.localStorage.setItem(GIFT_LOCK_STORAGE_KEY, JSON.stringify({ expiresAtMs }));
    } else {
      window.localStorage.removeItem(GIFT_LOCK_STORAGE_KEY);
    }
  } catch {
    window.localStorage.removeItem(GIFT_LOCK_STORAGE_KEY);
  }
}

export function readGiftOriginBlock(now = Date.now()): GiftOriginBlock | null {
  if (typeof window === 'undefined') return null;
  migrateLegacyOriginLock();
  const raw = window.localStorage.getItem(GIFT_LOCK_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GiftOriginBlock;
    if (typeof parsed?.expiresAtMs !== 'number') {
      window.localStorage.removeItem(GIFT_LOCK_STORAGE_KEY);
      return null;
    }
    if (parsed.expiresAtMs <= now) {
      window.localStorage.removeItem(GIFT_LOCK_STORAGE_KEY);
      return null;
    }
    return { expiresAtMs: parsed.expiresAtMs };
  } catch {
    window.localStorage.removeItem(GIFT_LOCK_STORAGE_KEY);
    return null;
  }
}

function sessionIsFreshContinuation(session: GiftLockSession, now: number): boolean {
  return typeof session.lastAliveAtMs === 'number' && now - session.lastAliveAtMs <= GIFT_TAB_RESUME_GRACE_MS;
}

function navigationEntry(): PerformanceNavigationTiming | undefined {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return undefined;
  }
  return performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
}

function giftLinkWasOpenedThisDocument(): boolean {
  const nav = navigationEntry();
  return !nav || nav.type === 'navigate';
}

/** Typed URL / Playwright `goto` / clicked full load. Restored tabs are `reload`. */
function sameTabDocumentNavigation(): boolean {
  return navigationEntry()?.type === 'navigate';
}

/** Drop a Chrome/Firefox-restored tab session. Origin expiry stays. */
export function discardStaleRestoredGiftSession(now = Date.now()): void {
  if (typeof window === 'undefined') return;
  if (discardedStaleThisDocument) return;
  discardedStaleThisDocument = true;
  const raw = window.sessionStorage.getItem(GIFT_LOCK_SESSION_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as GiftLockSession;
    const unexpired =
      Boolean(parsed?.receiverToken) &&
      Boolean(parsed.lockToken) &&
      typeof parsed.expiresAtMs === 'number' &&
      parsed.expiresAtMs > now;
    if (unexpired && (sessionIsFreshContinuation(parsed, now) || sameTabDocumentNavigation())) {
      return;
    }
    if (parsed?.receiverToken || parsed?.lockToken) {
      restoredStaleGiftTab = true;
    }
  } catch {
    restoredStaleGiftTab = true;
  }
  window.sessionStorage.removeItem(GIFT_LOCK_SESSION_STORAGE_KEY);
}

/** True when this document may mint or keep a gift from `/gift/:token`. */
export function shouldBindGiftUrlToken(receiverToken: string, now = Date.now()): boolean {
  if (!receiverToken) return false;
  discardStaleRestoredGiftSession(now);
  if (restoredStaleGiftTab) return false;
  const lock = readGiftLockSession(now);
  if (lock?.receiverToken === receiverToken) return true;
  if (lock) return false;
  return giftLinkWasOpenedThisDocument();
}

export function readGiftLockSession(now = Date.now()): GiftLockSession | null {
  if (typeof window === 'undefined') return null;
  discardStaleRestoredGiftSession(now);
  migrateLegacyOriginLock();
  const raw = window.sessionStorage.getItem(GIFT_LOCK_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GiftLockSession;
    if (!parsed?.receiverToken || !parsed.lockToken || typeof parsed.expiresAtMs !== 'number') {
      window.sessionStorage.removeItem(GIFT_LOCK_SESSION_STORAGE_KEY);
      return null;
    }
    if (parsed.expiresAtMs <= now) {
      window.sessionStorage.removeItem(GIFT_LOCK_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(GIFT_LOCK_SESSION_STORAGE_KEY);
    return null;
  }
}

/** This tab was opened from the gifts panel or from account impersonation. */
export function isAdminOpenedShopTab(): boolean {
  try {
    return sessionStorage.getItem(GIFT_RECEIVER_ISOLATED_KEY) === '1';
  } catch {
    return false;
  }
}

/** The origin-wide block (`GIFT_LOCK_STORAGE_KEY`) only makes sense when the
 * gifter chose to hide prices from Julie: it is what stops her from leaving
 * the gift tab and shopping at list price in another one. When prices are
 * visible there is nothing to protect, so leaving must not lock her out.
 * A tab opened from the gifts panel must not publish that block: the
 * administrator keeps the rest of the browser. */
export function writeGiftLockSession(session: GiftLockSession): void {
  if (typeof window === 'undefined') return;
  const payload: GiftLockSession = { ...session, lastAliveAtMs: Date.now() };
  window.sessionStorage.setItem(GIFT_LOCK_SESSION_STORAGE_KEY, JSON.stringify(payload));
  if (isAdminOpenedShopTab()) {
    window.localStorage.removeItem(GIFT_LOCK_STORAGE_KEY);
  } else if (payload.hidePrices !== false) {
    window.localStorage.setItem(GIFT_LOCK_STORAGE_KEY, JSON.stringify({ expiresAtMs: payload.expiresAtMs }));
  } else {
    window.localStorage.removeItem(GIFT_LOCK_STORAGE_KEY);
  }
  notify();
}

export function touchGiftLockAlive(now = Date.now()): void {
  if (typeof window === 'undefined') return;
  const raw = window.sessionStorage.getItem(GIFT_LOCK_SESSION_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as GiftLockSession;
    if (!parsed?.receiverToken || !parsed.lockToken || typeof parsed.expiresAtMs !== 'number') return;
    if (parsed.expiresAtMs <= now) return;
    window.sessionStorage.setItem(
      GIFT_LOCK_SESSION_STORAGE_KEY,
      JSON.stringify({ ...parsed, lastAliveAtMs: now }),
    );
  } catch {
    // ignore
  }
}

export function installGiftLockAliveGuard(): void {
  if (typeof window === 'undefined' || aliveGuardInstalled) return;
  aliveGuardInstalled = true;
  const onHide = () => touchGiftLockAlive();
  window.addEventListener('pagehide', onHide);
  window.addEventListener('beforeunload', onHide);
}

export function clearGiftLockSession(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(GIFT_LOCK_SESSION_STORAGE_KEY);
  window.localStorage.removeItem(GIFT_LOCK_STORAGE_KEY);
  discardedStaleThisDocument = false;
  restoredStaleGiftTab = false;
  notify();
}

export function isGiftGiverPath(pathname: string): boolean {
  const rest = stripLangPrefix(pathname).rest;
  return rest.startsWith('/gift/giver/');
}

/** Opening Marc’s `/gift/giver/:token` ends a leftover Julie lock in this
 *  browser (he may have opened her URL by mistake). Other tabs drop their
 *  tab session when the origin key is removed (`storage` event). */
export function releaseReceiverLockIfGiverPath(pathname: string): void {
  if (typeof window === 'undefined') return;
  if (!isGiftGiverPath(pathname)) return;
  const hadOrigin = window.localStorage.getItem(GIFT_LOCK_STORAGE_KEY) != null;
  const hadTab = window.sessionStorage.getItem(GIFT_LOCK_SESSION_STORAGE_KEY) != null;
  if (!hadOrigin && !hadTab) return;
  clearGiftLockSession();
}

const GIFT_RESERVED_TOKENS = new Set(['giver', 'mine', 'offers', 'settings']);

/** One-segment `/gift/:token` — not giver/admin gift routes. */
export function giftReceiverTokenFromPath(pathname: string): string | null {
  const rest = stripLangPrefix(pathname).rest;
  const match = /^\/gift\/([^/]+)$/.exec(rest);
  if (!match) return null;
  const token = match[1];
  if (!token || GIFT_RESERVED_TOKENS.has(token)) return null;
  return token;
}

/** Account, auth, orders, create-offer, checkout — not the lookbook shop.
 * The Mondial Relay parcel-shop picker is the same cart tool guests use; it
 * is not account chrome. */
export function isGiftReceiverBlockedPath(pathname: string): boolean {
  const rest = stripLangPrefix(pathname).rest;
  if (rest === '/account/addresses/mondial-relay') return false;
  return (
    rest.startsWith('/account') ||
    rest === '/login' ||
    rest === '/register' ||
    rest === '/forgot-password' ||
    rest.startsWith('/reset-password') ||
    rest.startsWith('/orders') ||
    rest === '/gift' ||
    rest.startsWith('/checkout')
  );
}

export function routerHref(routerPath: string): string {
  const base = shopConfig.routerBasename.replace(/\/$/, '');
  return `${base}${routerPath}` || '/';
}

export function giftReceiverVisibleHref(receiverToken: string, lang: Lang): string {
  return routerHref(localizedPath(`/gift/${receiverToken}`, lang));
}

function stripRouterBasename(pathname: string): string {
  const basename = shopConfig.routerBasename;
  if (!basename) return pathname;
  if (pathname === basename || pathname === `${basename}/`) return '/';
  if (pathname.startsWith(`${basename}/`)) {
    const rest = pathname.slice(basename.length);
    return rest.length === 0 ? '/' : rest;
  }
  return pathname;
}

function historyMaskedFromRouterPath(routerPath: string): { pathname: string; search: string; hash: string } {
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://invalid.local';
    const parsed = new URL(routerPath, origin);
    return {
      pathname: routerHref(parsed.pathname),
      search: parsed.search,
      hash: parsed.hash,
    };
  } catch {
    return { pathname: routerHref(routerPath), search: '', hash: '' };
  }
}

/** Real React Router path stored on the current history entry while the
 * address bar is overwritten to `/gift/:token`. Back/forward must read this,
 * not the cosmetic URL. React Router 7 also reads `masked` for the same
 * purpose; keep both so overlay/lightbox fields are never the only copy. */
export const GIFT_HISTORY_ROUTER_PATH_KEY = 'pamGiftRouterPath';

export function withGiftRouterPath(historyState: unknown, routerPath: string): Record<string, unknown> {
  const base =
    historyState && typeof historyState === 'object' ? { ...(historyState as Record<string, unknown>) } : {};
  return {
    ...base,
    [GIFT_HISTORY_ROUTER_PATH_KEY]: routerPath,
    masked: historyMaskedFromRouterPath(routerPath),
  };
}

export function giftRouterPathFromHistoryState(historyState: unknown): string | null {
  if (!historyState || typeof historyState !== 'object') return null;
  const path = (historyState as Record<string, unknown>)[GIFT_HISTORY_ROUTER_PATH_KEY];
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null;
  return path;
}

function maskedRouterPathFromHistoryState(historyState: unknown): string | null {
  if (!historyState || typeof historyState !== 'object') return null;
  const masked = (historyState as Record<string, unknown>).masked;
  if (!masked || typeof masked !== 'object') return null;
  const pathname = (masked as { pathname?: unknown }).pathname;
  if (typeof pathname !== 'string') return null;
  const search =
    typeof (masked as { search?: unknown }).search === 'string' ? (masked as { search: string }).search : '';
  const hash =
    typeof (masked as { hash?: unknown }).hash === 'string' ? (masked as { hash: string }).hash : '';
  return `${stripRouterBasename(pathname)}${search}${hash}`;
}

/**
 * On popstate the browser exposes the cosmetic `/gift/:token` URL. If React
 * Router's `masked` field already holds the real shop path, leave the bar
 * alone. Otherwise put the stamped router path back on the entry before
 * React Router reads `window.location`.
 */
export function restoreRealUrlFromGiftHistory(): boolean {
  if (typeof window === 'undefined') return false;
  if (!giftReceiverTokenFromPath(stripRouterBasename(window.location.pathname))) return false;
  const state = window.history.state;
  const real = giftRouterPathFromHistoryState(state);
  if (!real) return false;
  const realPathname = pathnameFromResume(real);
  if (!realPathname || giftReceiverTokenFromPath(realPathname)) return false;
  if (maskedRouterPathFromHistoryState(state) === real) return false;
  const target = routerHref(real);
  const visible = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (visible === target) return false;
  window.history.replaceState(withGiftRouterPath(state, real), '', target);
  return true;
}

function pathnameFromResume(path: string): string | null {
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://invalid.local';
    return new URL(path, origin).pathname;
  } catch {
    return null;
  }
}

/** Shop pages the lock may restore after a refresh or `/gift/:token` reopen. */
export function isGiftShopResumePath(path: string): boolean {
  const pathname = pathnameFromResume(path);
  if (!pathname) return false;
  const rest = stripLangPrefix(pathname).rest;
  if (rest === '/' || rest.startsWith('/admin') || rest.startsWith('/auth')) return false;
  if (giftReceiverTokenFromPath(pathname)) return false;
  if (isGiftGiverPath(pathname) || isGiftReceiverBlockedPath(pathname)) return false;
  return true;
}

export function giftShopResumePath(): string | null {
  const lock = readGiftLockSession();
  if (!lock?.shopPath || !isGiftShopResumePath(lock.shopPath)) return null;
  return lock.shopPath;
}

export function syncGiftLockFollowLocked(followLocked: boolean): void {
  const lock = readGiftLockSession();
  if (!lock) return;
  if (Boolean(lock.followLocked) === followLocked) return;
  writeGiftLockSession({ ...lock, followLocked });
}

export function rememberGiftShopPath(path: string): void {
  const lock = readGiftLockSession();
  if (!lock) return;
  if (!isGiftShopResumePath(path)) return;
  if (lock.shopPath === path) return;
  writeGiftLockSession({ ...lock, shopPath: path });
}

/** Keep the last shop page when a new lock token is minted for the same offer. */
export function preservedShopPathForToken(receiverToken: string): string | undefined {
  const lock = readGiftLockSession();
  if (lock?.receiverToken !== receiverToken) return undefined;
  return lock.shopPath && isGiftShopResumePath(lock.shopPath) ? lock.shopPath : undefined;
}
