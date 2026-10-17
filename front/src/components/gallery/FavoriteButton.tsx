import { useLang } from '../../assets/i18n';
import { useGalleryFavorites } from '../../hooks/useGalleryFavorites';
import { useOptionalGiftReceiver } from '../../hooks/useGiftReceiver';
import styles from './FavoriteButton.module.css';

interface FavoriteButtonProps {
  itemId: string;
  /** The shape tab currently showing — recorded alongside the favorite so
   * reopening it later restores this tab instead of the set's default one. */
  shapeKey: string;
  /** The active length within that shape, recorded with it. No length UI
   * exists yet, so callers pass the shape's default. */
  lengthKey: string;
  /** Single nail variation option to remember; `''` otherwise. */
  variationKey?: string;
  /** 'flush' (default) sits corner-mounted, clipped to the card's own
   * radius. 'floating' is the same corner tab at the larger card size with
   * a light background (paired with GalleryCard / NewArrivalCard's dark
   * zoom twin on the opposite corner). */
  variant?: 'flush' | 'floating' | undefined;
  className?: string | undefined;
  'data-testid'?: string;
}

export function FavoriteButton({
  itemId,
  shapeKey,
  lengthKey,
  variationKey = '',
  variant = 'flush',
  className,
  'data-testid': dataTestId,
}: FavoriteButtonProps) {
  const { t } = useLang();
  const gift = useOptionalGiftReceiver();
  const { isFavorite, toggleFavorite } = useGalleryFavorites();
  const active = isFavorite(itemId);
  if (gift.active) return null;
  // Card corner tabs use the larger hit target / icon; flush stays compact.
  const iconSize = variant === 'floating' ? 23 : 15;

  return (
    <button
      type="button"
      data-testid={dataTestId}
      className={[
        styles.button,
        variant === 'floating' && styles.floating,
        active && styles.active,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      // A card sitting at the edge of the viewport (only partially visible)
      // is the common case for this button — it's the first thing someone
      // scrolling the grid clicks. Mouse-focusing it would otherwise trigger
      // the browser's native "scroll the newly focused element fully into
      // view" behavior, which reads as the whole page jumping the instant
      // you click a heart. Suppressing focus-on-mousedown avoids that while
      // keeping keyboard activation (Tab + Enter/Space) focusing normally.
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(itemId, shapeKey, lengthKey, variationKey);
      }}
      aria-pressed={active}
      aria-label={active ? t.gallery.favoriteRemove : t.gallery.favoriteAdd}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 14 14" fill="none" aria-hidden="true">
        {active ? (
          <path
            d="M7 12.1 2.45 7.55C1.35 6.45 1.35 4.65 2.45 3.55 3.55 2.45 5.35 2.45 6.45 3.55L7 4.1l.55-.55c1.1-1.1 2.9-1.1 4 0 1.1 1.1 1.1 2.9 0 4L7 12.1Z"
            fill="currentColor"
          />
        ) : (
          <path
            d="M7 11.6 2.95 7.55C2.05 6.65 2.05 5.15 2.95 4.25 3.85 3.35 5.35 3.35 6.25 4.25L7 5l.75-.75c.9-.9 2.4-.9 3.3 0 .9.9.9 2.4 0 3.3L7 11.6Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}
