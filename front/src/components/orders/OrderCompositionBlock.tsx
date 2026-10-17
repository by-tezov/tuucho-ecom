import type { Strings } from '../../assets/i18n/types';
import type { OrderCompositionNail } from '../../api/orders';
import { formatPrice } from '../../utils/formatPrice';
import { Chip } from '../ui/Chip';
import { CompositionMosaic } from '../compose/CompositionMosaic';
import { COMPOSITION_HAND_FINGERS, sortByDisplayFinger } from '../../utils/composition';
import cartStyles from '../cart/CartFeature.module.css';
import compositionStyles from '../cart/CompositionCartBlock.module.css';
import { CompositionNailName } from '../cart/CompositionNailName';
import styles from './OrdersList.module.css';
import { OrderItemComment } from './OrderItemComment';

interface OrderCompositionBlockProps {
  title: string;
  size: string;
  quantity: number;
  lineTotal: number;
  nails: OrderCompositionNail[];
  t: Strings;
  hideMoney?: boolean;
  /** Overrides the finger labels (the admin order detail passes its own). */
  fingerLabel?: (finger: string) => string;
  /** Admin lists wrap their rows in their own <li> class. */
  listItemClassName?: string | undefined;
  /** Customer note typed on the cart card. */
  comment?: string | null | undefined;
  /** Set on the admin screen: the note is shown open under this label
   * instead of behind the customer page's reveal link. */
  commentLabel?: string | undefined;
}

/** One composed nail set on an order: the same card as OrderItemGroup —
 * photo column, title + unit price, one variant row — with the fabrication
 * list of its nails under it. Never one order line per nail. */
export function OrderCompositionBlock({
  title,
  size,
  quantity,
  lineTotal,
  nails,
  t,
  hideMoney = false,
  fingerLabel,
  listItemClassName,
  comment,
  commentLabel,
}: OrderCompositionBlockProps) {
  const resolveFinger = (finger: string) =>
    fingerLabel?.(finger) ?? t.galleryNail.fingers[finger as keyof typeof t.galleryNail.fingers] ?? finger;
  const unitPrice = quantity > 0 ? lineTotal / quantity : lineTotal;

  return (
    <li
      className={`${listItemClassName ?? styles.item} ${compositionStyles.lineComposition}`}
      data-testid="order-composition"
    >
      <div className={cartStyles.photoCol}>
        <CompositionMosaic nails={nails} alt={title} />
      </div>
      <div className={cartStyles.lineBody}>
        <div className={cartStyles.lineHeading}>
          <div className={cartStyles.titlePriceRow}>
            <p className={`${cartStyles.lineTitle} ${styles.orderItemTitle}`}>{title}</p>
            {!hideMoney && <span className={cartStyles.lineUnitPrice}>· {formatPrice(unitPrice)}</span>}
          </div>
          <p className={cartStyles.itemRefUnderTitle}>
            {t.galleryNail.nailCount.replace('{count}', String(nails.length)).replace('{max}', '10')}
          </p>
        </div>
        <div className={cartStyles.variantList}>
          <div className={`${cartStyles.variantRow} ${cartStyles.variantRowSolo}`}>
            <span className={cartStyles.variantText}>{quantity} ×</span>
            <Chip className={cartStyles.variantSizeChip}>{size}</Chip>
            {!hideMoney && <span className={cartStyles.variantPrice}>{formatPrice(lineTotal)}</span>}
          </div>
        </div>
      </div>
      {/* Full card width, from the photo's left edge (same as the cart). */}
      <div className={compositionStyles.compositionDetails}>
        {(['left', 'right'] as const).map((hand) => {
          const handNails = sortByDisplayFinger(nails).filter((nail) =>
            (COMPOSITION_HAND_FINGERS[hand] as readonly string[]).includes(nail.finger),
          );
          if (handNails.length === 0) return null;
          return (
            <div key={hand} className={compositionStyles.compositionHand}>
              <p className={compositionStyles.compositionHandTitle}>
                {hand === 'left' ? t.galleryNail.handLeft : t.galleryNail.handRight}
              </p>
              <ul className={compositionStyles.compositionNails}>
                {handNails.map((nail) => (
                  <li
                    key={`${nail.finger}-${nail.productId}`}
                    className={compositionStyles.compositionNailRow}
                  >
                    {nail.photo ? (
                      <img
                        loading="lazy"
                        decoding="async"
                        src={nail.photo}
                        alt=""
                        className={compositionStyles.compositionNailPhoto}
                      />
                    ) : (
                      <div
                        className={`${compositionStyles.compositionNailPhoto} ${styles.photoMissing}`}
                        aria-hidden="true"
                      />
                    )}
                    <div className={compositionStyles.compositionNailText}>
                      <CompositionNailName title={nail.title} />
                      <p className={compositionStyles.compositionNailMeta}>{resolveFinger(nail.finger)}</p>
                      <p className={compositionStyles.compositionNailMeta}>
                        {nail.shapeLabel} · {nail.lengthLabel}
                      </p>
                      {nail.variationLabel && (
                        <p className={compositionStyles.compositionNailMeta}>
                          {nail.variationAxisLabel
                            ? `${nail.variationAxisLabel} : ${nail.variationLabel}`
                            : nail.variationLabel}
                        </p>
                      )}
                      {nail.productUid && (
                        <p className={compositionStyles.compositionNailRef}>
                          {t.cart.referenceLabel} {nail.productUid}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <OrderItemComment
        t={t}
        comment={comment}
        {...(commentLabel !== undefined ? { label: commentLabel } : {})}
      />
    </li>
  );
}
