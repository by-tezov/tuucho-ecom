import { Chip } from '../ui/Chip';
import styles from '../ui/ModalShell.module.css';

interface ItemPreviewRowProps {
  photo: string | null | undefined;
  alt: string;
  title: string;
  /** Omit for accessories (no shape). */
  shapeLabel?: string;
  /** Omit when length is not shown (accessories, or callers that only pass shape). */
  lengthLabel?: string;
  /** One exact size for a line-level action, or every size when a grouped
   * set+shape card is moved as a unit. */
  sizeLabels?: string[];
  /** Match size-picker / size-request vignette (60px) and 1.5× chips.
   * Default on — every modal preview shares this size. */
  enlarged?: boolean;
  /** Optional override for the thumbnail (e.g. SizeRequestModal own styles). */
  photoClassName?: string | undefined;
  /** Optional override for shape/length/size chips. */
  chipClassName?: string | undefined;
}

/** Thumbnail + badge(s) identifying exactly which item a confirmation
 * dialog is about — FavoriteOrRemoveModal's `preview` slot. */
export function ItemPreviewRow({
  photo,
  alt,
  title,
  shapeLabel,
  lengthLabel,
  sizeLabels = [],
  enlarged = true,
  photoClassName,
  chipClassName,
}: ItemPreviewRowProps) {
  const showBadges = Boolean(shapeLabel || lengthLabel || sizeLabels.length > 0);
  const photoClass = [styles.previewPhoto, enlarged ? styles.previewPhotoEnlarged : undefined, photoClassName]
    .filter(Boolean)
    .join(' ');
  const chipClass = [enlarged ? styles.previewChipEnlarged : undefined, chipClassName]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={styles.previewRow}>
      {photo && (
        <img loading="lazy" decoding="async" src={photo} alt={alt} className={photoClass} draggable={false} />
      )}
      <div className={styles.previewDetails}>
        <p className={styles.previewTitle}>{title}</p>
        {showBadges && (
          <div className={styles.previewBadges}>
            {shapeLabel ? <Chip className={chipClass || undefined}>{shapeLabel}</Chip> : null}
            {lengthLabel ? <Chip className={chipClass || undefined}>{lengthLabel}</Chip> : null}
            {sizeLabels.map((size) => (
              <Chip key={size} className={chipClass || undefined}>
                {size}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
