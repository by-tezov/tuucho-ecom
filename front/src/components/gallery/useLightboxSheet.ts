import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useScrollHint } from '../../hooks/useScrollHint';
import { useIosSheetTouch } from './useIosSheetTouch';
import styles from './PhotoLightbox.module.css';

/** Mobile sheet photo height as % of the dialog (matches the old 3/5 split). */
const PHOTO_MAX_PCT = 60;
/** Floor at 1.5/5 of the sheet — below this, the panel scrolls instead. */
const PHOTO_MIN_PCT = 30;
const MOBILE_COLLAPSE_MQ = '(max-width: 1023px)';
/** Slack before the panel counts as "content no longer fits". Shared by
 * contentOverflows and the collapse arithmetic so the two cannot disagree
 * about where the stopping point is. */
const CONTENT_FIT_SLACK_PX = 4;

/** Safari can cancel a Pointer Events sequence when it decides a page pan has
 * begun, even with `touch-action: none` on a transformed sheet. Keep the
 * robust, non-passive Touch Events path strictly to iOS; Android continues
 * to use Pointer Events and retains compositor-native scrolling. This also
 * catches iPadOS when it reports the desktop Mac platform. */
function isIosTouchDevice() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export interface LightboxSheetOptions {
  /** Where the dialog grows from (the zoom button that opened it). */
  originX: number | undefined;
  originY: number | undefined;
  /** Photo zoom is active. Kept as a boolean, not the raw scale, so a live
   * pinch does not re-run the snap every frame. */
  isZoomed: boolean;
}

/**
 * The mobile product sheet: the collapsing photo, the drag/wheel/touch
 * gestures that resize it, and the geometry cache they read.
 *
 * Extracted from PhotoLightboxView for size alone — every line here was
 * already in that component and behaves identically. It is the half that a
 * change to the product panel never needs to read, and vice versa, which is
 * the point of the split. Sibling of useLightboxGestures, which owns the
 * photo's own pinch/pan/zoom.
 *
 * Everything mutable lives in refs on purpose: the browser-level listeners
 * bind once instead of rebinding as the panel transforms each frame.
 */
export function useLightboxSheet({ originX, originY, isZoomed }: LightboxSheetOptions) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDialogElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  const panelDragRef = useRef<{ lastY: number } | null>(null);
  const sheetDragRef = useRef<{ pointerId: number; lastY: number } | null>(null);
  const photoPctRef = useRef(PHOTO_MAX_PCT);
  const dialogHeightRef = useRef(1);
  const sheetMetricsRef = useRef({ contentHeight: 0, expandedViewportHeight: 0 });
  const mobileCollapseRef = useRef(false);
  const sheetExpandedRef = useRef(false);
  const topPullCleanupRef = useRef<(() => void) | null>(null);
  const [entered, setEntered] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  // Shares the standard chevron measurement with every other scrollable
  // modal body; `extraDown` adds the one thing that is genuinely local here —
  // "more to reveal" also covers a photo that can still collapse, which is
  // invisible in scrollTop. The up cue stays the plain one: expanding again
  // after returning to the top is the reverse path, and gets no chevron.
  const { scrollHint, updateScrollHint } = useScrollHint(scrollAreaRef, {
    extraDown: (el) =>
      mobileCollapseRef.current && el.scrollTop <= 1 && !photoFullyCollapsed() && contentOverflows(),
  });
  const [mobileCollapse, setMobileCollapse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_COLLAPSE_MQ).matches,
  );
  mobileCollapseRef.current = mobileCollapse;
  sheetExpandedRef.current = sheetExpanded;
  const useIosTouchSheetGestures = isIosTouchDevice();
  /** The panel is always laid out at its fully-expanded height. Its lower
   * portion is merely clipped by the dialog while collapsed, so use the
   * cached *visible* viewport rather than its physical clientHeight. That
   * keeps the sheet's stop point exact without a layout read during a drag. */
  function visibleSheetViewport(photoPct = photoPctRef.current) {
    const { expandedViewportHeight } = sheetMetricsRef.current;
    const collapseTravelPx = ((PHOTO_MAX_PCT - PHOTO_MIN_PCT) / 100) * dialogHeightRef.current;
    const revealedPx = ((PHOTO_MAX_PCT - photoPct) / 100) * dialogHeightRef.current;
    return Math.max(0, expandedViewportHeight - collapseTravelPx + revealedPx);
  }

  const contentOverflows = useCallback((photoPct = photoPctRef.current) => {
    const el = scrollAreaRef.current;
    if (!el) return false;
    if (!mobileCollapseRef.current) return el.scrollHeight > el.clientHeight + CONTENT_FIT_SLACK_PX;
    const { contentHeight, expandedViewportHeight } = sheetMetricsRef.current;
    if (expandedViewportHeight <= 0) return el.scrollHeight > el.clientHeight + CONTENT_FIT_SLACK_PX;
    return contentHeight > visibleSheetViewport(photoPct) + CONTENT_FIT_SLACK_PX;
  }, []);

  function photoFullyCollapsed() {
    return photoPctRef.current <= PHOTO_MIN_PCT + 0.05;
  }

  const refreshSheetMetrics = useCallback(() => {
    const dialog = dialogRef.current;
    const scrollArea = scrollAreaRef.current;
    const scrollContent = scrollContentRef.current;
    if (!dialog || !scrollArea || !scrollContent) return;
    dialogHeightRef.current = dialog.clientHeight || 1;
    const scrollStyle = window.getComputedStyle(scrollArea);
    const verticalPadding =
      (Number.parseFloat(scrollStyle.paddingTop) || 0) + (Number.parseFloat(scrollStyle.paddingBottom) || 0);
    sheetMetricsRef.current = {
      // scrollArea.scrollHeight is never smaller than clientHeight. In this
      // transform sheet clientHeight is the *fully expanded* viewport, so it
      // would make a short description look as if it filled the whole panel
      // and leave a large empty area. The flow-root wrapper gives us the
      // genuine content block height instead.
      contentHeight: scrollContent.offsetHeight + verticalPadding,
      expandedViewportHeight: scrollArea.clientHeight,
    };
  }, []);

  /** The panel is physically its full height from the beginning. This only
   * moves composited layers: the opaque panel covers the lower portion of the
   * fixed photo, and its footer/overlays counter-translate into their visual
   * positions. No flex basis, text layout, or image raster size changes while
   * the finger moves. */
  const setPhotoPct = useCallback((next: number) => {
    const photoPct = Math.min(PHOTO_MAX_PCT, Math.max(PHOTO_MIN_PCT, next));
    photoPctRef.current = photoPct;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const collapsedPct = PHOTO_MAX_PCT - photoPct;
    const panelHeightPct = 100 - PHOTO_MIN_PCT;
    const collapseTravelPx = (collapsedPct / 100) * dialogHeightRef.current;
    const footerOffsetPx = -((photoPct - PHOTO_MIN_PCT) / 100) * dialogHeightRef.current;
    dialog.style.setProperty('--lightbox-panel-offset', `${(-collapsedPct / panelHeightPct) * 100}%`);
    dialog.style.setProperty('--lightbox-footer-offset', `${footerOffsetPx}px`);
    dialog.style.setProperty('--lightbox-photo-overlay-offset', `${-collapseTravelPx}px`);
    dialog.style.setProperty('--lightbox-photo-nav-offset', `${-collapseTravelPx / 2}px`);
  }, []);

  const setSheetExpandedBoth = useCallback((next: boolean) => {
    if (sheetExpandedRef.current === next) return;
    sheetExpandedRef.current = next;
    setSheetExpanded(next);
  }, []);

  const clearTopPullWatcher = useCallback(() => {
    topPullCleanupRef.current?.();
    topPullCleanupRef.current = null;
  }, []);

  /** Zooming into the photo means the customer wants to see the photo, not
   * the panel — if the product sheet covered part of it from an earlier drag,
   * snap that sheet down first. */
  const snapPhotoToMax = useCallback(() => {
    if (!mobileCollapseRef.current || photoPctRef.current >= PHOTO_MAX_PCT - 0.05) return;
    const dialog = dialogRef.current;
    if (styles.sheetSnap) dialog?.classList.add(styles.sheetSnap);
    setPhotoPct(PHOTO_MAX_PCT);
    setSheetExpandedBoth(false);
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
    window.setTimeout(() => {
      if (styles.sheetSnap) dialog?.classList.remove(styles.sheetSnap);
    }, 240);
  }, [setPhotoPct, setSheetExpandedBoth]);

  /**
   * Collapsed-sheet drag: grow the visible product panel until all its
   * content fits or it reaches the 30% photo floor. The gesture itself only
   * updates transform properties; once it reaches that resting state the
   * pointer handlers are removed and the content gets native scrolling.
   */
  const expandSheetBy = useCallback(
    (deltaY: number): number => {
      if (!mobileCollapseRef.current || sheetExpandedRef.current || deltaY <= 0 || !contentOverflows())
        return 0;
      const beforePct = photoPctRef.current;
      const pctPerPx = 100 / dialogHeightRef.current;
      const exhausted = beforePct - deltaY * pctPerPx;
      const overflowPx =
        sheetMetricsRef.current.contentHeight - visibleSheetViewport(beforePct) - CONTENT_FIT_SLACK_PX;
      const justFits = beforePct - overflowPx * pctPerPx;
      const nextPct = Math.min(beforePct, Math.max(exhausted, PHOTO_MIN_PCT, justFits));
      if (beforePct - nextPct <= 0) return 0;
      setPhotoPct(nextPct);
      if (!contentOverflows(nextPct) || nextPct <= PHOTO_MIN_PCT + 0.05) {
        setSheetExpandedBoth(true);
        requestAnimationFrame(updateScrollHint);
      }
      // Pixels of finger travel this step used; the rest is the caller's.
      return (beforePct - nextPct) / pctPerPx;
    },
    [contentOverflows, setPhotoPct, setSheetExpandedBoth, updateScrollHint],
  );

  const collapseSheetBy = useCallback(
    (deltaY: number) => {
      if (!mobileCollapseRef.current || deltaY <= 0 || photoPctRef.current >= PHOTO_MAX_PCT - 0.05) return;
      const beforePct = photoPctRef.current;
      const nextPct = Math.min(PHOTO_MAX_PCT, beforePct + (deltaY * 100) / dialogHeightRef.current);
      if (nextPct <= beforePct) return;
      const wasExpanded = sheetExpandedRef.current;
      if (wasExpanded) setSheetExpandedBoth(false);
      setPhotoPct(nextPct);
      if (wasExpanded) requestAnimationFrame(updateScrollHint);
    },
    [setPhotoPct, setSheetExpandedBoth, updateScrollHint],
  );

  /**
   * One step of a drag the sheet owns (started on the collapsed body, or as
   * a top-edge pull). Finger up (`deltaY > 0`) grows the sheet
   * and, once it cannot grow further, scrolls the content with whatever
   * travel is left, so one continuous gesture expands then reads on. Finger
   * down scrolls the content back to its top first and only then shrinks the
   * sheet: the exact reverse, again without lifting the finger.
   */
  const driveSheet = useCallback(
    (deltaY: number) => {
      const area = scrollAreaRef.current;
      if (deltaY > 0) {
        const rest = deltaY - expandSheetBy(deltaY);
        if (rest > 0 && sheetExpandedRef.current && area) {
          area.scrollTop += rest;
          updateScrollHint();
        }
        return;
      }
      let rest = -deltaY;
      if (area && area.scrollTop > 0) {
        const before = area.scrollTop;
        area.scrollTop = Math.max(0, before - rest);
        rest -= before - area.scrollTop;
        updateScrollHint();
      }
      if (rest > 0) collapseSheetBy(rest);
    },
    [collapseSheetBy, expandSheetBy, updateScrollHint],
  );

  /** Shape/length menu opens upward on mobile. Collapse the product sheet
   * all the way back to its resting (origin) size — not just enough to clear
   * the clipped list — so tags sit low again and the menu has the full photo
   * above them. useFloatingMenuRect's rAF loop keeps the portaled list glued
   * to the tags for the sheetSnap transform duration. */
  const makeRoomAboveMenu = useCallback(
    (_overflowPx: number) => {
      snapPhotoToMax();
    },
    [snapPhotoToMax],
  );

  /** Native scrolling stays entirely untouched for normal content motion.
   * Every touch on the open sheet installs this short-lived listener: once
   * the content is at its top and the finger moves down, that same touch
   * becomes the pull-to-collapse sheet gesture (even if it started lower in
   * the content and scrolled back up first). Otherwise it is native scroll. */
  function watchTopPullToCollapse(e: React.PointerEvent<HTMLDivElement>) {
    if (
      useIosTouchSheetGestures ||
      e.pointerType !== 'touch' ||
      !mobileCollapseRef.current ||
      !sheetExpandedRef.current
    ) {
      return;
    }
    const scrollArea = e.currentTarget;
    clearTopPullWatcher();

    let lastY = e.clientY;
    // Set once this touch has become a sheet gesture: from then on it keeps
    // driving the sheet (and its content scroll) in both directions.
    let owned = false;
    function cleanup() {
      scrollArea.removeEventListener('touchmove', onTouchMove);
      scrollArea.removeEventListener('touchend', cleanup);
      scrollArea.removeEventListener('touchcancel', cleanup);
      if (topPullCleanupRef.current === cleanup) topPullCleanupRef.current = null;
    }
    function onTouchMove(event: TouchEvent) {
      if (event.touches.length !== 1 || (!owned && scrollArea.scrollTop > 1)) return;
      const touch = event.touches[0];
      if (!touch) return;
      const y = touch.clientY;
      const deltaY = lastY - y;
      lastY = y;
      // A usual upward move remains native content scroll. Once the same
      // touch has started collapsing the sheet, its reverse direction grows
      // the sheet again instead of requiring the finger to be lifted.
      if (deltaY >= 0 && !owned) return;
      // Finger moving down at the top: take over only this gesture.
      if (event.cancelable) event.preventDefault();
      owned = true;
      driveSheet(deltaY);
    }

    topPullCleanupRef.current = cleanup;
    scrollArea.addEventListener('touchmove', onTouchMove, { passive: false });
    scrollArea.addEventListener('touchend', cleanup);
    scrollArea.addEventListener('touchcancel', cleanup);
  }

  function onScrollAreaPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (mobileCollapseRef.current) {
      if (useIosTouchSheetGestures && e.pointerType === 'touch') return;
      if (sheetExpandedRef.current) {
        if (e.pointerType === 'touch') {
          watchTopPullToCollapse(e);
          return;
        }
        // Mouse has no native drag-to-scroll, so a drag on the open sheet is
        // always the sheet's: down scrolls the content back to its top then
        // shrinks the sheet, up scrolls the content further (driveSheet).
        const target = e.target as HTMLElement;
        if (target.closest('a, button, input, select, textarea, [role="button"]')) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        sheetDragRef.current = { pointerId: e.pointerId, lastY: e.clientY };
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('a, button, input, select, textarea, [role="button"]')) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      sheetDragRef.current = { pointerId: e.pointerId, lastY: e.clientY };
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, select, textarea, [role="button"]')) return;
    panelDragRef.current = { lastY: e.clientY };
  }

  function onScrollAreaPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (mobileCollapseRef.current) {
      if (useIosTouchSheetGestures && e.pointerType === 'touch') return;
      const drag = sheetDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const deltaY = drag.lastY - e.clientY;
      drag.lastY = e.clientY;
      if (deltaY !== 0) driveSheet(deltaY);
      return;
    }
    const drag = panelDragRef.current;
    if (!drag) return;
    const deltaY = drag.lastY - e.clientY;
    drag.lastY = e.clientY;
    if (deltaY === 0) return;
    e.currentTarget.scrollTop += deltaY;
  }

  function onScrollAreaPointerUp(e?: React.PointerEvent<HTMLDivElement>) {
    clearTopPullWatcher();
    if (e && sheetDragRef.current?.pointerId === e.pointerId) sheetDragRef.current = null;
    panelDragRef.current = null;
  }

  // Grow the dialog out of the point that was clicked to open it (the zoom
  // button) instead of always its own center. offsetLeft/Top/Width/Height
  // are read here because, unlike getBoundingClientRect, they ignore the
  // CSS transform below — so the origin is correct even before the very
  // first (scale(0.05)) paint.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && originX != null && originY != null) {
      const relX = originX - dialog.offsetLeft;
      const relY = originY - dialog.offsetTop;
      dialog.style.transformOrigin = `${relX}px ${relY}px`;
    }
    refreshSheetMetrics();
    setPhotoPct(photoPctRef.current);
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [originX, originY, refreshSheetMetrics, setPhotoPct]);

  // `position: fixed; inset: 0` follows Safari's layout viewport, which can
  // lag one or more frames behind its collapsing/expanding browser chrome.
  // During that gap the site's own fixed tab bar is visible below the modal.
  // Give the backdrop the live visual viewport height instead and recompute
  // the sheet's cached geometry in the same animation frame.
  useLayoutEffect(() => {
    if (!useIosTouchSheetGestures || !window.visualViewport) return;
    const backdrop = backdropRef.current;
    const visualViewport = window.visualViewport;
    if (!backdrop) return;
    const activeBackdrop = backdrop;
    let frame = 0;

    function syncVisualViewport() {
      frame = 0;
      activeBackdrop.style.setProperty(
        '--lightbox-visual-viewport-height',
        `${Math.ceil(visualViewport.height)}px`,
      );
      refreshSheetMetrics();
      setPhotoPct(photoPctRef.current);
      updateScrollHint();
    }
    function requestSync() {
      if (frame) return;
      frame = requestAnimationFrame(syncVisualViewport);
    }

    syncVisualViewport();
    visualViewport.addEventListener('resize', requestSync);
    visualViewport.addEventListener('scroll', requestSync);
    window.addEventListener('orientationchange', requestSync);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      visualViewport.removeEventListener('resize', requestSync);
      visualViewport.removeEventListener('scroll', requestSync);
      window.removeEventListener('orientationchange', requestSync);
    };
    // All mutable gesture/layout values are refs; bind these browser-level
    // listeners once, rather than during each panel transform.
  }, [refreshSheetMetrics, setPhotoPct, updateScrollHint, useIosTouchSheetGestures]);

  // Cache the geometry when it can genuinely change (fonts, translation,
  // orientation, content), not during a drag. The sheet transforms do not
  // change either observed box, so this never becomes a per-frame callback.
  useEffect(() => {
    const container = scrollAreaRef.current;
    const content = scrollContentRef.current;
    const dialog = dialogRef.current;
    function syncMetrics() {
      refreshSheetMetrics();
      updateScrollHint();
    }
    if (!container || !content || !dialog || typeof ResizeObserver === 'undefined') {
      syncMetrics();
      return;
    }
    const observer = new ResizeObserver(syncMetrics);
    observer.observe(dialog);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [refreshSheetMetrics, updateScrollHint]);

  // Mobile collapsing photo: only active ≤1023px; reset when leaving that range.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_COLLAPSE_MQ);
    function sync() {
      setMobileCollapse(mq.matches);
      setPhotoPct(PHOTO_MAX_PCT);
      setSheetExpandedBoth(false);
      if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
      requestAnimationFrame(updateScrollHint);
    }
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [setPhotoPct, setSheetExpandedBoth, updateScrollHint]);

  // Starting a photo zoom snaps the panel back to its smallest size (see
  // snapPhotoToMax) — keyed on the boolean, not the raw scale, so a live
  // pinch's continuous scale updates don't re-trigger this every frame.
  useEffect(() => {
    if (isZoomed) snapPhotoToMax();
  }, [isZoomed, snapPhotoToMax]);

  // While the sheet is collapsed, a wheel/trackpad gesture expands it rather
  // than moving the invisible part of its native scroll viewport, and the
  // reverse (scrolling back up from the very top) collapses it again — same
  // edge as the touch pull-to-collapse. Once genuinely
  // scrolled into the body's own content, this stays out of the way and
  // lets normal browser scrolling happen. This listener is kept mounted the
  // whole time the sheet is expandable (not removed once expanded): removing
  // it used to leave a scroll-to-the-top-then-keep-scrolling-up wheel
  // gesture with no way back.
  useEffect(() => {
    const node = scrollAreaRef.current;
    if (!node || !mobileCollapse) return;
    const activeNode = node;

    function onWheel(e: WheelEvent) {
      if (e.deltaY === 0) return;
      if (e.deltaY > 0) {
        if (sheetExpandedRef.current || !contentOverflows()) return;
        e.preventDefault();
        driveSheet(e.deltaY);
        return;
      }
      if (activeNode.scrollTop > 1) return;
      e.preventDefault();
      collapseSheetBy(-e.deltaY);
    }

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
    };
  }, [collapseSheetBy, contentOverflows, driveSheet, mobileCollapse]);

  useIosSheetTouch({
    enabled: useIosTouchSheetGestures,
    scrollAreaRef,
    mobileCollapseRef,
    sheetExpandedRef,
    driveSheet,
  });

  useEffect(() => () => clearTopPullWatcher(), [clearTopPullWatcher]);

  return {
    useIosTouchSheetGestures,
    dialogRef,
    backdropRef,
    scrollAreaRef,
    scrollContentRef,
    entered,
    sheetExpanded,
    mobileCollapse,
    scrollHint,
    updateScrollHint,
    makeRoomAboveMenu,
    onScrollAreaPointerDown,
    onScrollAreaPointerMove,
    onScrollAreaPointerUp,
  };
}
