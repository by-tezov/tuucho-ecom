import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

/** Frames of an unchanged rect before the measure loop parks itself. ~1/3s at
 * 60Hz: long enough to ride out a sheet-snap transition, short enough that an
 * open menu is not holding a forced layout every frame for as long as it
 * stays open. */
const STABLE_FRAMES_BEFORE_PARK = 20;

/** Tracks a trigger element's viewport rect while a floating menu anchored to
 * it is open — so the menu can be portaled to `document.body` and positioned
 * with `position: fixed`, escaping any `overflow: hidden` ancestor (e.g. the
 * gallery card, which clips its own rounded corners) instead of being cut
 * off by it.
 *
 * Measuring runs as a rAF loop rather than only on discrete events, because
 * the trigger also moves under CSS transforms (the mobile zoom sheet snapping
 * when shape/length opens upward), which fire no scroll event. The loop parks
 * itself once the rect has held still, and any scroll, resize or transition
 * start wakes it again — an open-but-idle menu costs nothing. Returns `null`
 * while closed or before the first measurement. */
export function useFloatingMenuRect(anchorRef: RefObject<HTMLElement | null>, open: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const lastRef = useRef({ top: 0, left: 0, bottom: 0, width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }

    // Closing clears React state to null but keeps lastRef. Reopening on the
    // same pixel box must still publish once, or the menu stays unmounted
    // (`open && rect` is false) after an outside dismiss with no selection.
    let published = false;
    let raf = 0;
    let stableFrames = 0;

    /** @returns whether the rect actually moved. */
    const publish = (next: DOMRect): boolean => {
      const prev = lastRef.current;
      if (
        published &&
        Math.abs(next.top - prev.top) < 0.5 &&
        Math.abs(next.left - prev.left) < 0.5 &&
        Math.abs(next.bottom - prev.bottom) < 0.5 &&
        Math.abs(next.width - prev.width) < 0.5 &&
        Math.abs(next.height - prev.height) < 0.5
      ) {
        return false;
      }
      published = true;
      lastRef.current = {
        top: next.top,
        left: next.left,
        bottom: next.bottom,
        width: next.width,
        height: next.height,
      };
      setRect(next);
      return true;
    };

    const measure = (): boolean => {
      const el = anchorRef.current;
      return el ? publish(el.getBoundingClientRect()) : false;
    };

    const tick = () => {
      stableFrames = measure() ? 0 : stableFrames + 1;
      if (stableFrames >= STABLE_FRAMES_BEFORE_PARK) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      measure();
      stableFrames = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    wake();
    // capture: true so scrolling any clipped ancestor (not just the window)
    // also repositions the menu, and so a transform on an ancestor restarts
    // the loop for as long as it is running.
    window.addEventListener('scroll', wake, true);
    window.addEventListener('resize', wake);
    window.addEventListener('transitionrun', wake, true);
    window.addEventListener('transitionend', wake, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', wake, true);
      window.removeEventListener('resize', wake);
      window.removeEventListener('transitionrun', wake, true);
      window.removeEventListener('transitionend', wake, true);
    };
  }, [open, anchorRef]);

  return rect;
}
