import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

interface UseLightboxGesturesOptions {
  index: number;
  count: number;
  onIndexChange: (next: number) => void;
}

type GestureMode = 'pan' | 'swipe' | null;

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_WINDOW_MS = 300;
const SWIPE_THRESHOLD_RATIO = 0.18;
const TAP_MOVE_THRESHOLD = 6;
/** Keyboard zoom/pan steps (zoomBy/panBy): the non-pointer path to what
 * pinch, wheel and drag do. */
export const KEY_ZOOM_STEP = 1.25;
export const KEY_PAN_STEP = 48;

const initialZoom: ZoomState = { scale: 1, x: 0, y: 0 };

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Combined gesture handling for the lightbox: pinch-to-zoom, drag-to-pan of
 * the current photo, and drag-to-swipe between photos — all through one
 * Pointer Events code path (mouse and touch share it).
 *
 * A single-pointer drag means two different things depending on current
 * zoom, decided once at pointerdown: while zoomed in, it pans the current
 * photo (`swipeOffset` stays put); while at 1x, it slides the photo track
 * (`swipeOffset` moves, zoom pan stays put) exactly like the card carousel,
 * so the next/previous photo visibly slides into place instead of the
 * photo abruptly swapping after the fact.
 */
export function useLightboxGestures({ index, count, onIndexChange }: UseLightboxGesturesOptions) {
  const [zoom, setZoom] = useState<ZoomState>(initialZoom);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const gestureMode = useRef<GestureMode>(null);
  const lastTapTime = useRef(0);
  /** Set once real pointer movement happens during a single-pointer gesture — lets
   * consumers tell a genuine drag/swipe/pan apart from a stationary tap, regardless
   * of where the pointer happens to end up (e.g. a swipe can legitimately end over
   * the letterboxed area around the photo, not just over the photo itself). */
  const wasDrag = useRef(false);

  const resetZoom = useCallback(() => setZoom(initialZoom), []);

  /** Keyboard counterpart of pinch/wheel (RGAA 7.3): back to 1x clears the pan. */
  const zoomBy = useCallback(
    (factor: number) =>
      setZoom((z) => {
        const next = clampScale(z.scale * factor);
        return next <= MIN_SCALE ? initialZoom : { ...z, scale: next };
      }),
    [],
  );

  /** Keyboard counterpart of the drag-to-pan, only while zoomed in. */
  const panBy = useCallback(
    (dx: number, dy: number) =>
      setZoom((z) => (z.scale > MIN_SCALE ? { ...z, x: z.x + dx, y: z.y + dy } : z)),
    [],
  );

  // React attaches its synthetic wheel listener as passive, so
  // e.preventDefault() inside a JSX onWheel silently fails (and warns) —
  // bind a real, non-passive listener directly to the DOM node instead.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setZoom((z) => {
        const next = clampScale(z.scale - e.deltaY * 0.0015 * z.scale);
        return next <= MIN_SCALE ? initialZoom : { ...z, scale: next };
      });
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 1) {
        const now = performance.now();
        if (now - lastTapTime.current < DOUBLE_TAP_WINDOW_MS) {
          lastTapTime.current = 0;
          setZoom((z) => (z.scale > MIN_SCALE ? initialZoom : { scale: DOUBLE_TAP_SCALE, x: 0, y: 0 }));
          return;
        }
        lastTapTime.current = now;
        gestureMode.current = zoom.scale > MIN_SCALE ? 'pan' : 'swipe';
        dragStart.current = { x: e.clientX, y: e.clientY, originX: zoom.x, originY: zoom.y };
        wasDrag.current = false;
        setIsDragging(true);
      } else if (pointers.current.size === 2) {
        const [a, b] = Array.from(pointers.current.values());
        if (!a || !b) return;
        pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: zoom.scale };
        gestureMode.current = null;
        dragStart.current = null;
      }
    },
    [zoom.scale, zoom.x, zoom.y],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      if (!a || !b) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const scale = clampScale(pinchStart.current.scale * (distance / pinchStart.current.distance));
      setZoom((z) => ({ ...z, scale }));
    } else if (pointers.current.size === 1 && dragStart.current) {
      const [p] = Array.from(pointers.current.values());
      if (!p) return;
      const start = dragStart.current;
      if (Math.hypot(p.x - start.x, p.y - start.y) > TAP_MOVE_THRESHOLD) wasDrag.current = true;
      if (gestureMode.current === 'pan') {
        setZoom((z) => ({ ...z, x: start.originX + (p.x - start.x), y: start.originY + (p.y - start.y) }));
      } else if (gestureMode.current === 'swipe') {
        setSwipeOffset(p.x - start.x);
      }
    }
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinchStart.current = null;

      if (pointers.current.size === 0) {
        if (gestureMode.current === 'swipe') {
          const width = containerRef.current?.clientWidth || 1;
          const threshold = width * SWIPE_THRESHOLD_RATIO;
          if (swipeOffset <= -threshold && index < count - 1) onIndexChange(index + 1);
          else if (swipeOffset >= threshold && index > 0) onIndexChange(index - 1);
          setSwipeOffset(0);
        }
        dragStart.current = null;
        gestureMode.current = null;
        setIsDragging(false);
      }
    },
    [swipeOffset, index, count, onIndexChange],
  );

  return {
    scale: zoom.scale,
    x: zoom.x,
    y: zoom.y,
    swipeOffset,
    isDragging,
    wasDrag,
    resetZoom,
    zoomBy,
    panBy,
    containerRef,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
