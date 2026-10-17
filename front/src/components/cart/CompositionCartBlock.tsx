import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CartComposition, Size } from '../../api/cart';
import type { Lang, Strings } from '../../assets/i18n/types';
import { localizedPath } from '../../config/i18nRoutes';
import { formatPrice } from '../../utils/formatPrice';
import { Chip } from '../ui/Chip';
import { ConfirmModal } from '../ui/ConfirmModal';
import { QuantityControl } from '../ui/QuantityControl';
import { FavoriteOrRemoveModal } from './FavoriteOrRemoveModal';
import { ItemPreviewRow } from './ItemPreviewRow';
import { CompositionMosaic } from '../compose/CompositionMosaic';
import { SelectionPickerModal } from './SelectionPickerModal';
import { SIZES } from '../../data/sizes';
import { COMPOSITION_HAND_FINGERS, sortByDisplayFinger } from '../../utils/composition';
import { useCompositionPageEnabled } from '../../hooks/useCompositionPageEnabled';
import styles from './CartFeature.module.css';
import compositionStyles from './CompositionCartBlock.module.css';
import { CompositionNailName } from './CompositionNailName';
import { CartItemComment } from './CartItemComment';

interface CompositionCartBlockProps {
  composition: CartComposition;
  t: Strings;
  lang: Lang;
  /** Gift cart whose selection is frozen — no quantity, no removal. */
  readOnly?: boolean;
  hideMoney?: boolean;
  canMoveToWishlist?: boolean;
  /** Another composition is being edited: this one stays visible but inert. */
  cartLocked?: boolean;
  onUpdateQuantity: (quantity: number) => void;
  onUpdateSizeQuantity: (size: Size, quantity: number) => void;
  onAddCompositionAsNew: (size: Size, quantity: number) => void;
  onRemove: () => void;
  onMoveToWishlist: () => void;
  onStartEdit: () => void;
  /** Saves the set's note ('' removes it). Omitted, the set has no note
   * (gift receiver's cart). */
  onSaveComment?: (comment: string) => void;
}

/** One composed nail set in the cart. Deliberately the same `.line` card as
 * CartLine — photo column, title + unit price, one variant row with the
 * quantity, the size and the total — with the chosen nails listed under it
 * instead of a size variant list. A nail is never its own cart line. */
export function CompositionCartBlock({
  composition,
  t,
  lang,
  readOnly = false,
  hideMoney = false,
  canMoveToWishlist = true,
  cartLocked = false,
  onUpdateQuantity,
  onUpdateSizeQuantity,
  onAddCompositionAsNew,
  onRemove,
  onMoveToWishlist,
  onStartEdit,
  onSaveComment,
}: CompositionCartBlockProps) {
  const navigate = useNavigate();
  const compositionPageEnabled = useCompositionPageEnabled();
  const [dialog, setDialog] = useState<'favorite' | 'delete' | 'edit' | 'size' | null>(null);
  const editing = composition.editing;
  /** Locked by the cart, or by this card's own pending modification. */
  const locked = readOnly || cartLocked || editing;
  const lineTotal = composition.unitPrice * composition.quantity;
  const photo = composition.nails[0]?.photo ?? null;
  const editorPath = `${localizedPath('/gallery-nail', lang)}?composition=${composition.id}`;
  const comment = composition.comment ?? '';
  const previewRow = (
    <ItemPreviewRow
      photo={photo}
      alt={t.galleryNail.compositionTitle}
      title={t.galleryNail.compositionTitle}
      sizeLabels={[composition.size]}
      enlarged
    />
  );

  return (
    <li
      className={`${styles.line} ${compositionStyles.lineComposition}`}
      data-testid="cart-composition"
      data-composition-id={composition.id}
    >
      {!locked && (
        <button
          type="button"
          className={styles.deleteIconButton}
          aria-label={t.cart.deleteButton}
          onClick={() => setDialog('delete')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
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

      <div className={styles.photoCol}>
        <CompositionMosaic nails={composition.nails} alt={t.galleryNail.compositionTitle} />
        {!readOnly && !editing && !cartLocked && compositionPageEnabled !== false && (
          <button
            type="button"
            className={`${styles.addressIconButton} ${styles.addressIconButtonEdit}`}
            aria-label={t.cart.changeSelectionTitle}
            onClick={() => setDialog('edit')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M9.4 1.6 12.4 4.6 4.5 12.5H1.5V9.5L9.4 1.6Z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        {canMoveToWishlist && !locked && (
          <button type="button" className={styles.photoFavoriteButton} onClick={() => setDialog('favorite')}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 11.6 2.95 7.55C2.05 6.65 2.05 5.15 2.95 4.25 3.85 3.35 5.35 3.35 6.25 4.25L7 5l.75-.75c.9-.9 2.4-.9 3.3 0 .9.9.9 2.4 0 3.3L7 11.6Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            {t.cart.removeButton}
          </button>
        )}
      </div>

      <div className={styles.lineBody}>
        <div className={styles.lineHeading}>
          <div className={styles.titlePriceRow}>
            <p className={styles.lineTitle}>{t.galleryNail.compositionTitle}</p>
            {!hideMoney && (
              <span className={styles.lineUnitPrice}>· {formatPrice(composition.unitPrice)}</span>
            )}
          </div>
          <p className={styles.itemRefUnderTitle}>
            {t.galleryNail.nailCount
              .replace('{count}', String(composition.nails.length))
              .replace('{max}', '10')}
          </p>
        </div>

        <div className={styles.variantList}>
          <div className={`${styles.variantRow} ${styles.variantRowSolo}`}>
            <QuantityControl
              value={composition.quantity}
              max={99}
              onChange={onUpdateQuantity}
              ariaLabel={t.galleryNail.quantityLabel}
              decreaseAria={t.cart.qtyDecreaseAria}
              increaseAria={t.cart.qtyIncreaseAria}
              disabled={locked}
            />
            <div className={styles.variantChips}>
              <Chip
                className={styles.variantSizeChip}
                data-testid="cart-composition-size"
                {...(locked ? {} : { onClick: () => setDialog('size') })}
              >
                {composition.size}
              </Chip>
            </div>
            {!hideMoney && <span className={styles.variantPrice}>{formatPrice(lineTotal)}</span>}
          </div>

          {!composition.available && (
            <p className={styles.notice} data-testid="cart-composition-out-of-stock">
              {t.cart.outOfStockNotice}
            </p>
          )}
        </div>
      </div>

      {/* Full card width, from the photo's left edge: no empty column under
          the picture. */}
      <div className={compositionStyles.compositionDetails}>
        {/* Every nail, in the order the hands are drawn in the composer,
              under its hand: what exactly goes on which finger. */}
        {(['left', 'right'] as const).map((hand) => {
          const nails = sortByDisplayFinger(composition.nails).filter((nail) =>
            (COMPOSITION_HAND_FINGERS[hand] as readonly string[]).includes(nail.finger),
          );
          if (nails.length === 0) return null;
          return (
            <div key={hand} className={compositionStyles.compositionHand}>
              <p className={compositionStyles.compositionHandTitle}>
                {hand === 'left' ? t.galleryNail.handLeft : t.galleryNail.handRight}
              </p>
              <ul className={compositionStyles.compositionNails}>
                {nails.map((nail) => (
                  <li
                    key={`${nail.finger}-${nail.productId}`}
                    className={
                      nail.available
                        ? compositionStyles.compositionNailRow
                        : `${compositionStyles.compositionNailRow} ${compositionStyles.compositionNailRowUnavailable}`
                    }
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
                      <span className={compositionStyles.compositionNailPhoto} aria-hidden="true" />
                    )}
                    <div className={compositionStyles.compositionNailText}>
                      <CompositionNailName title={nail.title} />
                      <p className={compositionStyles.compositionNailMeta}>
                        {t.galleryNail.fingers[nail.finger]}
                      </p>
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

      {onSaveComment && (!locked || comment !== '') && (
        <CartItemComment t={t} comment={comment} onSave={onSaveComment} disabled={locked} />
      )}

      {dialog === 'edit' && (
        <ConfirmModal
          title={t.galleryNail.editConfirmTitle}
          message={t.galleryNail.editConfirmMessage}
          confirmLabel={t.galleryNail.editConfirmAction}
          closeLabel={t.gallery.close}
          onConfirm={() => {
            setDialog(null);
            onStartEdit();
            navigate(editorPath);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'favorite' && canMoveToWishlist && (
        <FavoriteOrRemoveModal
          t={t}
          title={t.cart.keepWishlistTitle}
          text={t.cart.keepWishlistText}
          preview={previewRow}
          onMoveToWishlist={() => {
            onMoveToWishlist();
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'size' && (
        <SelectionPickerModal
          t={t}
          axisLabel={t.cart.sizeLabel}
          preview={{ photo, title: t.galleryNail.compositionTitle, shapeLabel: '' }}
          options={SIZES.map((size) => ({ key: size, label: size, muted: false }))}
          currentKey={composition.size}
          currentQuantity={composition.quantity}
          // Never reachable — no composition size is ever `muted` — but
          // isSizePicker (unavailableRequest !== undefined) is what turns
          // on the quantity control, the size-guide link and the New
          // item/Remplacer footer, same as the catalogue set's own picker.
          unavailableRequest={{
            accountEmail: null,
            submit: () => Promise.reject(new Error('composed sets have no size request')),
          }}
          onConfirm={(key, mode, quantity) => {
            setDialog(null);
            if (mode === 'new') onAddCompositionAsNew(key as Size, quantity);
            else onUpdateSizeQuantity(key as Size, quantity);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'delete' && (
        <FavoriteOrRemoveModal
          t={t}
          title={t.cart.deleteLineTitle}
          text={canMoveToWishlist ? t.cart.deleteLineText : t.cart.deleteLineOnlyText}
          preview={previewRow}
          {...(canMoveToWishlist
            ? {
                onMoveToWishlist: () => {
                  onMoveToWishlist();
                  setDialog(null);
                },
              }
            : {})}
          onRemove={() => {
            onRemove();
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </li>
  );
}
