import { COMPOSITION_HAND_FINGERS } from '../../utils/composition';
import styles from './CompositionMosaic.module.css';

interface CompositionMosaicProps {
  nails: ReadonlyArray<{ finger: string; photo: string | null }>;
  /** Accessible name of the whole picture (the set title). */
  alt: string;
  className?: string;
  /** Fingers whose cell also receives `markedClassName` (a size this nail
   * is not made in, on the size-request dialog). */
  markedFingers?: ReadonlySet<string>;
  markedClassName?: string;
}

/** The picture of a composed set wherever a product photo would go (cart
 * drawer, cart page, order history): two rows of five, left hand pinky to
 * thumb then right hand thumb to pinky, each cell the nail on that finger or
 * an empty slot. Same order as the composer's hands block and carousel, so
 * the set reads the same everywhere. */
export function CompositionMosaic({
  nails,
  alt,
  className,
  markedFingers,
  markedClassName,
}: CompositionMosaicProps) {
  const byFinger = new Map(nails.map((nail) => [nail.finger, nail.photo]));
  const cellClass = (finger: string, empty: boolean) =>
    [styles.cell, empty && styles.empty, markedFingers?.has(finger) && markedClassName]
      .filter(Boolean)
      .join(' ');
  return (
    <div className={className ? `${styles.mosaic} ${className}` : styles.mosaic} role="img" aria-label={alt}>
      {(['left', 'right'] as const).map((hand) => (
        <div key={hand} className={styles.row}>
          {COMPOSITION_HAND_FINGERS[hand].map((finger) => {
            const photo = byFinger.get(finger);
            if (photo) {
              return (
                <img
                  loading="lazy"
                  decoding="async"
                  key={finger}
                  className={cellClass(finger, false)}
                  src={photo}
                  alt=""
                  draggable={false}
                />
              );
            }
            return <span key={finger} className={cellClass(finger, !byFinger.has(finger))} />;
          })}
        </div>
      ))}
    </div>
  );
}
