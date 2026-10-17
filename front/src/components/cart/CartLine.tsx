import { Fragment, useEffect, useRef, useState } from 'react';
import type { CartItem, Size } from '../../api/cart';
import type { Strings } from '../../assets/i18n/types';
import type { GalleryItem } from '../../data/types';
import { useAuthSession } from '../../state/AuthContext';
import { useFitOneLineTitle } from '../../hooks/useFitOneLineTitle';
import { useSubmitProductRequest } from '../../hooks/useProductRequest';
import type { CartSizePickerRestore } from '../../hooks/useCartSizePickerRestore';
import { availableQuantityFor, availableSizesFor, quantityAvailableToLine } from '../../utils/availability';
import { formatPrice } from '../../utils/formatPrice';
import { Chip } from '../ui/Chip';
import { QuantityControl } from '../ui/QuantityControl';
import { SelectionPickerModal } from './SelectionPickerModal';
import { VariantAxisModal } from './VariantAxisModal';
import { OutOfStockModal } from './OutOfStockModal';
import { FavoriteOrRemoveModal } from './FavoriteOrRemoveModal';
import { ItemPreviewRow } from './ItemPreviewRow';
import { lengthAfterShapeChange } from '../../data/galleryShape';
import { CartItemComment } from './CartItemComment';
import commentStyles from './CartItemComment.module.css';
// Shares CartPage's own stylesheet rather than duplicating these rules —
// this used to be inlined directly in CartPage.tsx's render.
import styles from './CartFeature.module.css';

const SIZES: Size[] = ['XS', 'S', 'M', 'L'];
/** Match CartFeature.module.css mobile breakpoint for title fitting. */
const TITLE_FIT_MQ = '(max-width: 1023px)';

interface CartLineProps {
  set: GalleryItem;
  /** Shape this card represents — one card per set+shape+length; size lines
   * only appear as variants (see groupCartLinesByShape). */
  shapeKey: string;
  /** Length this card represents. Part of the card's identity but never
   * shown — there's no length UI yet. */
  lengthKey: string;
  /** Size lines for this set+shape+length. */
  variants: CartItem[];
  t: Strings;
  onUpdateQuantity: (item: CartItem, quantity: number) => void;
  /** Size badge opens SelectionPickerModal — size is part of line identity.
   * `quantity` is only ever set from that modal's own picker (New item /
   * Replace); every other caller (shape change) omits it and keeps the
   * line's existing count. */
  onAddAsNewLine: (
    item: CartItem,
    patch: Partial<{ shapeKey: string; lengthKey: string; size: Size; quantity: number }>,
  ) => void;
  onReplaceLine: (
    item: CartItem,
    patch: Partial<{ shapeKey: string; lengthKey: string; size: Size; quantity: number }>,
  ) => void;
  /** Change shape or length for every size line on this card at once — see
   * VariantAxisModal for how each line's quantity/size gets resolved
   * against the new shape/length before this fires. */
  onReplaceGroupVariant: (
    axis: 'shape' | 'length',
    newKey: string,
    mode: 'new' | 'replace',
    resolvedLines: Array<{ originalSize: string; newSize: string; quantity: number }>,
  ) => void;
  onRequestRemoval: (item: CartItem) => void;
  /** Drops one size line outright, no confirmation dialog — the
   * out-of-stock modal already put "remove it" next to its alternative,
   * so asking again would only add a second click to a decision the
   * customer just made. */
  onRemoveVariant: (item: CartItem) => void;
  onDeleteGroup: () => void;
  /** Return true when the parent already handled delete (skip the line-remove dialog). */
  onRequestDeleteGroup?: () => boolean;
  onMoveGroupToWishlist: () => void;
  /** Wish lists belong to an account, so guests only see removal actions. */
  canMoveToWishlist: boolean;
  isWishlistCart: boolean;
  /** Gift cart locked edition — hide qty, shape, delete, wishlist. */
  readOnly?: boolean;
  /** Credit this line's quantity back onto public stock (gift hold). */
  creditHeldStock?: boolean;
  /** Set only on the one card matching a pending size-picker restore (see
   * CartPage) — reopen the size picker for this size on mount. */
  restoreSizePicker?: CartSizePickerRestore | null;
  onSizePickerRestored?: () => void;
  /** Saves the card's note ('' removes it). Omitted, the card has no note
   * (gift receiver's cart). */
  onSaveComment?: (comment: string) => void;
}

/** One set+shape+length cart card. Size options are editable per row; shape
 * is the card identity (label above photo) and changing it moves every size
 * line in the group. Stock display is always clamped to the row's own
 * shape+length+size. */
export function CartLine({
  set,
  shapeKey,
  lengthKey,
  variants,
  t,
  onUpdateQuantity,
  onAddAsNewLine,
  onReplaceLine,
  onReplaceGroupVariant,
  onRequestRemoval,
  onRemoveVariant,
  onDeleteGroup,
  onRequestDeleteGroup,
  onMoveGroupToWishlist,
  canMoveToWishlist,
  isWishlistCart,
  readOnly = false,
  creditHeldStock = false,
  restoreSizePicker,
  onSizePickerRestored,
  onSaveComment,
}: CartLineProps) {
  const { status, user } = useAuthSession();
  const submitProductRequest = useSubmitProductRequest();
  const shapeKeys = Object.keys(set.shape);
  const shapeLabel = set.shape[shapeKey] ?? shapeKey;
  const lengthKeys = Object.keys(set.lengthsByShape[shapeKey] ?? {});
  const lengthLabel = set.lengthsByShape[shapeKey]?.[lengthKey] ?? lengthKey;
  const [picker, setPicker] = useState<
    { item: CartItem; axis: 'size' } | { axis: 'shape' | 'length' } | null
  >(null);
  const [dialog, setDialog] = useState<'favorite' | 'delete' | null>(null);
  /** Which size line's "no longer in stock" notice was clicked. */
  const [outOfStockItem, setOutOfStockItem] = useState<CartItem | null>(null);
  const photo = set.photosByShapeLength[shapeKey]?.[lengthKey]?.[0]?.small;
  const comment = variants.find((item) => item.comment)?.comment ?? '';
  const showComment = onSaveComment !== undefined && (!readOnly || comment !== '');
  const titleRef = useRef<HTMLParagraphElement | null>(null);
  useFitOneLineTitle(titleRef, set.title, TITLE_FIT_MQ);

  // Reopen after a visitor follows a real-route link from inside the size
  // picker (Guide des tailles) and comes back — see useCartSizePickerRestore.
  // Only the one card (set+shape+length) matching the restored line reopens
  // it, on the matching size's variant.
  useEffect(() => {
    if (!restoreSizePicker) return;
    if (
      restoreSizePicker.productId !== set.id ||
      restoreSizePicker.shapeKey !== shapeKey ||
      restoreSizePicker.lengthKey !== lengthKey
    ) {
      return;
    }
    const item = variants.find((variant) => variant.size === restoreSizePicker.size);
    if (!item) return;
    setPicker({ item, axis: 'size' });
    onSizePickerRestored?.();
  }, [restoreSizePicker, set, shapeKey, lengthKey, variants, onSizePickerRestored]);

  // Tags this card's own history entry (the one the size picker's own
  // useHistoryBackClose just pushed, see SelectionPickerModal) with which
  // line/size it's showing. A link inside it to a real route (Guide des
  // tailles) pushes its own entry on top rather than being swallowed —
  // useHistoryBackClose's own doc comment calls this out deliberately.
  // That means coming back from it lands on *this* entry, and CartPage's
  // useCartSizePickerRestore reads this payload from history.state on
  // mount to reopen the same picker instead of showing a bare cart.
  // replaceState, not pushState — same entry, just annotated.
  useEffect(() => {
    if (picker?.axis !== 'size') return;
    const state = window.history.state as Record<string, unknown> | null;
    window.history.replaceState(
      {
        ...(state ?? {}),
        cartSizePickerProductId: set.id,
        cartSizePickerShapeKey: shapeKey,
        cartSizePickerLengthKey: lengthKey,
        cartSizePickerSize: picker.item.size,
      },
      '',
    );
  }, [picker, set.id, shapeKey, lengthKey]);

  function moveGroupToWishlist() {
    onMoveGroupToWishlist();
    setDialog(null);
  }

  /** Asks the workshop to make a sold-out size — from the size picker's own
   * request step (SelectionPickerModal) or the out-of-stock notice. The
   * caller passes the quantity: the out-of-stock notice is about this exact
   * line, so it asks for as many as the line holds, while the size picker is
   * a switch to a size the customer never had a count for. */
  function requestSizeToBeMade(
    item: CartItem,
    size: string,
    quantity: number,
    email: string,
    comment?: string,
  ) {
    return submitProductRequest(
      {
        productId: item.productId,
        shapeKey: item.shapeKey,
        lengthKey: item.lengthKey,
        size: size as Size,
        quantity,
        ...(comment ? { comment } : {}),
      },
      email,
    );
  }

  return (
    <li
      className={showComment ? `${styles.line} ${commentStyles.lineWithComment}` : styles.line}
      data-testid="cart-line"
      data-product-uid={set.productUid}
      data-shape-key={shapeKey}
    >
      {!readOnly && (
        <button
          type="button"
          className={styles.deleteIconButton}
          aria-label={t.cart.deleteButton}
          onClick={() => {
            if (onRequestDeleteGroup?.()) return;
            setDialog('delete');
          }}
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
        {photo && (
          <img
            loading="lazy"
            decoding="async"
            src={photo}
            alt={set.title}
            className={styles.photo}
            draggable={false}
          />
        )}
        {canMoveToWishlist && !isWishlistCart && !readOnly && (
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
            <p ref={titleRef} className={styles.lineTitle}>
              {set.title}
            </p>
            {set.price !== undefined && (
              <span className={styles.lineUnitPrice}>· {formatPrice(set.price)}</span>
            )}
          </div>
          <p className={styles.itemRefUnderTitle}>
            {t.cart.referenceLabel} {set.productUid}
          </p>
          <div className={styles.variantAxisRow}>
            <Chip
              className={styles.variantShapeChip}
              {...(!readOnly && shapeKeys.length > 1 ? { onClick: () => setPicker({ axis: 'shape' }) } : {})}
            >
              {shapeLabel}
              {!readOnly && shapeKeys.length > 1 && (
                <span aria-hidden="true" className={styles.variantAxisCaret}>
                  ⌄
                </span>
              )}
            </Chip>
            <span aria-hidden="true"> - </span>
            <Chip
              className={styles.variantShapeChip}
              {...(!readOnly && lengthKeys.length > 1
                ? { onClick: () => setPicker({ axis: 'length' }) }
                : {})}
            >
              {lengthLabel}
              {!readOnly && lengthKeys.length > 1 && (
                <span aria-hidden="true" className={styles.variantAxisCaret}>
                  ⌄
                </span>
              )}
            </Chip>
          </div>
          {set.desc ? <p className={`${styles.lineDesc} ${styles.lineDescDesktop}`}>{set.desc}</p> : null}
        </div>
        <div className={styles.variantList}>
          {variants.map((item) => {
            if (item.size === '') return null;
            const publicMax = availableQuantityFor(set.available, item.shapeKey, item.lengthKey, item.size);
            const maxQuantity = quantityAvailableToLine(
              publicMax,
              item.quantity,
              creditHeldStock || item.locked === true,
            );
            const quantity = Math.min(item.quantity, maxQuantity);
            const outOfStock = maxQuantity === 0;
            return (
              <Fragment key={item.size}>
                <div
                  className={
                    variants.length === 1
                      ? `${styles.variantRow} ${styles.variantRowSolo}`
                      : styles.variantRow
                  }
                >
                  <QuantityControl
                    value={quantity}
                    max={maxQuantity}
                    allowZero
                    onChange={(next) => onUpdateQuantity(item, next)}
                    onZero={() => onRequestRemoval(item)}
                    ariaLabel={t.cart.quantityLabel}
                    decreaseAria={t.cart.qtyDecreaseAria}
                    increaseAria={t.cart.qtyIncreaseAria}
                    disabled={outOfStock || readOnly}
                  />
                  <div className={styles.variantChips}>
                    <Chip
                      className={styles.variantSizeChip}
                      {...(readOnly ? {} : { onClick: () => setPicker({ item, axis: 'size' }) })}
                    >
                      {item.size}
                    </Chip>
                  </div>
                  {set.price !== undefined && (
                    <span className={styles.variantPrice}>{formatPrice(set.price * quantity)}</span>
                  )}
                </div>
                {outOfStock && (
                  <button
                    type="button"
                    className={`${styles.notice} ${styles.noticeButton}`}
                    data-testid="cart-out-of-stock-notice"
                    onClick={() => setOutOfStockItem(item)}
                  >
                    {t.cart.outOfStockNotice}
                  </button>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {showComment && <CartItemComment t={t} comment={comment} onSave={onSaveComment} disabled={readOnly} />}

      {(picker?.axis === 'shape' || picker?.axis === 'length') && (
        <VariantAxisModal
          t={t}
          axisLabel={picker.axis === 'shape' ? t.cart.shapeLabel : t.cart.lengthLabel}
          title={picker.axis === 'shape' ? t.cart.changeShapeTitle : t.cart.changeLengthTitle}
          photo={photo}
          itemTitle={set.title}
          options={
            picker.axis === 'shape'
              ? shapeKeys.map((key) => ({
                  key,
                  label: set.shape[key] ?? key,
                  muted:
                    availableSizesFor(set.available, key, lengthAfterShapeChange(set, key, lengthKey), SIZES)
                      .length === 0,
                }))
              : lengthKeys.map((key) => ({
                  key,
                  label: set.lengthsByShape[shapeKey]?.[key] ?? key,
                  muted: availableSizesFor(set.available, shapeKey, key, SIZES).length === 0,
                }))
          }
          currentKey={picker.axis === 'shape' ? shapeKey : lengthKey}
          lines={variants
            .filter((item) => item.size !== '')
            .map((item) => ({ size: item.size, quantity: item.quantity }))}
          availableQuantityForCandidate={(candidateKey, size) =>
            picker.axis === 'shape'
              ? availableQuantityFor(
                  set.available,
                  candidateKey,
                  lengthAfterShapeChange(set, candidateKey, lengthKey),
                  size as Size,
                )
              : availableQuantityFor(set.available, shapeKey, candidateKey, size as Size)
          }
          availableSizesForCandidate={(candidateKey) =>
            picker.axis === 'shape'
              ? availableSizesFor(
                  set.available,
                  candidateKey,
                  lengthAfterShapeChange(set, candidateKey, lengthKey),
                  SIZES,
                )
              : availableSizesFor(set.available, shapeKey, candidateKey, SIZES)
          }
          onConfirm={(newKey, mode, resolvedLines) => {
            onReplaceGroupVariant(picker.axis, newKey, mode, resolvedLines);
            setPicker(null);
          }}
          onCancel={() => setPicker(null)}
        />
      )}

      {picker?.axis === 'size' && (
        <SelectionPickerModal
          t={t}
          axisLabel={t.cart.sizeLabel}
          preview={{
            photo:
              set.photosByShapeLength[picker.item.shapeKey]?.[picker.item.lengthKey]?.[0]?.small ?? photo,
            title: set.title,
            shapeLabel: set.shape[picker.item.shapeKey] ?? picker.item.shapeKey,
            lengthLabel:
              set.lengthsByShape[picker.item.shapeKey]?.[picker.item.lengthKey] ?? picker.item.lengthKey,
          }}
          options={SIZES.map((size) => ({
            key: size,
            label: size,
            muted: !availableSizesFor(
              set.available,
              picker.item.shapeKey,
              picker.item.lengthKey,
              SIZES,
            ).includes(size),
            maxQuantity: availableQuantityFor(
              set.available,
              picker.item.shapeKey,
              picker.item.lengthKey,
              size,
            ),
          }))}
          currentKey={picker.item.size}
          currentQuantity={picker.item.quantity}
          unavailableRequest={{
            accountEmail: status === 'authenticated' ? (user?.email ?? null) : null,
            submit: (size, quantity, email, comment) =>
              requestSizeToBeMade(picker.item, size, quantity, email, comment),
          }}
          onConfirm={(key, mode, quantity) => {
            const patch = { size: key as Size, quantity };
            if (mode === 'new') onAddAsNewLine(picker.item, patch);
            else onReplaceLine(picker.item, patch);
            setPicker(null);
          }}
          onCancel={() => setPicker(null)}
        />
      )}

      {outOfStockItem && (
        <OutOfStockModal
          t={t}
          photo={photo}
          title={set.title}
          shapeLabel={shapeLabel}
          lengthLabel={lengthLabel}
          size={outOfStockItem.size}
          accountEmail={status === 'authenticated' ? (user?.email ?? null) : null}
          onRequestMade={(email, comment) =>
            requestSizeToBeMade(
              outOfStockItem,
              outOfStockItem.size,
              Math.max(1, outOfStockItem.quantity),
              email,
              comment,
            )
          }
          onRemove={() => {
            onRemoveVariant(outOfStockItem);
            setOutOfStockItem(null);
          }}
          onCancel={() => setOutOfStockItem(null)}
        />
      )}

      {dialog === 'favorite' && canMoveToWishlist && !isWishlistCart && (
        <FavoriteOrRemoveModal
          t={t}
          title={t.cart.keepWishlistTitle}
          text={t.cart.keepWishlistText}
          preview={
            <ItemPreviewRow
              photo={photo}
              alt={set.title}
              title={set.title}
              shapeLabel={shapeLabel}
              lengthLabel={lengthLabel}
              sizeLabels={variants.map((item) => item.size).filter(Boolean)}
              enlarged
            />
          }
          {...(moveGroupToWishlist ? { onMoveToWishlist: moveGroupToWishlist } : {})}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'delete' && (
        <FavoriteOrRemoveModal
          t={t}
          title={t.cart.deleteLineTitle}
          text={canMoveToWishlist && !isWishlistCart ? t.cart.deleteLineText : t.cart.deleteLineOnlyText}
          preview={
            <ItemPreviewRow
              photo={photo}
              alt={set.title}
              title={set.title}
              shapeLabel={shapeLabel}
              lengthLabel={lengthLabel}
              sizeLabels={variants.map((item) => item.size).filter(Boolean)}
              enlarged
            />
          }
          {...(canMoveToWishlist && !isWishlistCart ? { onMoveToWishlist: moveGroupToWishlist } : {})}
          onRemove={() => {
            onDeleteGroup();
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </li>
  );
}
