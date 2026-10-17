import { useLayoutEffect, useRef, useState } from 'react';

/** Reads how many columns (and how wide the first one is, in px) a
 * `grid-template-columns: repeat(auto-fill, ...)` grid actually resolved to
 * at the current width — auto-fill's column
 * count isn't knowable from the CSS alone, it depends on the container's
 * real rendered width, so this reads it back from the browser via
 * getComputedStyle after layout and keeps it updated across resizes/
 * breakpoint changes via ResizeObserver. useLayoutEffect (not useEffect)
 * so the first real measurement lands before paint — no visible flash of
 * a wrong count on mount. */
export function useGridColumnCount<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [columnCount, setColumnCount] = useState(1);
  const [columnWidth, setColumnWidth] = useState(0);
  const [measured, setMeasured] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean);
      const columns = tracks.length;
      if (columns > 0) {
        setColumnCount(columns);
        setColumnWidth(Number.parseFloat(tracks[0] ?? '') || 0);
        setMeasured(true);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, columnCount, columnWidth, measured };
}
