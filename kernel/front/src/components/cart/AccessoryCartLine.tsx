import { useRef, useState } from 'react';
import type { CartItem } from '../../api/cart';
import type { Strings } from '../../assets/i18n/types';
import type { ProductById } from '../../api/gallery';
import { useFitOneLineTitle } from '../../hooks/useFitOneLineTitle';
import { useSiblingsWrapped } from '../../hooks/useSiblingsWrapped';
import { formatPrice } from '../../utils/formatPrice';
import { QuantityControl } from '../ui/QuantityControl';
import { Chip } from '../ui/Chip';
import { FavoriteOrRemoveModal } from './FavoriteOrRemoveModal';
import { ItemPreviewRow } from './ItemPreviewRow';
import {
  accessoryBudgetQtyMax,
  accessoryLinePhoto,
  accessoryLineTotal,
  costFitsRemaining,
  packQtyMax,
  resolvePackPrice,
  sellablePackKeys,
} from '../../utils/accessoryPacks';
import { quantityAvailableToLine } from '../../utils/availability';
import styles from './CartFeature.module.css';

const TITLE_FIT_MQ = '(max-width: 1023px)';

interface AccessoryCartLineProps {
  product: ProductById;
  item: CartItem;
  t: Strings;
  onUpdateQuantity: (quantity: number) => void;
  onChangePackKey?: (packKey: string) => void;
  onRequestRemoval: () => void;
  onDelete: () => Promise<void>;
  /** Return true when the parent already handled delete (skip the line-remove dialog). */
  onRequestDelete?: () => boolean;
  hidePrices?: boolean;
  budgetRemaining?: number | null;
  /** Gift cart locked edition — hide qty/delete; keep priced card (not the free-rule gold style). */
  readOnly?: boolean;
  /** Credit this line's quantity back onto public stock (gift hold). */
  creditHeldStock?: boolean;
}

/** Simple cart card for accessories — title, one photo, price, qty, remove.
 * No shape/size picker (accessories have empty shapeKey/size). Locked gift
 * lines (origin=rule) render as a gold Free card without qty/remove. */
export function AccessoryCartLine({
  product,
  item,
  t,
  onUpdateQuantity,
  onChangePackKey,
  onRequestRemoval,
  onDelete,
  onRequestDelete,
  hidePrices = false,
  budgetRemaining = null,
  readOnly = false,
  creditHeldStock = false,
}: AccessoryCartLineProps) {
  const [dialog, setDialog] = useState<'delete' | null>(null);
  // Guards against a double-submit only — the line disappears optimistically,
  // so removing from the cart never blocks behind a dialog.
  const [removing, setRemoving] = useState(false);
  const titleRef = useRef<HTMLParagraphElement | null>(null);
  useFitOneLineTitle(titleRef, product.title, TITLE_FIT_MQ);
  const quantityWrapRef = useRef<HTMLDivElement | null>(null);
  const packChipsRef = useRef<HTMLDivElement | null>(null);
  // Mobile only (gated in CSS): when the pack-size chips can't share the row
  // with the quantity stepper, they wrap above it instead of below — but
  // only once they've actually wrapped, so a row with room to spare keeps
  // the quantity stepper on the left as usual.
  const rowWrapped = useSiblingsWrapped(quantityWrapRef, packChipsRef);

  async function handleConfirmDelete() {
    if (removing) return;
    setDialog(null);
    setRemoving(true);
    try {
      await onDelete();
    } finally {
      setRemoving(false);
    }
  }

  const locked = item.origin === 'rule';
  const packKey = item.packKey ?? '';
  const byQuantity = product.accessoryType === 'byQuantity';
  const photo = accessoryLinePhoto(product, packKey);
  const unitPrice = resolvePackPrice(product, packKey);
  const publicMax = packQtyMax(product, packKey);
  const stockMax = quantityAvailableToLine(
    publicMax,
    item.quantity,
    creditHeldStock || readOnly || item.locked === true,
  );
  const quantity = locked || readOnly ? item.quantity : Math.min(item.quantity, stockMax);
  const budgetMax = accessoryBudgetQtyMax(product, packKey, quantity, budgetRemaining);
  const maxQuantity =
    locked || readOnly ? stockMax : quantityAvailableToLine(budgetMax, item.quantity, creditHeldStock);
  const lineTotal = accessoryLineTotal(product, packKey, quantity);
  const outOfStock = !locked && stockMax === 0;
  const refLabel = `${t.cart.referenceLabel} ${product.productUid}`;
  const stockPackKeys = sellablePackKeys(product);
  const budgetPool = typeof budgetRemaining === 'number' ? budgetRemaining + (lineTotal ?? 0) : null;
  const affordablePackKeys =
    budgetPool == null
      ? stockPackKeys
      : stockPackKeys.filter((key) => {
          const price = resolvePackPrice(product, key);
          return price !== undefined && costFitsRemaining(price * quantity, budgetPool);
        });
  const visiblePackKeys =
    packKey && !affordablePackKeys.includes(packKey) ? [...affordablePackKeys, packKey] : affordablePackKeys;

  if (locked) {
    return (
      <li
        className={`${styles.line} ${styles.lineOffer}`}
        data-testid="cart-accessory-line"
        data-product-uid={product.productUid}
        data-origin="rule"
      >
        <div className={styles.photoCol}>
          {photo && (
            <img
              loading="lazy"
              decoding="async"
              src={photo}
              alt={product.title}
              className={styles.photo}
              draggable={false}
            />
          )}
        </div>
        <div className={styles.lineBody}>
          <div className={styles.lineOfferTitleRow}>
            <div className={styles.lineHeading}>
              <p ref={titleRef} className={styles.lineTitle}>
                {product.title}
              </p>
              <p className={styles.itemRefUnderTitle}>{refLabel}</p>
            </div>
          </div>
          {product.desc ? <p className={styles.lineDesc}>{product.desc}</p> : null}
        </div>
        <div className={styles.giftMeta}>
          <div className={`${styles.variantRow} ${styles.variantRowSolo}`}>
            <span className={styles.variantText}>
              <span className={styles.giftQty}>{quantity}</span>
              {' × '}
              {t.cart.rulesGiftIncluded}
            </span>
            <span className={styles.variantPriceFree}>{t.cart.rulesFreePrice}</span>
          </div>
        </div>
        <span className={styles.giftBadge}>{t.cart.rulesGiftBadge}</span>
      </li>
    );
  }

  return (
    <li
      className={`${styles.line} ${styles.accessoryLine}`}
      data-testid="cart-accessory-line"
      data-product-uid={product.productUid}
      data-origin="user"
    >
      {!readOnly && (
        <button
          type="button"
          className={styles.deleteIconButton}
          aria-label={t.cart.deleteButton}
          disabled={removing}
          onClick={() => {
            if (onRequestDelete?.()) return;
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
            alt={product.title}
            className={styles.photo}
            draggable={false}
          />
        )}
      </div>

      <div className={styles.lineBody}>
        <div className={styles.lineHeading}>
          <div className={styles.titlePriceRow}>
            <p ref={titleRef} className={styles.lineTitle}>
              {product.title}
            </p>
            {unitPrice !== undefined && !hidePrices && (
              <span className={styles.lineUnitPrice}>· {formatPrice(unitPrice)}</span>
            )}
          </div>
          <p className={styles.itemRefUnderTitle}>{refLabel}</p>
          {product.desc ? <p className={styles.lineDesc}>{product.desc}</p> : null}
        </div>
        <div className={styles.variantList}>
          <div
            className={[styles.variantRow, styles.variantRowSolo, rowWrapped && styles.accessoryRowWrapped]
              .filter(Boolean)
              .join(' ')}
          >
            <div ref={quantityWrapRef} className={styles.accessoryQuantityControl}>
              <QuantityControl
                value={quantity}
                max={maxQuantity}
                allowZero
                onChange={onUpdateQuantity}
                onZero={onRequestRemoval}
                ariaLabel={t.cart.quantityLabel}
                decreaseAria={t.cart.qtyDecreaseAria}
                increaseAria={t.cart.qtyIncreaseAria}
                disabled={outOfStock || removing || readOnly}
              />
            </div>
            {byQuantity && visiblePackKeys.length > 0 ? (
              <div ref={packChipsRef} className={`${styles.variantChips} ${styles.accessoryPackChips}`}>
                {visiblePackKeys.map((key) => (
                  <Chip
                    key={key}
                    className={styles.variantPackChip}
                    active={key === packKey}
                    onClick={readOnly || !onChangePackKey ? undefined : () => onChangePackKey(key)}
                  >
                    {product.packLabels?.[key] ?? key}
                  </Chip>
                ))}
              </div>
            ) : null}
            {lineTotal !== undefined && !hidePrices && (
              <span className={styles.variantPrice}>{formatPrice(lineTotal)}</span>
            )}
          </div>
          {outOfStock && <p className={styles.notice}>{t.cart.outOfStockNotice}</p>}
        </div>
      </div>

      {dialog && (
        <FavoriteOrRemoveModal
          t={t}
          title={t.cart.deleteLineTitle}
          text={t.cart.deleteLineOnlyText}
          preview={<ItemPreviewRow photo={photo} alt={product.title} title={product.title} />}
          onRemove={() => void handleConfirmDelete()}
          onCancel={() => setDialog(null)}
        />
      )}
    </li>
  );
}
