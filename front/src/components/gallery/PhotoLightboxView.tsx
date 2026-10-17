import { CloseIcon } from '../ui/CloseIcon';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLightboxGestures } from '../../hooks/useLightboxGestures';
import { useLightboxKeyboard } from './useLightboxKeyboard';
import { useLightboxSheet } from './useLightboxSheet';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useCartCommands, useCartData } from '../../hooks/useCart';
import { useOptionalGiftReceiver } from '../../hooks/useGiftReceiver';
import { useOutOfStockSizeFlags } from '../../hooks/useFilterOptions';
import { availableQuantityFor, availableSizesFor, preferredAvailableSize } from '../../utils/availability';
import { formatPrice } from '../../utils/formatPrice';
import { Chip } from '../ui/Chip';
import { Button } from '../ui/Button';
import { CartGlyph } from '../ui/CartGlyph';
import { QuantityControl } from '../ui/QuantityControl';
import { LengthTag } from './LengthTag';
import { ShapeTag } from './ShapeTag';
import { SizeRequestModal } from './SizeRequestModal';
import { ShareButton } from './ShareButton';
import { LightboxTrustRow } from './LightboxTrustRow';
import { PhotoSwapFade } from './PhotoSwapFade';
import type { GalleryItem } from '../../data/types';
import type { Size } from '../../api/cart';
import { SIZES, SIZE_SELECTION_PRIORITY } from '../../data/sizes';
import { productGalleryDeepLinkPath } from '../../utils/productUrl';
import { shopConfig } from '../../config/env';
import { localizedPath } from '../../config/i18nRoutes';
import styles from './PhotoLightbox.module.css';
import { ModalBackdrop } from '../ui/ModalBackdrop';

interface PhotoLightboxProps {
  item: GalleryItem;
  activeShape: string;
  /** The active length within `activeShape`. Nothing here lets a visitor
   * change it — callers derive it from the shape (see defaultLengthKey) —
   * but it selects the photo set and the stock row all the same. */
  activeLength: string;
  onSelectShape: (key: string) => void;
  /** Omit for a caller with no length picker of its own (NewArrivalCard,
   * GalleryPage's restore/deep-link views) — the tag then shows the active
   * length as plain text instead of a non-functional dropdown. */
  onSelectLength?: (key: string) => void;
  index: number;
  onIndexChange: (index: number) => void;
  alt: string;
  onClose: () => void;
  /** A caller that owns a saved product line (the cart's "Pour plus tard"
   * strip) can use the modal's current choices for a custom action instead
   * of directly adding another line through the normal cart context. */
  onConfirmSelection?:
    ((selection: { shapeKey: string; lengthKey: string; size: Size; quantity: number }) => void) | undefined;
  confirmLabel?: string | undefined;
  initialSize?: Size | undefined;
  initialQuantity?: number | undefined;
  hideReference?: boolean | undefined;
  /** Viewport coordinates of the click that opened this modal (the zoom
   * button) — the dialog grows out of that point instead of always its own
   * center. Omit for a plain centered grow (e.g. no click to anchor to). */
  originX?: number | undefined;
  originY?: number | undefined;
  /** Window scroll offset when this zoom opened. Written onto the history
   * entry so Back from Size guide can restore the gallery without waiting
   * for the virtualized card — must be captured before body-lock, which
   * can make `window.scrollY` read 0 on desktop. */
  openedAtScrollY?: number | undefined;
}

/** Left: the photo carousel/slider with pinch/pan/wheel zoom, unchanged.
 * Right: the product panel (title, reference, active shape/length tags, size,
 * quantity, price, add-to-cart, trust badges) — this modal is the
 * "product detail" view, opened only from the card's dedicated zoom
 * button (see GalleryCard.tsx), not from tapping the photo itself. */
export function PhotoLightbox({
  item,
  activeShape,
  activeLength,
  onSelectShape,
  onSelectLength,
  index: indexProp,
  onIndexChange: onIndexChangeProp,
  alt,
  onClose,
  onConfirmSelection,
  confirmLabel,
  initialSize,
  initialQuantity,
  hideReference = false,
  originX,
  originY,
  openedAtScrollY,
}: PhotoLightboxProps) {
  const { t, lang } = useLang();
  const gift = useOptionalGiftReceiver();
  const { allowSizeRequest } = useOutOfStockSizeFlags();
  const sizesPath = localizedPath('/sizes', lang);
  const { cartReady, getCartLine } = useCartData();
  const { addToCart } = useCartCommands();
  const images = item.photosByShapeLength[activeShape]?.[activeLength] ?? [];
  const index = indexProp;
  const onIndexChange = onIndexChangeProp;
  const unitPrice = item.price;
  const cartLine = getCartLine(item.id);
  // Out-of-stock chips stay visible (struck through); a click opens the size
  // request only while outOfStockSizeRequestEnabled is on, else it is inert.
  // Retain an explicit size only while it remains valid for the active
  // shape; otherwise use the shared M → S → XS → L in-stock priority.
  const cartSize = cartLine?.size === '' ? undefined : cartLine?.size;
  const availableSizes = availableSizesFor(item.available, activeShape, activeLength, SIZES);
  const displayedSizes = SIZES;
  const [selectedSize, setSelectedSize] = useState<Size>(
    () =>
      preferredAvailableSize(item.available, activeShape, activeLength, SIZE_SELECTION_PRIORITY, [
        initialSize,
        cartSize,
      ]) ?? 'M',
  );
  const [quantity, setQuantity] = useState(initialQuantity ?? 1);
  const maxQuantity = availableQuantityFor(item.available, activeShape, activeLength, selectedSize);
  const gestures = useLightboxGestures({ index, count: images.length, onIndexChange });
  const { scale, x, y, swipeOffset, isDragging, wasDrag, resetZoom, containerRef, handlers } = gestures;
  const isZoomed = scale > 1;
  const {
    dialogRef,
    backdropRef,
    scrollAreaRef,
    scrollContentRef,
    entered,
    sheetExpanded,
    mobileCollapse,
    scrollHint,
    updateScrollHint,
    makeRoomAboveMenu,
    onScrollAreaPointerDown,
    onScrollAreaPointerMove,
    onScrollAreaPointerUp,
    useIosTouchSheetGestures,
  } = useLightboxSheet({ originX, originY, isZoomed });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [sizeRequest, setSizeRequest] = useState<{ open: true; size?: Size } | { open: false }>({
    open: false,
  });

  function openSizeRequest(size?: Size) {
    setSizeRequest(size ? { open: true, size } : { open: true });
  }

  function closeSizeRequest() {
    setSizeRequest({ open: false });
  }
  const multi = images.length > 1;

  useEffect(() => {
    resetZoom();
  }, [index, resetZoom]);

  useEffect(() => {
    setSelectedSize(
      (current) =>
        preferredAvailableSize(item.available, activeShape, activeLength, SIZE_SELECTION_PRIORITY, [
          current,
        ]) ?? current,
    );
  }, [activeLength, activeShape, item.available]);

  // A fresh pick starts back at one unit — carrying over a quantity chosen
  // for a different size/shape combo would silently inflate the next add.
  useEffect(() => {
    setQuantity(1);
  }, [activeShape, activeLength, selectedSize]);

  // The sheet has an actual native overflow scroller once expanded. Android
  // stays CSS-only so that scroll remains on the compositor; iOS also gets
  // the boundary guard because Safari otherwise can pan the document (and
  // reveal its browser bar) behind the transformed sheet.
  useLockBodyScroll(true, useIosTouchSheetGestures);

  // Platform back (Android gesture / browser back) must dismiss this modal
  // the same way as the close button — not pop Gallery → Accueil.
  const requestClose = useHistoryBackClose(onClose);
  // The shell itself takes opening focus (it carries tabIndex={-1}). Unlike a
  // form dialog, this one's primary controls are the arrow keys and the zoom
  // gestures, so leaving focus on the gallery card behind the overlay would
  // strand a keyboard user outside the thing that just opened.
  useFocusTrap(dialogRef, { onEscape: requestClose, initialFocusRef: dialogRef });

  function handleAddToCart() {
    if (gift.active && !gift.canMutate) return;
    if (onConfirmSelection) {
      onConfirmSelection({
        shapeKey: activeShape,
        lengthKey: activeLength,
        size: selectedSize,
        quantity,
      });
      return;
    }
    if (!cartReady) return;
    // Close this overlay before addToCart notifies the header drawer.
    // Guest add is synchronous: if the drawer mounts while this modal still
    // owns history, platform back dismisses the drawer first and leaves the
    // zoom stranded underneath. requestClose pops our entry now; CartControl
    // also waits until the zoom has unregistered before mounting the drawer.
    requestClose();
    // maxQuantity caps the *line's total*, not just this add — useCart's
    // addToCart weighs it against whatever's already in the cart for this
    // item (possibly a different shape/size, since a cart line holds only
    // one), so a stepper that tops out at the current shape/size's own
    // stock still can't silently push the line over that stock via a
    // second add. See CartLine.tsx for the same cap applied once the line
    // already exists.
    addToCart(
      item.id,
      activeShape,
      activeLength,
      selectedSize,
      { title: item.title, photo: images[0]?.small ?? null, price: item.price },
      quantity,
      maxQuantity,
    );
  }

  // Tag this same history entry (the one useHistoryBackClose above just
  // pushed) with which product/photo it's showing. A link inside this modal
  // to a real route (Size guide) pushes its own entry on top rather than
  // being swallowed — useHistoryBackClose's own doc comment calls this out
  // deliberately. Coming back lands on *this* entry; GalleryPage reopens
  // the zoom modal from history.state and jumps the virtualized grid to
  // that product so the card does not have to be on-screen first.
  useEffect(() => {
    const state = window.history.state as Record<string, unknown> | null;
    const previousScrollY = state?.galleryLightboxScrollY;
    const scrollY =
      typeof openedAtScrollY === 'number'
        ? openedAtScrollY
        : typeof previousScrollY === 'number'
          ? previousScrollY
          : window.scrollY;
    window.history.replaceState(
      {
        ...(state ?? {}),
        galleryLightboxProductUid: item.productUid,
        galleryLightboxPhotoIndex: index,
        galleryLightboxScrollY: scrollY,
      },
      '',
    );
  }, [index, item.productUid, openedAtScrollY]);

  useLightboxKeyboard(dialogRef, gestures, { multi, count: images.length, index, onIndexChange });

  // Mobile: lives at the bottom of the scrollable content, below size, not
  // the sticky footer; desktop keeps it in the footer, above the size row.
  const quantityBlock = availableSizes.length > 0 && (!gift.active || gift.canMutate) && (
    <div className={styles.quantityRow}>
      <span className={styles.quantityLabel}>{t.cart.quantityLabel}</span>
      <div className={styles.quantityControlRow}>
        <QuantityControl
          className={
            maxQuantity === 1
              ? `${styles.quantityControl} ${styles.quantityControlLastOne}`
              : styles.quantityControl
          }
          value={quantity}
          max={maxQuantity}
          onChange={setQuantity}
          ariaLabel={t.cart.quantityLabel}
          decreaseAria={t.cart.qtyDecreaseAria}
          increaseAria={t.cart.qtyIncreaseAria}
          // Only one unit left: there's nothing to step to/from, so the
          // control has nothing useful to do — disabled rather than a
          // stepper stuck at 1, with lastOneInStockNotice below saying why.
          // .quantityControlLastOne keeps it from also fading like
          // QuantityControl's other disabled states (e.g. truly 0 in
          // stock) — there's nothing wrong here to gray out, it's just
          // that 1 is the only possible value.
          disabled={maxQuantity <= 1}
        />
        {maxQuantity === 1 && <span className={styles.lastOneNotice}>{t.cart.lastOneInStockNotice}</span>}
      </div>
    </div>
  );

  // Shared between the mobile scrollable-content size section and desktop's
  // footer size row — only one of the two ever mounts at once (gated on
  // mobileCollapse below), so reusing it here doesn't duplicate DOM/testids.
  const outOfStockBlockEl = (
    <div className={styles.outOfStockBlock}>
      <p className={styles.outOfStock}>{t.gallery.outOfStockNotice}</p>
      {allowSizeRequest && !gift.active && (
        <button
          type="button"
          className={styles.sizeRequestButton}
          data-testid="gallery-size-request"
          onClick={() => openSizeRequest()}
        >
          {t.gallery.sizeRequestCta}
        </button>
      )}
    </div>
  );

  // Same reuse reasoning as outOfStockBlockEl — one add-to-cart button,
  // placed differently (next to size on desktop, next to Total on mobile).
  const showPurchaseFooter = availableSizes.length > 0 && (!gift.active || gift.canMutate);
  const addToCartButtonEl = (
    <Button
      type="button"
      className={styles.addToCartButton}
      data-testid="gallery-lightbox-add"
      onClick={handleAddToCart}
      disabled={!cartReady || (gift.active && !gift.canMutate)}
    >
      <CartGlyph size={18} className={styles.addToCartIcon ?? ''} />
      <span>{confirmLabel ?? t.gallery.addToCartCta}</span>
    </Button>
  );

  return createPortal(
    <>
      <ModalBackdrop
        ref={backdropRef}
        className={styles.backdrop ?? ''}
        label={alt}
        description={t.gallery.zoomKeyboardHint}
        onClose={requestClose}
        {...(sizeRequest.open ? { inert: true } : {})}
        // A portal is outside the DOM tree but still bubbles through its React
        // parents. On the home page that parent is the draggable Nouveautés
        // strip, so all pointer gestures must stop here after the modal's own
        // image handlers have processed them.
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerCancel={(e) => e.stopPropagation()}
      >
        <div
          ref={dialogRef}
          tabIndex={-1}
          className={[
            styles.dialog,
            entered && styles.dialogOpen,
            mobileCollapse && (sheetExpanded ? styles.sheetExpanded : styles.sheetCollapsed),
          ]
            .filter(Boolean)
            .join(' ')}
          data-testid="gallery-lightbox"
        >
          {/* Hint + close share one overlay row so long zoom copy wraps instead
            of colliding with the close control (especially on mobile). */}
          <div className={styles.chromeTop}>
            {multi && (
              <span
                className={styles.counter}
                aria-live="polite"
                aria-atomic="true"
                data-testid="gallery-lightbox-counter"
              >
                {t.gallery.photoLabel} {index + 1}/{images.length}
                <span className={styles.zoomHintDesktop}> · {t.gallery.zoomHint}</span>
                <span className={styles.zoomHintMobile}> - {t.gallery.zoomHintMobile}</span>
              </span>
            )}
            <button
              type="button"
              className={styles.closeButton}
              data-testid="gallery-lightbox-close"
              onClick={requestClose}
              aria-label={t.gallery.close}
            >
              <CloseIcon />
            </button>
          </div>

          <div className={styles.photoArea}>
            {/* Pointer letterbox dismiss only: keyboard uses Escape / close.
                Must not be a focusable "Close" covering the gesture surface. */}
            {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- see comment above */}
            <div
              ref={containerRef}
              className={styles.imageWrap}
              data-testid="gallery-lightbox-gesture-surface"
              {...handlers}
              onClick={(e) => {
                // A genuine drag/swipe/pan must never close the modal, regardless of
                // where the pointer ends up — a swipe can legitimately release over
                // the letterboxed area around the photo, not just over the photo
                // itself. Only a stationary tap outside the photo's real rendered
                // box (not just `e.target`, which pointer capture forces to always
                // equal this element) should count as "tapped the background".
                if (wasDrag.current) return;
                const rect = imgRef.current?.getBoundingClientRect();
                const insideImage =
                  !!rect &&
                  e.clientX >= rect.left &&
                  e.clientX <= rect.right &&
                  e.clientY >= rect.top &&
                  e.clientY <= rect.bottom;
                if (!insideImage) requestClose();
              }}
            >
              <div
                className={styles.track}
                style={{
                  transform: `translateX(calc(${-index * 100}% + ${swipeOffset}px))`,
                  transition: isDragging ? 'none' : undefined,
                }}
              >
                {images.map((photo, i) =>
                  Math.abs(i - index) <= 1 ? (
                    <img
                      key={photo.modal}
                      ref={i === index ? imgRef : undefined}
                      src={photo.modal}
                      alt={multi ? `${alt} - ${i + 1}/${images.length}` : alt}
                      className={styles.image}
                      data-testid="gallery-lightbox-image"
                      data-photo-index={i}
                      style={
                        i === index
                          ? {
                              transform: `translate(${x}px, ${y}px) scale(${scale})`,
                              transition: isDragging ? 'none' : undefined,
                            }
                          : undefined
                      }
                      draggable={false}
                    />
                  ) : (
                    <div key={photo.modal} className={styles.slide} aria-hidden="true" />
                  ),
                )}
              </div>
              <PhotoSwapFade sources={images.map((photo) => photo.modal)} index={index} />
            </div>

            {multi && (
              <div className={styles.controls}>
                <button
                  type="button"
                  className={`${styles.navButton} ${styles.navPrev}`}
                  data-testid="gallery-lightbox-prev"
                  onClick={() => onIndexChange(Math.max(0, index - 1))}
                  disabled={index === 0}
                  aria-label={t.gallery.prevPhoto}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M9 2L4 7L9 12"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`${styles.navButton} ${styles.navNext}`}
                  data-testid="gallery-lightbox-next"
                  onClick={() => onIndexChange(Math.min(images.length - 1, index + 1))}
                  disabled={index === images.length - 1}
                  aria-label={t.gallery.nextPhoto}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M5 2L10 7L5 12"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )}

            <div className={styles.shapeRowOverlay}>
              <div className={styles.shapeTags}>
                <ShapeTag
                  shape={item.shape}
                  activeShape={activeShape}
                  onSelect={onSelectShape}
                  appearance="chip"
                  menuPlacement={mobileCollapse ? 'above' : 'below'}
                  {...(mobileCollapse ? { onNeedRoomAbove: makeRoomAboveMenu } : {})}
                />
                <LengthTag
                  lengths={item.lengthsByShape[activeShape] ?? {}}
                  activeLength={activeLength}
                  onSelect={onSelectLength ?? (() => {})}
                  readOnly={!onSelectLength}
                  appearance="chip"
                  menuAlign="start"
                  menuPlacement={mobileCollapse ? 'above' : 'below'}
                  {...(mobileCollapse ? { onNeedRoomAbove: makeRoomAboveMenu } : {})}
                />
              </div>
            </div>

            {/* No indexable page exists for a user-library item (see
                GalleryCard's own title-link condition) — nothing to share. */}
            {!item.isUserLibrary && (
              <ShareButton
                title={item.title}
                url={`${shopConfig.siteUrl}${localizedPath(productGalleryDeepLinkPath(item), lang)}`}
                {...(styles.shareButton ? { className: styles.shareButton } : {})}
                data-testid="gallery-lightbox-share"
              />
            )}
          </div>

          <div className={styles.panel}>
            <div className={styles.scrollAreaWrap}>
              <div
                ref={scrollAreaRef}
                className={styles.scrollArea}
                onScroll={updateScrollHint}
                onPointerDown={onScrollAreaPointerDown}
                onPointerMove={onScrollAreaPointerMove}
                onPointerUp={onScrollAreaPointerUp}
                onPointerCancel={onScrollAreaPointerUp}
                onPointerLeave={onScrollAreaPointerUp}
              >
                <div ref={scrollContentRef} className={styles.scrollContent}>
                  <div className={styles.shapeRow}>
                    <div className={styles.shapeTags}>
                      <ShapeTag
                        shape={item.shape}
                        activeShape={activeShape}
                        onSelect={onSelectShape}
                        appearance="chip"
                        menuPlacement="below"
                      />
                      <LengthTag
                        lengths={item.lengthsByShape[activeShape] ?? {}}
                        activeLength={activeLength}
                        onSelect={onSelectLength ?? (() => {})}
                        readOnly={!onSelectLength}
                        appearance="chip"
                        menuAlign="start"
                        menuPlacement="below"
                      />
                    </div>
                  </div>
                  <div className={styles.headingRow}>
                    <div className={styles.headingText}>
                      <h2 className={styles.itemTitle}>{item.title}</h2>
                      {!hideReference && (
                        <div className={styles.metaRow}>
                          <p className={styles.reference}>
                            {t.cart.referenceLabel} {item.productUid}
                          </p>
                        </div>
                      )}
                    </div>
                    {unitPrice !== undefined && <p className={styles.itemPrice}>{formatPrice(unitPrice)}</p>}
                  </div>
                  <p className={styles.desc}>{item.desc}</p>

                  {/* Size and quantity live here in the scrollable content on
                      every screen, not in the pinned footer, which only keeps
                      the add button. Own visible size label and the
                      size-guide link under the chips. */}
                  <div className={styles.sizeSection}>
                    <span className={styles.sizeSectionLabel}>{t.gallery.sizeLabel}</span>
                    {availableSizes.length > 0 ? (
                      <div className={styles.sizeSelector} role="group" aria-label={t.gallery.sizeLabel}>
                        {displayedSizes.map((size) => {
                          const inStock = availableSizes.includes(size);
                          return (
                            <Chip
                              key={size}
                              active={inStock && size === selectedSize}
                              className={inStock ? undefined : styles.sizeChipUnavailable}
                              srState={inStock ? undefined : t.product.outOfStock}
                              data-testid="gallery-size"
                              data-size={size}
                              data-in-stock={inStock ? 'true' : 'false'}
                              // Out of stock (for this shape/length) keeps
                              // the chip's normal look, no Chip.tsx
                              // muted/faded state, just the diagonal
                              // strike (.sizeChipUnavailable). A click
                              // opens the request flow when Boutique
                              // allows it; otherwise the chip is inert.
                              onClick={
                                inStock
                                  ? () => setSelectedSize(size)
                                  : allowSizeRequest
                                    ? () => openSizeRequest(size)
                                    : undefined
                              }
                            >
                              {size}
                            </Chip>
                          );
                        })}
                      </div>
                    ) : (
                      outOfStockBlockEl
                    )}
                    <Link to={sizesPath} className={styles.sizeGuideLink}>
                      {t.gallery.sizeGuideLink} →
                    </Link>
                  </div>
                  {quantityBlock}
                  {!showPurchaseFooter && <LightboxTrustRow />}
                </div>
              </div>

              {/* Bar first so it paints behind the two chevrons below (same
                  DOM stacking order, later = on top) — otherwise its thin
                  line visibly crossed over/through the chevron circle
                  instead of sitting under it. */}
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
            </div>

            {/* Pinned: the add button and the trust row under it; the rest
                scrolls. A set out of stock has nothing to add (its request is
                in the content). */}
            {showPurchaseFooter && (
              <div className={styles.purchaseFooter}>
                <div className={styles.purchaseRow}>{addToCartButtonEl}</div>
                <LightboxTrustRow />
              </div>
            )}
          </div>
        </div>
      </ModalBackdrop>
      {/* A sibling of the backdrop, never a child: a portal still bubbles
        events through its React parents, so nested inside it every click
        in the size dialog would also hit the backdrop's own
        close-the-lightbox handler. */}
      {sizeRequest.open && !gift.active && allowSizeRequest && (
        <SizeRequestModal
          productId={item.id}
          shapeKey={activeShape}
          lengthKey={activeLength}
          photo={images[0]?.small}
          title={item.title}
          shapeLabel={item.shape[activeShape] ?? activeShape}
          lengthLabel={item.lengthsByShape[activeShape]?.[activeLength] ?? activeLength}
          {...(sizeRequest.size ? { initialSize: sizeRequest.size } : {})}
          aboveLightbox
          onClose={closeSizeRequest}
        />
      )}
    </>,
    document.body,
  );
}
