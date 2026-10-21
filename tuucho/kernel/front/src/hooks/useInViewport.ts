import { useEffect, useRef, useState } from 'react';

interface UseInViewportOptions {
  /** extends the "considered near" zone beyond the actual viewport (e.g.
   * "1000px" keeps things mounted well before/after they're actually on
   * screen) — avoids visible pop-in and avoids mount/unmount thrashing on
   * ordinary scrolling. */
  rootMargin?: string;
  /** Starting value before the observer's first real reading — default
   * `true` so prerendered/first-paint markup always has real content (no
   * flash-to-placeholder before the observer has had a chance to run, and
   * nothing for crawlers, which don't run IntersectionObserver, to miss).
   * Pass `false` for a caller with no first-paint content of its own to
   * protect (e.g. an infinite-scroll trigger sentinel) — starting `true`
   * there would fire its effect immediately on mount, before the observer
   * has had any real read on the element's actual position, which for a
   * "load more" trigger means firing repeatedly back-to-back rather than
   * only once real scrolling brings it near the viewport. */
  initialInView?: boolean;
}

/**
 * Tracks whether an element is within an extended viewport margin, so a
 * caller can mount something memory-heavy (a decoded photo) only while it's
 * actually near the screen and drop it once it scrolls well away — a
 * recycler-view trade-off: bounded memory for a list of any length, at the
 * cost of a re-fetch/re-decode if the item scrolls back into range. Native
 * `loading="lazy"` alone doesn't do this: it only defers the *first* fetch,
 * it never releases an image already decoded once it's off-screen.
 */
export function useInViewport<T extends Element>({
  rootMargin = '1000px 0px',
  initialInView = true,
}: UseInViewportOptions = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(initialInView);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    // Read the *last* entry, never the first: one delivery can carry several
    // queued entries for the same target (oldest first) whenever the element
    // crosses the margin more than once before the callback gets to run —
    // routine here, since the virtualized grid's own re-render and row
    // measuring keep the main thread busy exactly while cards are crossing.
    // Taking entries[0] would apply a stale `false` and drop the newer
    // `true`, and with the element already intersecting there is no further
    // crossing left to correct it: the card stays on its skeleton, its photo
    // never requested, until scrolling it out and back forces a new crossing.
    const observer = new IntersectionObserver(
      (entries) => {
        const latest = entries[entries.length - 1];
        if (latest) setInView(latest.isIntersecting);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}
