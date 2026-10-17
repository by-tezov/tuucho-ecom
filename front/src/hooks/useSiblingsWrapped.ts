import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * True once `b` renders on a different visual line than `a` (compares
 * offsetTop) — order-independent, so it stays correct whichever of the two
 * a caller visually reorders via CSS `order` once wrapped is true. Used to
 * gate a wrap-only reorder: measuring the two nodes' identity (not their
 * current position) means the reorder can't cause the measurement to flip
 * back and forth once applied.
 */
export function useSiblingsWrapped(
  aRef: RefObject<HTMLElement | null>,
  bRef: RefObject<HTMLElement | null>,
): boolean {
  const [wrapped, setWrapped] = useState(false);

  useLayoutEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;

    let raf = 0;
    const measure = () => {
      if (!a.isConnected || !b.isConnected) return;
      setWrapped(a.offsetTop !== b.offsetTop);
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    scheduleMeasure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasure) : null;
    ro?.observe(a);
    ro?.observe(b);
    const parent = a.parentElement;
    if (parent) ro?.observe(parent);
    window.addEventListener('resize', scheduleMeasure);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [aRef, bRef]);

  return wrapped;
}
