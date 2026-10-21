import { useEffect } from 'react';

/**
 * Locks page scroll while a modal is open. Deliberately not the common
 * "position: fixed; top: -scrollY" trick some scroll-lock implementations
 * use to fix iOS Safari's rubber-band bounce: that technique makes
 * window.scrollY report 0 the instant it runs (the page is taken out of
 * normal flow and the real scroll offset is faked via a negative `top`
 * instead). GalleryGrid's useWindowVirtualizer reads window.scrollY to
 * decide which rows stay mounted, so that fake "you're at the top now"
 * reading made it unmount whichever row a modal was just opened from,
 * wiping that row's just-set "open" state before React ever painted it —
 * every gallery modal shares this hook (lightbox, info, identifier, both
 * filter sheets), so this broke all of them, reliably, for any card far
 * enough from the top of the page. Plain `overflow: hidden` never touches
 * window.scrollY — nothing moves, further scrolling is just disabled.
 * The padding-right compensates for the scrollbar disappearing, which
 * would otherwise shift page content sideways by its width.
 *
 * Locks `<html>` as well as `<body>`: normally setting overflow on body
 * alone is enough (it propagates up to become the viewport's own scrolling
 * box per the CSS spec), but reset.css sets `overflow-x: hidden` directly
 * on `<html>` — a root element only delegates to body when its own
 * overflow is genuinely `visible` on both axes, so that rule silently
 * breaks the propagation and leaves `<html>` scrollable (a second,
 * page-level scrollbar) behind an "open" modal that only locked body.
 *
 * Overflow hidden is not enough on mobile: a finger drag on the backdrop
 * (or on a modal header) still pan-scrolls the page underneath. Non-passive
 * touchmove/wheel listeners cancel those gestures unless they belong to a
 * scrollable element inside the overlay, and cancel them at that element's
 * own scroll boundaries so the page cannot chain-scroll.
 *
 * Nested overlays (lightbox under cart drawer, drawer under burger, etc.)
 * share one ref-counted lock. The naïve per-hook save/restore was the
 * mobile "finger scroll completely dead while taps still work" bug: when
 * the outer lock cleaned up before the inner one, it restored `overflow:
 * ''`, then the inner cleanup restored the `hidden` it had snapshotted —
 * leaving the page permanently non-scrollable with no modal open.
 */
let lockCount = 0;
/** Number of overlays that need the legacy document-level gesture guard.
 *
 * A document-level non-passive touchmove listener makes every nested scroll
 * wait for the main thread, even when the listener never cancels it. Most
 * modals need that guard for their manually managed scrolling; the gallery
 * lightbox deliberately does not once its product sheet is expanded, so it
 * opts out and lets Android keep that scroll on the compositor path. */
let gestureLockCount = 0;
let gestureGuardInstalled = false;
let lastTouchY = 0;
let savedStyles: {
  overflow: string;
  paddingRight: string;
  htmlOverflowY: string;
  htmlOverscroll: string;
  bodyOverscroll: string;
} | null = null;

function findScrollableAncestor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  let el: HTMLElement | null = target instanceof HTMLElement ? target : target.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const canY =
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      el.scrollHeight > el.clientHeight + 1;
    const canX =
      (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
      el.scrollWidth > el.clientWidth + 1;
    if (canY || canX) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * findScrollableAncestor calls getComputedStyle (a style recalc) plus a
 * layout read for every ancestor between the touch target and <body>. It used
 * to run from onTouchMove, i.e. once per ancestor per frame of every scroll
 * gesture, in every overlay in the app — the drawer, the lightbox, the filter
 * sheet, the address form. That is the same answer recomputed sixty times a
 * second: within one gesture the finger stays on one element, and that
 * element's scrollable ancestor cannot change.
 *
 * So resolve it once per gesture and keep it. `resolved` distinguishes "cached
 * a null" (nothing scrollable — the page must not chain-scroll) from "not
 * looked yet". The per-event scrollTop/clientHeight reads below stay: those
 * genuinely do change as the finger moves, and they are what decides whether
 * this gesture has hit the element's own boundary.
 */
let gestureScrollEl: HTMLElement | null = null;
let gestureResolved = false;

function resolveGestureScrollEl(target: EventTarget | null): HTMLElement | null {
  if (!gestureResolved) {
    gestureScrollEl = findScrollableAncestor(target);
    gestureResolved = true;
  }
  return gestureScrollEl;
}

function onTouchStart(event: TouchEvent) {
  gestureResolved = false;
  gestureScrollEl = null;
  const touch = event.touches[0];
  if (event.touches.length === 1 && touch) lastTouchY = touch.clientY;
}

function onTouchEnd() {
  gestureResolved = false;
  gestureScrollEl = null;
}

function onTouchMove(event: TouchEvent) {
  if (event.touches.length !== 1) return;
  const touch = event.touches[0];
  if (!touch) return;
  const y = touch.clientY;
  const deltaY = lastTouchY - y;
  lastTouchY = y;
  // Falls back to resolving here if the lock was applied mid-gesture and this
  // move never had a matching touchstart.
  const scrollEl = resolveGestureScrollEl(event.target);
  if (!scrollEl) {
    event.preventDefault();
    return;
  }
  const atTop = scrollEl.scrollTop <= 0;
  const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;
  if ((atTop && deltaY < 0) || (atBottom && deltaY > 0)) event.preventDefault();
}

/** Wheel has no gesture boundary to hang a cache on, so it memoizes against
 * the target itself and expires quickly — a burst of wheel events over one
 * element skips the walk, while moving the pointer elsewhere (or content
 * growing tall enough to become scrollable) re-resolves. */
const WHEEL_CACHE_MS = 150;
let wheelCacheTarget: EventTarget | null = null;
let wheelCacheEl: HTMLElement | null = null;
let wheelCacheAt = 0;

function onWheel(event: WheelEvent) {
  const now = Date.now();
  let scrollEl: HTMLElement | null;
  if (wheelCacheTarget === event.target && now - wheelCacheAt < WHEEL_CACHE_MS) {
    scrollEl = wheelCacheEl;
  } else {
    scrollEl = findScrollableAncestor(event.target);
    wheelCacheTarget = event.target;
    wheelCacheEl = scrollEl;
  }
  wheelCacheAt = now;
  if (!scrollEl) {
    event.preventDefault();
    return;
  }
  if (event.deltaY === 0) return;
  const atTop = scrollEl.scrollTop <= 0;
  const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;
  if ((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0)) event.preventDefault();
}

function installGestureGuard() {
  if (gestureGuardInstalled) return;
  gestureGuardInstalled = true;
  document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });
  document.addEventListener('wheel', onWheel, { passive: false, capture: true });
}

function removeGestureGuard() {
  if (!gestureGuardInstalled) return;
  gestureGuardInstalled = false;
  document.removeEventListener('touchstart', onTouchStart, true);
  document.removeEventListener('touchmove', onTouchMove, true);
  document.removeEventListener('touchend', onTouchEnd, true);
  document.removeEventListener('touchcancel', onTouchEnd, true);
  document.removeEventListener('wheel', onWheel, true);
  // Never hold a detached node from a closed overlay.
  onTouchEnd();
  wheelCacheTarget = null;
  wheelCacheEl = null;
}

function applyBodyScrollLock() {
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  const body = document.body;
  const html = document.documentElement;
  savedStyles = {
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
    htmlOverflowY: html.style.overflowY,
    htmlOverscroll: html.style.overscrollBehavior,
    bodyOverscroll: body.style.overscrollBehavior,
  };
  body.style.overflow = 'hidden';
  html.style.overflowY = 'hidden';
  html.style.overscrollBehavior = 'none';
  body.style.overscrollBehavior = 'none';
  if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
}

function releaseBodyScrollLock() {
  if (!savedStyles) return;
  const body = document.body;
  const html = document.documentElement;
  body.style.overflow = savedStyles.overflow;
  body.style.paddingRight = savedStyles.paddingRight;
  html.style.overflowY = savedStyles.htmlOverflowY;
  html.style.overscrollBehavior = savedStyles.htmlOverscroll;
  body.style.overscrollBehavior = savedStyles.bodyOverscroll;
  savedStyles = null;
  removeGestureGuard();
}

/**
 * `blockTouchGestures` keeps the historical document-level gesture guard for
 * overlays whose own bodies are manually scrolled. Pass false only for an
 * overlay that contains a native, `overscroll-behavior: contain` scroller and
 * handles its non-scroll surfaces itself.
 */
export function useLockBodyScroll(enabled = true, blockTouchGestures = true) {
  useEffect(() => {
    if (!enabled) return;
    if (lockCount === 0) applyBodyScrollLock();
    lockCount += 1;
    if (blockTouchGestures) {
      gestureLockCount += 1;
      installGestureGuard();
    }
    return () => {
      if (blockTouchGestures) gestureLockCount = Math.max(0, gestureLockCount - 1);
      if (gestureLockCount === 0) removeGestureGuard();
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) releaseBodyScrollLock();
    };
  }, [enabled, blockTouchGestures]);
}
