import { GiftIcon } from './GiftIcon';
import styles from './GiftCornerMark.module.css';

interface GiftCornerMarkProps {
  /** Tile-sized tab (cart switcher). Default matches GalleryCard's floating favorite. */
  compact?: boolean;
}

/** Decorative top-right gift tab. Mirror of FavoriteButton's corner: flush
 * top/right so only the left and bottom edges read against the card. */
export function GiftCornerMark({ compact = false }: GiftCornerMarkProps) {
  return (
    <span
      className={[styles.mark, compact ? styles.compact : ''].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <GiftIcon size={compact ? 16 : 23} />
    </span>
  );
}
