import type { CartComposition } from '../../api/cart';
import { useLang } from '../../assets/i18n';
import { formatPrice } from '../../utils/formatPrice';
import { Chip } from '../ui/Chip';
import { CompositionMosaic } from '../compose/CompositionMosaic';
import styles from './CartControl.module.css';

interface CartDrawerCompositionLinesProps {
  compositions: CartComposition[];
  hidePrices: boolean;
  /** Gift receiver who may not change the basket, or another composition
   * being edited — either way the remove control is gone. */
  canRemove: boolean;
  onRemove: (id: string) => void;
}

/** Composed nail sets in the header drawer: one line each, like a catalogue
 * line (picture, title, quantity, size, total), never one line per nail. The
 * picture is the whole set (CompositionMosaic); every nail's detail is on the
 * cart page. */
export function CartDrawerCompositionLines({
  compositions,
  hidePrices,
  canRemove,
  onRemove,
}: CartDrawerCompositionLinesProps) {
  const { t } = useLang();
  if (compositions.length === 0) return null;

  return (
    <ul className={styles.drawerList}>
      {compositions.map((composition) => {
        const lineTotal = composition.unitPrice * composition.quantity;
        return (
          <li
            key={composition.id}
            className={`${styles.drawerLine} ${styles.drawerLineComposition}`}
            data-testid="drawer-composition"
          >
            <div className={styles.drawerCompositionPicture}>
              <CompositionMosaic nails={composition.nails} alt={t.galleryNail.compositionTitle} />
            </div>
            <div className={styles.drawerLineHead}>
              <div className={styles.drawerLineHeading}>
                <p className={styles.drawerLineTitle}>{t.galleryNail.compositionTitle}</p>
                <p className={styles.drawerItemRefUnderTitle}>
                  {t.galleryNail.nailCount
                    .replace('{count}', String(composition.nails.length))
                    .replace('{max}', '10')}
                </p>
                {!composition.available && (
                  <p className={styles.drawerCompositionWarning}>{t.cart.outOfStockNotice}</p>
                )}
              </div>
              {!hidePrices && (
                <span className={styles.drawerLineUnitPrice}>{formatPrice(composition.unitPrice)}</span>
              )}
            </div>
            <div className={`${styles.drawerVariantList} ${styles.drawerCompositionVariants}`}>
              <div className={styles.drawerVariantRow}>
                <span className={styles.drawerVariantText}>{composition.quantity} ×</span>
                <Chip className={styles.drawerVariantChip}>{composition.size}</Chip>
                {!hidePrices && <span className={styles.drawerVariantPrice}>{formatPrice(lineTotal)}</span>}
                {canRemove && (
                  <button
                    type="button"
                    className={styles.drawerVariantRemove}
                    onClick={() => onRemove(composition.id)}
                    aria-label={t.cart.deleteButton}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path
                        d="M2 3.5H12M5.4 3.5V2.2C5.4 1.9 5.6 1.7 5.9 1.7H8.1C8.4 1.7 8.6 1.9 8.6 2.2V3.5M3.6 3.5 4.1 11.9C4.1 12.2 4.4 12.4 4.6 12.4H9.4C9.7 12.4 9.9 12.2 9.9 11.9L10.4 3.5"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
