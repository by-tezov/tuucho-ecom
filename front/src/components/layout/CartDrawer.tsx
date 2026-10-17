import { CloseIcon } from '../ui/CloseIcon';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type TransitionEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../../assets/i18n';
import { useOptionalGiftReceiver } from '../../hooks/useGiftReceiver';
import { fetchCartRules, type ProductById, type PublicCartRule } from '../../api/gallery';
import { LazyCartDrawerCompositionLines } from './LazyCartDrawerCompositionLines';
import { CartDrawerNotice, type DrawerNotice } from './CartDrawerNotice';
import { cartDrawerTotals, quantityForDrawerLine } from '../../utils/cartDrawerTotals';
import type { CartComposition, CartItem, Size } from '../../api/cart';
import type { GalleryItem } from '../../data/types';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { accessoryLinePhoto, accessoryLineTotal, resolvePackPrice } from '../../utils/accessoryPacks';
import { formatPrice } from '../../utils/formatPrice';
import { groupDrawerLinesByProduct } from '../../utils/groupCartLines';
import { previewNailQtyTier } from '../../utils/cartRulesPreview';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { CartRulesProgress } from '../cart/CartRulesProgress';
import styles from './CartControl.module.css';
import { useScrollHint } from '../../hooks/useScrollHint';
import { useDragScroll } from '../../hooks/useDragScroll';

/** The header cart drawer, split from CartControl so it loads as its own
 * chunk (see LazyCartDrawer): it only ever renders after an add or a tap on
 * the cart, never on first paint. */
export interface CartDrawerProps {
  items: CartItem[];
  compositions: CartComposition[];
  productsById: Record<string, ProductById>;
  gallerySets: Record<string, GalleryItem>;
  notice: DrawerNotice | null;
  /** An add in flight: nothing in the drawer can be used or dismiss it. */
  busy: boolean;
  loading: boolean;
  showContinueShopping: boolean;
  creditHeldStock: boolean;
  onRemove: (productId: string, shapeKey: string, lengthKey: string, size: Size | '') => void;
  cartLocked: boolean;
  onRemoveComposition: (id: string) => void;
  onClose: () => void;
  onGoToCart: () => void;
}

export function CartDrawer({
  items,
  compositions,
  productsById,
  gallerySets,
  notice,
  busy,
  loading,
  showContinueShopping,
  creditHeldStock,
  onRemove,
  cartLocked,
  onRemoveComposition,
  onClose,
  onGoToCart,
}: CartDrawerProps) {
  const { t, lang } = useLang();
  const gift = useOptionalGiftReceiver();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listDragScroll = useDragScroll<HTMLDivElement>({ preventSelection: false });
  const closedRef = useRef(false);
  const { scrollHint, updateScrollHint } = useScrollHint(listRef);
  const [cartRules, setCartRules] = useState<PublicCartRule[]>([]);
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);

  useLockBodyScroll();

  const finishClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  }, [onClose]);

  const beginClose = useCallback(() => {
    if (closedRef.current || exiting) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishClose();
      return;
    }
    setExiting(true);
    setEntered(false);
  }, [exiting, finishClose]);

  // Platform back / X / Continuer all return to the underlying page (and
  // close a zoom modal still open behind this drawer).
  const requestClose = useHistoryBackClose(beginClose);
  const guardedClose = busy ? () => undefined : requestClose;
  useFocusTrap(dialogRef, { onEscape: guardedClose });

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setEntered(true);
      return;
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setEntered(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const id = window.setTimeout(finishClose, 400);
    return () => window.clearTimeout(id);
  }, [exiting, finishClose]);

  function onDrawerTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== 'transform') return;
    if (exiting) finishClose();
  }

  useEffect(() => {
    let cancelled = false;
    fetchCartRules(lang).then((rules) => {
      if (!cancelled) setCartRules(rules);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  // Quantity is clamped to current stock the same way CartLine.tsx (the
  // full /cart page) does — stock can have shrunk since this line was
  // added, and the drawer's total shouldn't quote more than what's still
  // actually purchasable.
  const lines = items
    .map((item) => ({ item, product: productsById[item.productId] }))
    .filter((line): line is { item: CartItem; product: ProductById } => !!line.product)
    .map((line) => ({
      ...line,
      quantity: quantityForDrawerLine(line.item, line.product, gallerySets, creditHeldStock),
      isGift: line.item.origin === 'rule',
    }))
    // Paid lines first; cart-rule gifts sit at the end (same idea as CartPage offers block).
    .sort((a, b) => Number(a.isGift) - Number(b.isGift));
  const { cartCount, subtotal, nailQty, nailSubtotal } = cartDrawerTotals(items, compositions, lines);
  const nailQtyTier = previewNailQtyTier(
    cartRules,
    nailQty,
    nailSubtotal,
    compositions
      .filter((entry) => entry.available)
      .map((entry) => ({
        quantity: entry.quantity,
        nailCount: entry.nails.length,
        lineTotal: entry.unitPrice * entry.quantity,
      })),
  );

  const groups = groupDrawerLinesByProduct(lines);
  const paidGroups = groups.filter((group) => !group.variants.every(({ item }) => item.origin === 'rule'));
  const paidNailGroups = paidGroups.filter((group) => group.product.productType !== 'accessory');
  const paidAccessoryGroups = paidGroups.filter((group) => group.product.productType === 'accessory');
  const giftGroups = groups.filter((group) => group.variants.every(({ item }) => item.origin === 'rule'));
  const hideMoney = gift.active && gift.hidePrices;
  const showOffers = giftGroups.length > 0 || (!hideMoney && nailQtyTier != null && nailQtyTier.nailQty > 0);

  function renderDrawerGroup(
    group: ReturnType<typeof groupDrawerLinesByProduct>[number],
    opts: { isGift: boolean },
  ) {
    const { key, product, shapeKey, lengthKey, shapeLabel, variants } = group;
    const isAccessory = product.productType === 'accessory';
    const packKey = variants[0]?.item.packKey ?? '';
    const photo = isAccessory
      ? accessoryLinePhoto(product, packKey)
      : (gallerySets[product.id]?.photosByShapeLength[shapeKey]?.[lengthKey]?.[0]?.small ?? product.photo);
    const label = isAccessory ? '' : (gallerySets[product.id]?.shape[shapeKey] ?? shapeLabel);
    const lengthLabel = isAccessory
      ? ''
      : (gallerySets[product.id]?.lengthsByShape[shapeKey]?.[lengthKey] ?? lengthKey);
    const unitPrice = isAccessory
      ? resolvePackPrice(product, packKey)
      : typeof product.price === 'number'
        ? product.price
        : undefined;
    return (
      <li
        key={key}
        className={opts.isGift ? `${styles.drawerLine} ${styles.drawerLineGift}` : styles.drawerLine}
      >
        <div className={styles.drawerPhotoCol}>
          {photo && (
            <img
              loading="lazy"
              decoding="async"
              src={photo}
              alt={product.title}
              className={styles.drawerLinePhoto}
            />
          )}
        </div>
        <div className={styles.drawerLineBody}>
          <div className={styles.drawerLineHead}>
            <div className={styles.drawerLineHeading}>
              <p className={styles.drawerLineTitle}>{product.title}</p>
              <p className={styles.drawerItemRefUnderTitle}>
                {t.cart.referenceLabel} {product.productUid}
              </p>
              {label ? (
                <p className={styles.drawerShapeLength}>
                  {label}
                  {lengthLabel ? ` - ${lengthLabel}` : ''}
                </p>
              ) : null}
            </div>
            {!opts.isGift && unitPrice !== undefined && !gift.hidePrices ? (
              <span className={styles.drawerLineUnitPrice}>{formatPrice(unitPrice)}</span>
            ) : null}
          </div>
          <div className={styles.drawerVariantList}>
            {variants.map(({ item, quantity }) => {
              const linePrice = isAccessory
                ? accessoryLineTotal(product, item.packKey ?? '', quantity)
                : typeof product.price === 'number'
                  ? product.price * quantity
                  : undefined;
              return (
                <div key={`${item.shapeKey}::${item.size}`} className={styles.drawerVariantRow}>
                  <span className={styles.drawerVariantText}>
                    {opts.isGift ? (
                      <>
                        <span className={styles.drawerGiftQty}>{quantity}</span>
                        {' × '}
                        {t.cart.rulesGiftIncluded}
                      </>
                    ) : (
                      <>{quantity} ×</>
                    )}
                  </span>
                  {!isAccessory && item.size !== '' && (
                    <Chip className={styles.drawerVariantChip}>{item.size}</Chip>
                  )}
                  {opts.isGift ? (
                    <span className={styles.drawerVariantFree}>{t.cart.rulesFreePrice}</span>
                  ) : (
                    linePrice !== undefined &&
                    !gift.hidePrices && (
                      <span className={styles.drawerVariantPrice}>{formatPrice(linePrice)}</span>
                    )
                  )}
                  {!opts.isGift && (!gift.active || gift.canMutate) && !cartLocked && (
                    <button
                      type="button"
                      className={styles.drawerVariantRemove}
                      onClick={() => onRemove(item.productId, item.shapeKey, item.lengthKey, item.size)}
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
              );
            })}
          </div>
        </div>
        {opts.isGift ? <span className={styles.drawerGiftBadge}>{t.cart.rulesGiftBadge}</span> : null}
      </li>
    );
  }

  // The list's own box height only moves with the drawer/window; lines
  // being added or removed changes its scrollHeight instead, which a
  // resize listener would never see — recompute directly off the data
  // that actually drives that, on top of the scroll/resize listeners.
  useLayoutEffect(() => {
    updateScrollHint();
    window.addEventListener('resize', updateScrollHint);
    return () => window.removeEventListener('resize', updateScrollHint);
  }, [lines.length, compositions.length, updateScrollHint]);

  return createPortal(
    <dialog open aria-modal="true" aria-label={t.cart.pageTitle} className={styles.drawerBackdrop}>
      <button
        type="button"
        className={styles.drawerDismiss}
        aria-label={t.gallery.close}
        disabled={busy}
        onClick={requestClose}
      />
      <div
        ref={dialogRef}
        className={[styles.drawer, entered ? styles.drawerEntered : ''].filter(Boolean).join(' ')}
        data-testid="cart-drawer"
        onTransitionEnd={onDrawerTransitionEnd}
      >
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2 2h1.2l.9 8.1a1.4 1.4 0 0 0 1.4 1.25h6.2a1.4 1.4 0 0 0 1.38-1.16l.82-4.7H4.4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="6.2" cy="13.4" r="1" fill="currentColor" />
              <circle cx="11" cy="13.4" r="1" fill="currentColor" />
            </svg>
            {t.cart.pageTitle}
            {cartCount > 0 && <span className={styles.drawerBadge}>{cartCount}</span>}
          </h2>
          <button
            type="button"
            className={styles.drawerCloseButton}
            disabled={busy}
            onClick={requestClose}
            aria-label={t.gallery.close}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {notice && <CartDrawerNotice notice={notice} />}

        {loading || (busy && lines.length === 0 && compositions.length === 0) ? (
          <span className={styles.drawerListLoading} aria-hidden="true" />
        ) : lines.length === 0 && compositions.length === 0 ? (
          <p className={styles.drawerEmpty}>{t.cart.emptyState}</p>
        ) : (
          <div className={styles.drawerListWrap} {...(busy ? { inert: true } : {})}>
            <div
              ref={listRef}
              className={styles.drawerScroll}
              onScroll={updateScrollHint}
              {...listDragScroll}
            >
              <LazyCartDrawerCompositionLines
                compositions={compositions}
                hidePrices={gift.hidePrices}
                canRemove={(!gift.active || gift.canMutate) && !cartLocked}
                onRemove={onRemoveComposition}
              />
              {paidNailGroups.length > 0 && (
                <ul className={styles.drawerList}>
                  {paidNailGroups.map((group) => renderDrawerGroup(group, { isGift: false }))}
                </ul>
              )}
              {paidAccessoryGroups.length > 0 && (
                <ul className={styles.drawerList}>
                  {paidAccessoryGroups.map((group) => renderDrawerGroup(group, { isGift: false }))}
                </ul>
              )}

              {showOffers && (
                <div className={styles.drawerOffersSection}>
                  <ul className={styles.drawerOffersList}>
                    {giftGroups.map((group) => renderDrawerGroup(group, { isGift: true }))}
                    {nailQtyTier && nailQtyTier.nailQty > 0 && !hideMoney && (
                      <CartRulesProgress
                        tier={nailQtyTier}
                        t={t}
                        {...(styles.drawerRulesProgress ? { className: styles.drawerRulesProgress } : {})}
                        minTitlePx={8}
                      />
                    )}
                  </ul>
                </div>
              )}
            </div>

            {scrollHint.up && (
              <span className={styles.scrollHintUp} aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 7.5L6 4L9.5 7.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
            {scrollHint.down && (
              <span className={styles.scrollHintDown} aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 4.5L6 8L9.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
            {(scrollHint.up || scrollHint.down) && (
              <span
                className={[
                  styles.scrollHintBar,
                  scrollHint.up && styles.scrollHintBarFromUp,
                  scrollHint.down && styles.scrollHintBarToDown,
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden="true"
              />
            )}
          </div>
        )}

        <div className={styles.drawerFooter} {...(busy ? { inert: true } : {})}>
          {!gift.hidePrices && (
            <>
              <div className={styles.drawerSubtotalRow}>
                <span>{t.cart.subtotalLabel}</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <p className={styles.drawerShippingNote}>{t.cart.drawerShippingNote}</p>
            </>
          )}
          <p className={styles.drawerShippingNote}>{t.cart.drawerModifyNote}</p>
          {(lines.length > 0 || compositions.length > 0) && (
            <Button
              type="button"
              className={styles.drawerPrimaryButton}
              data-testid="cart-drawer-checkout"
              onClick={onGoToCart}
            >
              {gift.active
                ? gift.canMutate
                  ? t.gift.drawerGoToCart
                  : t.gift.drawerGoToFollow
                : t.cart.popoverGoToCart}
            </Button>
          )}
          {showContinueShopping && (
            <button
              type="button"
              className={styles.drawerContinueLink}
              data-testid="cart-drawer-continue"
              onClick={requestClose}
            >
              {t.cart.popoverContinue}
            </button>
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
