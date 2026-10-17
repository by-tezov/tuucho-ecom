import { useEffect, useRef, useState } from 'react';
import styles from './PhotoSwapFade.module.css';

/** Longest the old photo may cover a new one that never reports its load. */
const MAX_WAIT_MS = 4000;

/**
 * Cross-fade for a photo slider whose photos are replaced under it (a shape,
 * length or option change), as opposed to swiped: the previous photo stays
 * on top of the frame and fades out once the new one has loaded, instead of
 * the frame going blank while it downloads. Rendered right after the
 * slider's track, inside its positioned frame; the new photo is found there
 * by its `data-photo-index` (on the img, or on a gated slide around it).
 */
export function PhotoSwapFade({ sources, index }: { sources: string[]; index: number }) {
  const active = sources[index];
  const [shown, setShown] = useState(active);
  const [fading, setFading] = useState<{ src: string; out: boolean } | null>(null);
  const ref = useRef<HTMLImageElement>(null);

  if (active !== shown) {
    setShown(active);
    // A swipe lands on a photo still in the set: nothing to cover.
    setFading(shown && !sources.includes(shown) ? { src: shown, out: false } : null);
  }

  useEffect(() => {
    const frame = ref.current?.parentElement;
    if (!fading || fading.out || !frame) return;
    const reveal = () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setFading((current) => (current && !reduce ? { ...current, out: true } : null));
    };
    // The index sits on the img itself, or on a gated slide's wrapper.
    const slot = `[data-photo-index="${index}"]`;
    const isNewPhoto = (el: EventTarget | Element | null) =>
      el instanceof HTMLImageElement &&
      el !== ref.current &&
      el.closest(slot) !== null &&
      el.complete &&
      el.naturalWidth > 0;
    if (isNewPhoto(frame.querySelector(`img${slot}, ${slot} img`))) {
      reveal();
      return;
    }
    const onLoad = (event: Event) => {
      if (isNewPhoto(event.target)) reveal();
    };
    frame.addEventListener('load', onLoad, true);
    const timer = window.setTimeout(reveal, MAX_WAIT_MS);
    return () => {
      frame.removeEventListener('load', onLoad, true);
      window.clearTimeout(timer);
    };
  }, [fading, index]);

  if (!fading) return null;
  return (
    <img
      ref={ref}
      src={fading.src}
      alt=""
      aria-hidden="true"
      className={fading.out ? `${styles.overlay} ${styles.out}` : styles.overlay}
      onAnimationEnd={() => setFading(null)}
      draggable={false}
    />
  );
}
