import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface UseDragCarouselOptions {
  count: number;
  index: number;
  onIndexChange: (index: number) => void;
  /** called on a tap/click (not a drag) — usually opens the lightbox. Also
   * gets the tap's client coordinates, so the caller can anchor a
   * grow-from-point animation to where the finger/cursor actually was. */
  onOpen?: (index: number, x: number, y: number) => void;
  /**
   * Fraction of track width that must be dragged before a page change commits
   * on release. Gallery defaults to a light flick; pagers often use `0.5`.
   */
  commitRatio?: number;
  /**
   * Delay pointer capture until axis intent is clear. With `getScrollElement`,
   * locks exclusively to horizontal paging or vertical scrollTop (never both).
   * Without it, vertical intent abandons the gesture so native pan can run.
   */
  lockHorizontal?: boolean;
  /** Movement before `lockHorizontal` claims the gesture (default 8). */
  capturePx?: number;
  /**
   * Scroll container for vertical press-drag when `lockHorizontal` is true
   * (e.g. the active onboarding slide). Mouse and touch both drive scrollTop.
   */
  getScrollElement?: () => HTMLElement | null;
}

type LockedAxis = 'x' | 'y';

interface PointerState {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  trackWidth: number;
  /** Null until axis lock is claimed (or immediately when unlocked). */
  axis: LockedAxis | null;
  /** True once the gesture moved enough to count as a drag, not a tap. */
  moved: boolean;
  startScrollTop: number;
}

/**
 * Pointer Events-based drag/swipe for a carousel — one code path for mouse
 * press-move-release and touch swipe. Distinguishes a tap (opens the
 * lightbox) from a real drag (slides) by movement distance + duration.
 *
 * Controlled: `index` is owned by the caller (shared with the lightbox so
 * swiping in one place stays in sync with the other) rather than local state.
 */
export function useDragCarousel({
  count,
  index,
  onIndexChange,
  onOpen,
  commitRatio = 0.18,
  lockHorizontal = false,
  capturePx = 8,
  getScrollElement,
}: UseDragCarouselOptions) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pointerState = useRef<PointerState | null>(null);
  // Coalesce drag offset to one re-render per frame (pointermove can fire faster).
  const pendingOffsetRef = useRef(0);
  const offsetFrameRef = useRef(0);
  const scheduleDragOffset = useCallback((dx: number) => {
    pendingOffsetRef.current = dx;
    if (offsetFrameRef.current) return;
    offsetFrameRef.current = requestAnimationFrame(() => {
      offsetFrameRef.current = 0;
      setDragOffset(pendingOffsetRef.current);
    });
  }, []);
  const resetDragOffset = useCallback(() => {
    cancelAnimationFrame(offsetFrameRef.current);
    offsetFrameRef.current = 0;
    setDragOffset(0);
  }, []);
  useEffect(() => () => cancelAnimationFrame(offsetFrameRef.current), []);
  const commitRatioRef = useRef(commitRatio);
  commitRatioRef.current = commitRatio;
  const capturePxRef = useRef(capturePx);
  capturePxRef.current = capturePx;
  const getScrollElementRef = useRef(getScrollElement);
  getScrollElementRef.current = getScrollElement;

  const clamp = useCallback((i: number) => Math.max(0, Math.min(count - 1, i)), [count]);

  const goTo = useCallback((i: number) => onIndexChange(clamp(i)), [clamp, onIndexChange]);
  const next = useCallback(() => onIndexChange(clamp(index + 1)), [clamp, index, onIndexChange]);
  const prev = useCallback(() => onIndexChange(clamp(index - 1)), [clamp, index, onIndexChange]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // Interactive controls inside a slide must keep their own pointer path.
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('button, a, input, textarea, select, [role="button"]')
      ) {
        return;
      }

      // A single-photo carousel (e.g. a compact favorite card) has nothing to
      // swipe between — skip capturing the pointer so a touch drag falls
      // through as a native scroll on an ancestor (the favorites strip)
      // instead of being claimed here.
      const canPage = count > 1;
      const immediateLock = canPage && !lockHorizontal;
      if (immediateLock) e.currentTarget.setPointerCapture(e.pointerId);
      const scrollEl = getScrollElementRef.current?.() ?? null;
      pointerState.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTime: performance.now(),
        trackWidth: trackRef.current?.clientWidth || 1,
        axis: immediateLock ? 'x' : null,
        moved: false,
        startScrollTop: scrollEl?.scrollTop ?? 0,
      };
      if (immediateLock) setIsDragging(true);
    },
    [count, lockHorizontal],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const state = pointerState.current;
      if (!state || state.pointerId !== e.pointerId) return;

      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;

      if (state.axis === null) {
        const capture = capturePxRef.current;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < capture) return;

        const preferX = Math.abs(dx) >= Math.abs(dy);
        if (preferX && count > 1) {
          state.axis = 'x';
          state.moved = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          setIsDragging(true);
        } else if (!preferX && getScrollElementRef.current) {
          // Exclusive vertical lock: drive scrollTop (mouse + touch).
          const scrollEl = getScrollElementRef.current();
          state.axis = 'y';
          state.moved = true;
          state.startScrollTop = scrollEl?.scrollTop ?? 0;
          e.currentTarget.setPointerCapture(e.pointerId);
        } else {
          // No pager target and/or no scroll driver — abandon so native pan
          // (or a no-op) can proceed without fighting the carousel.
          pointerState.current = null;
          return;
        }
      }

      if (state.axis === 'y') {
        const scrollEl = getScrollElementRef.current?.();
        if (scrollEl) {
          e.preventDefault();
          scrollEl.scrollTop = state.startScrollTop - dy;
        }
        return;
      }

      // Horizontal pager lock.
      if (count <= 1) return;
      state.moved = true;
      e.preventDefault();
      scheduleDragOffset(dx);
    },
    [count, scheduleDragOffset],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const state = pointerState.current;
      if (!state || state.pointerId !== e.pointerId) return;

      const lockedAxis = state.axis;
      pointerState.current = null;
      setIsDragging(false);
      resetDragOffset();

      // A cancel means the browser hijacked the gesture (e.g. for a native
      // scroll on an ancestor) — not a completed tap or drag.
      if (e.type === 'pointercancel') return;

      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      const dt = performance.now() - state.startTime;
      const isTap = !state.moved && Math.hypot(dx, dy) < 6 && dt < 400;

      // Single-photo tracks never claim an axis (so ancestor scroll still
      // works). An unclaimed gesture that stayed within tap bounds must
      // still open the lightbox / fire onOpen.
      if (!lockedAxis) {
        if (isTap) onOpen?.(index, e.clientX, e.clientY);
        return;
      }

      // Vertical scroll keeps its position; no page commit.
      if (lockedAxis === 'y') return;

      if (isTap) {
        onOpen?.(index, e.clientX, e.clientY);
      } else {
        const threshold = state.trackWidth * commitRatioRef.current;
        if (dx <= -threshold) onIndexChange(clamp(index + 1));
        else if (dx >= threshold) onIndexChange(clamp(index - 1));
      }
    },
    [clamp, index, onIndexChange, onOpen, resetDragOffset],
  );

  return {
    index,
    isDragging,
    dragOffset,
    trackRef,
    goTo,
    next,
    prev,
    canPrev: index > 0,
    canNext: index < count - 1,
    trackHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
