import { useEffect, useRef, useState } from 'react';

/**
 * Releases `items` into the gallery one-by-one so card mounts (and their
 * `/media` image fetches) are spaced instead of firing as one burst when a
 * feed page arrives.
 *
 * - `delayMs <= 0`: return `items` unchanged (legacy batch mount).
 * - Append (load more): keep the matching prefix; drip only the new suffix.
 * - Filter/reset (prefix IDs change or list shrinks incompatibly): restart
 *   the drip from an empty revealed list.
 * - Initial hydrate with a full list already present: commit all immediately
 *   so prerendered markup matches (no empty flash).
 */
export function useStaggeredReveal<T extends { id: string }>(items: T[], delayMs: number): T[] {
  const [revealedCount, setRevealedCount] = useState(() => items.length);
  const prevItemsRef = useRef(items);

  useEffect(() => {
    if (delayMs <= 0) {
      prevItemsRef.current = items;
      setRevealedCount(items.length);
      return;
    }

    const prev = prevItemsRef.current;
    let common = 0;
    while (common < prev.length && common < items.length && prev[common]!.id === items[common]!.id) {
      common += 1;
    }

    prevItemsRef.current = items;

    // Prefix broken or list replaced — restart drip.
    if (common < revealedCount && common < items.length) {
      setRevealedCount(0);
      return;
    }

    // Shrunk but prefix intact (e.g. rare trim) — clamp.
    if (revealedCount > items.length) {
      setRevealedCount(items.length);
      return;
    }

    if (revealedCount >= items.length) return;

    const timer = window.setTimeout(() => {
      setRevealedCount((count) => Math.min(count + 1, items.length));
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [items, delayMs, revealedCount]);

  if (delayMs <= 0) return items;
  return items.slice(0, revealedCount);
}
