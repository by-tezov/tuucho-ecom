import { useCallback, useRef, useState, type RefObject } from 'react';

export interface ScrollHint {
  /** Content is scrolled past the top — show the up chevron. */
  up: boolean;
  /** More content below the fold — show the down chevron. */
  down: boolean;
}

/** Slack before an edge counts as "at the edge". Sub-pixel layout, zoom and
 * fractional device pixel ratios all leave scrollTop a hair off zero at rest,
 * so an exact comparison flickers the chevron on and off. */
const EDGE_SLACK_PX = 4;

export interface ScrollHintOptions<T extends HTMLElement> {
  /** OR-ed into `down`. Only the lightbox needs it: there, "more to see"
   * also covers a photo that can still collapse, which is not visible in
   * scrollTop at all. */
  extraDown?: (element: T) => boolean;
}

/**
 * The up/down scroll chevrons every scrollable modal body in this app shows.
 *
 * This exact eight-line function was copy-pasted into fourteen components —
 * byte-identical apart from the ref's name — alongside its own `useState`.
 * That made the shared part of the behaviour (which is all of it) impossible
 * to fix once: `useLockBodyScroll`'s per-touchmove cost, for instance, had to
 * be reasoned about fourteen times over.
 *
 * Deliberately only the state and the measurement. When each component runs
 * it genuinely differs — some watch a ResizeObserver on the content as well
 * as the container, some re-check after a 260 ms open animation settles, some
 * scroll back to the top first — and those differences are real, so they stay
 * where they are, visible, in the component that needs them. Call
 * `updateScrollHint` from wherever that component already did.
 */
export function useScrollHint<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: ScrollHintOptions<T> = {},
) {
  const [scrollHint, setScrollHint] = useState<ScrollHint>({ up: false, down: false });

  // Both callbacks below are returned with a stable identity so callers can
  // list them in a dependency array without the effect re-running every
  // render — which is what every call site here actually wants, and what lets
  // them satisfy exhaustive-deps honestly instead of silencing it. `options`
  // travels through a ref because `extraDown` is a fresh closure each render;
  // reading it at call time keeps the callback stable without going stale.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const updateScrollHint = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = {
      up: el.scrollTop > EDGE_SLACK_PX,
      down:
        (optionsRef.current.extraDown?.(el) ?? false) ||
        el.scrollTop + el.clientHeight < el.scrollHeight - EDGE_SLACK_PX,
    };
    // Scroll events and ResizeObserver callbacks can both run every frame.
    // The chevrons change only at their two boundaries, so preserve the old
    // object while their visible state is unchanged and avoid re-rendering an
    // entire modal during an otherwise native scroll.
    setScrollHint((current) => {
      if (current.up === next.up && current.down === next.down) return current;
      return next;
    });
  }, [ref]);

  /** Force both chevrons off without measuring. For a body that is being
   * hidden rather than scrolled — LoginMergeDialog and RebuyCartDialog both
   * leave "merge" mode with a grid that is about to unmount, and a stale
   * chevron would otherwise survive into the next view. */
  const clearScrollHint = useCallback(() => {
    setScrollHint({ up: false, down: false });
  }, []);

  return { scrollHint, updateScrollHint, clearScrollHint };
}
