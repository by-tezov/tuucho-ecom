/**
 * Cold-load splash once per document/tab load — **any** URL (refresh,
 * bookmark, typed address). Soft in-app navigations never remount this
 * module, so `completed` stays true and the intro does not replay.
 *
 * Deep links are rewritten to `/` before React mounts
 * (`prepareSplashColdEntry`); the intended path is frozen for this load and
 * SplashEntry resumes it after motion. Route guards (`RequireAuth`, etc.)
 * still run on the resumed URL.
 *
 * One exception: a phone-sized cold load of `/home` whose referrer is a
 * search engine resumes the gallery (same language prefix). A typed address,
 * a bookmark, desktop, and an in-app Accueil tap stay on `/home`.
 *
 * Cold loads that are returns from a payment or authentication provider are
 * deliberately exempt. The browser genuinely left and came back, but the
 * customer never went anywhere — they are waiting on a result, not arriving
 * at the site. Opening `/gift/:token` with no remembered shop page is also
 * exempt so the priced splash gallery cannot flash before the lookbook.
 * Opening `/gift/giver/:token` is exempt for the same reason: the claim
 * splash must create or attach the giver session and land on `/cart`.
 * Parking that URL behind `/` and losing the resume sends an anonymous
 * visitor to Accueil/gallery instead. That visit also clears a leftover
 * receiver origin lock so Marc is not stuck behind Julie’s 2-hour block
 * after opening her URL by mistake. A later refresh of a real shop URL
 * (cart, gallery, product) while the gift lock is live plays splash and
 * resumes that URL.
 *
 * `active` is true while the motion is on screen so Layout chrome can go
 * inert (header actions disabled).
 */

import { useSyncExternalStore } from 'react';
import { shopConfig } from '../config/env';
import { GALLERY_PATH, HOME_PATH } from '../config/paths';
import { DEFAULT_LANG, localizedPath, stripLangPrefix } from '../config/i18nRoutes';
import {
  discardStaleRestoredGiftSession,
  giftReceiverTokenFromPath,
  giftShopResumePath,
  isGiftGiverPath,
  isGiftReceiverBlockedPath,
  readGiftLockSession,
  readGiftOriginBlock,
  releaseReceiverLockIfGiverPath,
  shouldBindGiftUrlToken,
} from './giftLockSession';
import { isMobileBackViewport } from '../utils/mobileBackNavigation';
import { galleryPathForSearchEngineHome } from '../utils/searchHomeLanding';
import { takeSessionKey } from '../utils/storageMigrate';

const RESUME_STORAGE_KEY = 'psn-splash-resume-v1';
const LEGACY_RESUME_STORAGE_KEY = 'pamsurin.splashResume';
const RESUME_HISTORY_KEY = 'tuuchoSplashResume';

/** Stripe's `return_url` for redirect-based payment (PayPal, some banks'
 * 3DS) — see CartCheckoutSection's confirmPayPalPayment. */
const PAYMENT_RETURN_PATH = '/checkout/return';
/** Apple posts to this fixed Return URL before the PHP bridge hands control
 * back to the SPA. It must load directly so the intro does not replay while
 * the callback is finishing authentication. */
const APPLE_RETURN_PATH = '/auth/apple-return';
/** What Stripe appends when it sends the browser back. `setup_intent*`
 * covers AddCardModal, whose return_url is the ordinary
 * /account/payment-methods page and so can't be recognised by path. */
const PAYMENT_RETURN_PARAMS = [
  'payment_intent',
  'payment_intent_client_secret',
  'setup_intent',
  'setup_intent_client_secret',
  'redirect_status',
];

/** Strip the deploy-only preprod router basename from a window pathname so
 * splash/payment logic can compare app routes (`/gallery`, `/`) unchanged. */
export function appPathnameFromWindow(pathname = window.location.pathname): string {
  const basename = shopConfig.routerBasename;
  if (!basename) return pathname;
  if (pathname === basename || pathname === `${basename}/`) return '/';
  if (pathname.startsWith(`${basename}/`)) {
    const rest = pathname.slice(basename.length);
    return rest.length === 0 ? '/' : rest;
  }
  return pathname;
}

/** Prefixed URL path for history.replaceState under a gated preprod base. */
function windowPathFromAppPath(appPath: string): string {
  const basename = shopConfig.routerBasename;
  if (!basename) return appPath;
  if (appPath === '/') return `${basename}/`;
  return `${basename}${appPath.startsWith('/') ? appPath : `/${appPath}`}`;
}
/**
 * Whether this document load is the customer landing back from a payment
 * provider. Technically a cold load — the browser really did leave the site
 * and come back — but not a *visit*: they are mid-checkout and waiting to
 * learn whether their money went through. Replaying the intro there reads
 * as the order having been lost, and it delays the one screen they are
 * waiting for.
 */
function isPaymentProviderReturn(pathname: string, search: string): boolean {
  if (pathname === PAYMENT_RETURN_PATH) return true;
  const params = new URLSearchParams(search);
  return PAYMENT_RETURN_PARAMS.some((name) => params.has(name));
}

/** Every browser document load is eligible until the splash finishes. */
const eligibleThisDocumentLoad = typeof window !== 'undefined';

let completed = false;
let active = false;
/** Captured deep link for this document load (`null` = cold bare `/`). */
let resumeMemo: string | null | undefined;
/**
 * Final post-splash navigation target for the intro that is playing (or just
 * finished) on this document load. Set as soon as the cold URL is known so
 * it cannot flip to the viewport default when `completed` becomes true.
 */
let exitPathForThisSplash: string | undefined;
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) listener();
}

/** True until the splash finishes (or this environment never runs one). */
export function shouldPlaySplashEntry(): boolean {
  return eligibleThisDocumentLoad && !completed;
}

export function markSplashEntryCompleted(): void {
  completed = true;
  clearStoredResume();
}

export function setSplashEntryActive(next: boolean): void {
  if (active === next) return;
  active = next;
  publish();
}

function getSplashEntryActive(): boolean {
  return active;
}

function subscribeSplashEntryActive(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Live “splash is the page body” flag for header/footer inert chrome. */
export function useSplashEntryActive(): boolean {
  return useSyncExternalStore(subscribeSplashEntryActive, getSplashEntryActive, () => false);
}

/** Default post-splash / anonymous-auth landing by viewport (cold `/` only). */
export function defaultSplashDestination(isDesktop: boolean): string {
  return isDesktop ? HOME_PATH : '/gallery';
}

/** Same-origin app path only (pathname + search + hash). Rejects bare `/`. */
function isSafeSplashResumePath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://invalid.local';
    const url = new URL(path, origin);
    if (url.origin !== origin) return false;
    if (url.pathname === '/' && url.search === '' && url.hash === '') return false;
    return true;
  } catch {
    return false;
  }
}

function clearStoredResume(): void {
  try {
    sessionStorage.removeItem(RESUME_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_RESUME_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function readHistoryResume(): string | null {
  if (typeof window === 'undefined') return null;
  const state = window.history.state;
  if (!state || typeof state !== 'object') return null;
  const raw = (state as Record<string, unknown>)[RESUME_HISTORY_KEY];
  return typeof raw === 'string' && isSafeSplashResumePath(raw) ? raw : null;
}

function stashResumePath(path: string): void {
  if (!isSafeSplashResumePath(path)) return;
  resumeMemo = path;
  exitPathForThisSplash = path;
  try {
    sessionStorage.setItem(RESUME_STORAGE_KEY, path);
    sessionStorage.removeItem(LEGACY_RESUME_STORAGE_KEY);
  } catch {
    // Private mode / quota — module memo / history.state still hold the path.
  }
}

/**
 * Deep-link target for this document load (stable across StrictMode remounts).
 * `null` when the cold entry was bare `/`.
 */
export function getSplashResumePath(): string | null {
  if (resumeMemo !== undefined) return resumeMemo;
  const fromHistory = readHistoryResume();
  if (fromHistory) {
    resumeMemo = fromHistory;
    exitPathForThisSplash = fromHistory;
    return resumeMemo;
  }
  try {
    const raw = takeSessionKey(RESUME_STORAGE_KEY, LEGACY_RESUME_STORAGE_KEY);
    clearStoredResume();
    resumeMemo = raw && isSafeSplashResumePath(raw) ? raw : null;
    if (resumeMemo) exitPathForThisSplash = resumeMemo;
  } catch {
    resumeMemo = null;
  }
  return resumeMemo;
}

/**
 * Where SplashEntry must navigate after the intro on this document load.
 * Freezes on first call while the splash is owed so completion cannot
 * replace a deep link with Accueil/gallery defaults.
 */
export function resolveSplashExitPath(isDesktop: boolean): string {
  if (exitPathForThisSplash !== undefined) return exitPathForThisSplash;
  if (!shouldPlaySplashEntry()) {
    return defaultSplashDestination(isDesktop);
  }
  exitPathForThisSplash = getSplashResumePath() ?? defaultSplashDestination(isDesktop);
  return exitPathForThisSplash;
}

/**
 * Override the post-splash destination while the intro is still owed (e.g.
 * a remembered admin session should land on `/admin` instead of Accueil).
 * No-op once the splash has finished for this document load.
 */
export function preferSplashExitPath(path: string): void {
  if (!shouldPlaySplashEntry()) return;
  if (!path.startsWith('/') || path.startsWith('//')) return;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://invalid.local';
    if (new URL(path, origin).origin !== origin) return;
  } catch {
    return;
  }
  exitPathForThisSplash = path;
  resumeMemo = path;
}

/** Search-engine `/home` on a phone resumes the gallery; every other cold
 * URL resumes exactly as opened, including its query and hash. */
function resumePathForColdLoad(pathname: string, search: string, hash: string): string {
  const gallery = galleryPathForSearchEngineHome({
    pathname,
    referrer: typeof document !== 'undefined' ? document.referrer : '',
    mobile: isMobileBackViewport(),
    followLocked: Boolean(readGiftLockSession()?.followLocked),
  });
  return gallery ?? `${pathname}${search}${hash}`;
}

function rewriteSplashToRoot(resume: string): void {
  stashResumePath(resume);
  const prev =
    window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as Record<string, unknown>)
      : {};
  // Keep the address bar on `/` during splash — rewriting is cosmetic for
  // history state, not a path-gate workaround.
  window.history.replaceState({ ...prev, [RESUME_HISTORY_KEY]: resume }, '', windowPathFromAppPath('/'));
}

/**
 * Before React mounts: if this cold load is not already `/`, remember **any**
 * intended URL (gallery, product, account, legal, …) and replace the history
 * entry with `/` so the splash owns first paint.
 */
export function prepareSplashColdEntry(): void {
  if (typeof window === 'undefined' || completed) return;
  discardStaleRestoredGiftSession();
  const { search, hash } = window.location;
  const pathname = appPathnameFromWindow();
  // Coming back from PayPal/Stripe: retire the splash for this load instead
  // of playing it. Marking it completed (rather than just skipping the
  // rewrite) is what also stands Layout's in-app net down, so the URL is
  // left exactly as the provider wrote it — its query params are the whole
  // payload CheckoutReturnPage needs to confirm the payment.
  if (isPaymentProviderReturn(pathname, search)) {
    markSplashEntryCompleted();
    return;
  }
  if (pathname === APPLE_RETURN_PATH) {
    markSplashEntryCompleted();
    return;
  }
  // First open of the email link: skip splash so the priced gallery cannot
  // flash. After confirm, skip splash again and let GiftReceiverApp open
  // the follow order. A later `/gift/:token` load with a remembered shop
  // page while still selecting plays splash and resumes that page.
  const pathToken = giftReceiverTokenFromPath(pathname);
  if (pathToken) {
    if (!shouldBindGiftUrlToken(pathToken)) {
      const { lang } = stripLangPrefix(pathname);
      const dest = lang ? `/${lang}` : '/';
      const prev =
        window.history.state && typeof window.history.state === 'object'
          ? (window.history.state as Record<string, unknown>)
          : {};
      window.history.replaceState({ ...prev }, '', windowPathFromAppPath(dest));
      markSplashEntryCompleted();
      return;
    }
    const lock = readGiftLockSession();
    if (lock?.receiverToken === pathToken && lock.followLocked) {
      markSplashEntryCompleted();
      return;
    }
    const resume = lock?.receiverToken === pathToken ? giftShopResumePath() : null;
    if (resume) {
      rewriteSplashToRoot(resume);
      return;
    }
    markSplashEntryCompleted();
    return;
  }
  // Giver email CTA: stay on this URL so GiftGiverPage can create/attach
  // the account. Splash rewrite + a lost resume lands on gallery as guest.
  // Also drop a leftover Julie origin lock in this browser.
  if (isGiftGiverPath(pathname)) {
    releaseReceiverLockIfGiverPath(pathname);
    markSplashEntryCompleted();
    return;
  }
  // Julie is already selecting: `/gift` is the create-offer page and must
  // not replace her lock with a blank form. Resume the lookbook (or the
  // follow order after confirm) the same way in-app navigation does.
  const liveLock = readGiftLockSession();
  if (liveLock && isGiftReceiverBlockedPath(pathname)) {
    const { lang } = stripLangPrefix(pathname);
    rewriteSplashToRoot(
      localizedPath(liveLock.followLocked ? HOME_PATH : GALLERY_PATH, lang ?? DEFAULT_LANG),
    );
    return;
  }
  // Another tab already opened a gift: do not play the priced splash or
  // land on the shop. Layout shows the “open the email link” page.
  if (readGiftLockSession() == null && readGiftOriginBlock() != null) {
    markSplashEntryCompleted();
    return;
  }
  if (pathname === '/') {
    // Drop a leftover resume from an earlier load in this tab.
    clearStoredResume();
    resumeMemo = null;
    return;
  }
  rewriteSplashToRoot(resumePathForColdLoad(pathname, search, hash));
}

/**
 * In-app safety net when a cold deep link somehow still renders under
 * BrowserRouter before rewrite (or tests without `prepareSplashColdEntry`).
 */
export function captureSplashResume(pathname: string, search: string, hash: string): void {
  if (pathname === '/') return;
  stashResumePath(resumePathForColdLoad(pathname, search, hash));
}
