import { GALLERY_PATH, HOME_PATH } from '../config/paths';

/** Mobile detail pages that deliberately hide MobileTabBar and expose their
 * own Retour links instead. They form one replaceable history slot: moving
 * between them must not bury the last tab-bar destination under a stack. */
const MOBILE_BACK_PAGES = new Set([
  '/home',
  '/sizes',
  '/capsules',
  '/pose',
  '/contact',
  '/about',
  '/account',
  '/account/addresses',
  '/account/payment-methods',
  '/account/loyalty',
  '/account/notifications',
]);

export function isMobileBackPage(pathname: string): boolean {
  return MOBILE_BACK_PAGES.has(pathname);
}

export function isMobileBackViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
}

export function shouldReplaceMobileBackPage(from: string, to: string): boolean {
  return isMobileBackViewport() && isMobileBackPage(from) && isMobileBackPage(to);
}

/** True when the document that linked here is this same origin. SPA
 * navigations do not update `document.referrer`, so this only describes the
 * page that opened this tab / full load — not later in-app moves. */
function isSameOriginReferrer(): boolean {
  if (typeof document === 'undefined' || !document.referrer) return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Whether Retour can `history.back()` without leaving Shop.
 * `history.length > 1` is not enough: a Google/Facebook landing still has a
 * previous entry. React Router's session `idx` counts in-app pushes; a
 * same-origin referrer covers a full load from another Shop page. */
export function canGoBackOnShop(): boolean {
  if (typeof window === 'undefined') return false;
  const state = window.history.state as { idx?: unknown } | null;
  if (state && typeof state.idx === 'number' && state.idx > 0) return true;
  return isSameOriginReferrer() && window.history.length > 1;
}

/** Where Retour lands when the previous site is not Shop (or this tab
 * has no prior in-app page). Mobile continues in the gallery; desktop
 * Accueil matches the other "nothing to resume" fallbacks. */
export function backFallbackPath(): string {
  return isMobileBackViewport() ? GALLERY_PATH : HOME_PATH;
}
