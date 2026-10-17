import { useCallback, useEffect, useLayoutEffect, useState, type RefCallback } from 'react';
import type { AuthStatus } from '../../state/AuthContext';

const PIN_TOP_PX = 24;
const DESKTOP_MIN_INNER_WIDTH = 1023;
const MIN_LAID_OUT_PX = 1;

interface CartSummarySticky {
  summaryAnchorRef: RefCallback<HTMLElement>;
  summaryStackRef: RefCallback<HTMLDivElement>;
  mainColRef: RefCallback<HTMLDivElement>;
  summaryPinned: boolean;
  summaryBounds: { left: number; width: number } | null;
  summaryTop: number;
}

function isLaidOut(bounds: DOMRectReadOnly): boolean {
  return bounds.width >= MIN_LAID_OUT_PX && bounds.height >= MIN_LAID_OUT_PX;
}

function sameNode<T>(current: T | null, next: T | null): T | null {
  return current === next ? current : next;
}

/** `position: fixed` takes the stack out of flow. Without a height on the
 * aside, the column collapses, `isLaidOut` fails, and the recap pin/unpins
 * every frame — two copies of Récapitulatif flashing. Shop checkout is tall
 * enough that the left column usually hides this; a gift recap is not. */
function reserveAnchorHeight(anchor: HTMLElement, stack: HTMLElement | null, pinned: boolean) {
  if (pinned && stack) {
    const next = `${stack.offsetHeight}px`;
    if (anchor.style.minHeight !== next) {
      anchor.style.minHeight = next;
    }
    return;
  }
  if (anchor.style.minHeight) {
    anchor.style.minHeight = '';
  }
}

/** Measures and pins the desktop recap stack while keeping it inside the
 * cart's main column. The refs remain separate: the anchor must never become
 * fixed, otherwise it can no longer represent the column's natural position.
 *
 * Gift refresh keeps the cart mounted under `display: none` during splash.
 * A hidden aside reports a 0×0 box at top 0, which used to pin the recap at
 * `left: 0; width: 0` until the next scroll. Skip pinning until the box is
 * real, and remeasure when the aside mounts or an ancestor becomes visible. */
export function useCartSummarySticky(status: AuthStatus): CartSummarySticky {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [stack, setStack] = useState<HTMLDivElement | null>(null);
  const [mainCol, setMainCol] = useState<HTMLDivElement | null>(null);
  const [summaryPinned, setSummaryPinned] = useState(false);
  const [summaryBounds, setSummaryBounds] = useState<{ left: number; width: number } | null>(null);
  const [summaryTop, setSummaryTop] = useState(PIN_TOP_PX);

  const summaryAnchorRef = useCallback((node: HTMLElement | null) => {
    setAnchor((current) => sameNode(current, node));
  }, []);
  const summaryStackRef = useCallback((node: HTMLDivElement | null) => {
    setStack((current) => sameNode(current, node));
  }, []);
  const mainColRef = useCallback((node: HTMLDivElement | null) => {
    setMainCol((current) => sameNode(current, node));
  }, []);

  const updateSummaryPosition = useCallback(() => {
    if (!anchor) {
      setSummaryPinned(false);
      return;
    }
    const bounds = anchor.getBoundingClientRect();
    const columnStillMeasured = summaryPinned && bounds.width >= MIN_LAID_OUT_PX;
    const shouldPin =
      (isLaidOut(bounds) || columnStillMeasured) &&
      bounds.top <= PIN_TOP_PX &&
      window.innerWidth > DESKTOP_MIN_INNER_WIDTH;
    if (shouldPin) {
      // Reserve space before React applies `position: fixed`, otherwise the
      // aside collapses and the next measure immediately unpins.
      reserveAnchorHeight(anchor, stack, true);
      setSummaryBounds((current) =>
        current?.left === bounds.left && current.width === bounds.width
          ? current
          : { left: bounds.left, width: bounds.width },
      );
    }
    setSummaryPinned(shouldPin);

    if (shouldPin && stack && mainCol) {
      const columnBottom = mainCol.getBoundingClientRect().bottom;
      const maxTop = columnBottom - stack.offsetHeight;
      // Keep state stable until the visible position actually changes a pixel.
      setSummaryTop(Math.round(Math.min(PIN_TOP_PX, maxTop)));
    } else {
      setSummaryTop(PIN_TOP_PX);
    }
  }, [anchor, mainCol, stack, summaryPinned]);

  useLayoutEffect(() => {
    if (!anchor) return;
    reserveAnchorHeight(anchor, stack, summaryPinned);
  }, [anchor, stack, summaryPinned]);

  useEffect(() => {
    if (!anchor) {
      setSummaryPinned(false);
      return;
    }

    updateSummaryPosition();
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateSummaryPosition();
      });
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    resizeObserver?.observe(anchor);
    if (stack) resizeObserver?.observe(stack);
    if (mainCol) resizeObserver?.observe(mainCol);

    // Layout holds the gift cart with `display: none` on `[data-cart-hold]`.
    // A hidden aside often reports a 0×0 box, and that size change is not
    // always delivered through ResizeObserver until a later scroll.
    const mutationObserver = new MutationObserver(schedule);
    const hold = anchor.closest('[data-cart-hold]');
    if (hold) {
      mutationObserver.observe(hold, { attributes: true, attributeFilter: ['style', 'hidden'] });
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, [anchor, mainCol, stack, updateSummaryPosition]);

  // Authentication changes the optional prompt above the recap. Re-measure
  // after its transition has settled so the fixed stack uses its final height.
  useEffect(() => {
    const timeout = window.setTimeout(updateSummaryPosition, 350);
    return () => window.clearTimeout(timeout);
  }, [status, updateSummaryPosition]);

  return { summaryAnchorRef, summaryStackRef, mainColRef, summaryPinned, summaryBounds, summaryTop };
}
