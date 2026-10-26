import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { productAlt } from '../../utils/productCopy';
import { useCartCommands, useCartOverlay } from '../../hooks/useCart';
import { Chip } from '../ui/Chip';
import { Skeleton } from '../ui/Skeleton';
import { PhotoCarousel } from './PhotoCarousel';
import { PhotoLightbox } from './PhotoLightbox';
import { CORE_FRONT_SLOTS, PluginSlot } from '../../plugins/PluginHost';
import { SizeRequestModal } from './SizeRequestModal';
import { FavoriteButton } from './FavoriteButton';
import { ShapeTag } from './ShapeTag';
import { LengthTag } from './LengthTag';
import { useInViewport } from '../../hooks/useInViewport';
import type { FavoriteVariant, useGalleryFavorites } from '../../hooks/useGalleryFavorites';
import { useFitOneLineTitle } from '../../hooks/useFitOneLineTitle';
import { availableQuantityFor, availableSizesFor, preferredAvailableSize } from '../../utils/availability';
import { formatPrice } from '../../utils/formatPrice';
import type { GalleryItem } from '../../data/types';
import type { Size } from '../../api/cart';
import { localizedPath } from '../../config/i18nRoutes';
import { productPath } from '../../utils/productUrl';
import { defaultLengthKey, defaultShapeKey, lengthAfterShapeChange } from '../../data/galleryShape';
import { SIZES, SIZE_SELECTION_PRIORITY } from '../../data/sizes';
import { shopConfig } from '../../config/env';
import { itemForVariation, validVariationKey, variationPhotos } from '../../utils/nailVariation';
import { CartGlyph } from '../ui/CartGlyph';
import { ZoomGlyph } from './ZoomGlyph';
import styles from './GalleryCard.module.css';

const TITLE_FIT_MQ = '(max-width: 1023px)';

export interface GalleryCardProps {
  item: GalleryItem;
  /** aria-posinset / aria-setsize (-1 while pages remain): virtualization hides the rest. */
  position: number;
  setSize: number;
  animateEnter?: boolean;
  /** Grid-level cart/gift primitives so memo is not defeated by per-card context. */
  cartReady: boolean;
  cartLineSize?: Size;
  addToCart: ReturnType<typeof useCartCommands>['addToCart'];
  registerModalClose: ReturnType<typeof useCartOverlay>['registerModalClose'];
  /** Grid-level too (identity-stable per favorite); undefined = not favorited. */
  favorite: FavoriteVariant | undefined;
  setFavoriteVariant: ReturnType<typeof useGalleryFavorites>['setFavoriteVariant'];
  giftActive: boolean;
  giftCanMutate: boolean;
  allowSizeRequest: boolean;
  /** Active gallery shape/length/size filter (empty = no preference). When the
   * item offers a shape/length/size the filter selected, the card shows that
   * one instead of its own intrinsic default — filtering by "Ballerine"
   * should show the ballerina variant, not silently keep whatever shape the
   * card would otherwise default to. A manual pick on the card (shape/length
   * menu, size chip) always overrides this for as long as the filter itself
   * doesn't change — see the sync effect's own comment below. */
  filterShapeKeys: string[];
  filterLengthKeys: string[];
  filterSizeKeys: string[];
}

// Cards render their full content immediately (no lazy-mount skeleton for the
// text): titles and descriptions must be present in the prerendered HTML for
// search engines. The photo itself is different — native loading="lazy" only
// defers the *first* fetch, it never frees an already-decoded image once
// it's scrolled away, so with hundreds of sets that adds up to unbounded
// memory. useInViewport actually unmounts the <img> (dropping its decoded
// bitmap) once the card is well outside the viewport, and remounts it if the
// card scrolls back near — a recycler-view trade-off, see the hook's doc.
function GalleryCardImpl({
  item,
  position,
  setSize,
  animateEnter = false,
  cartReady,
  cartLineSize,
  addToCart,
  registerModalClose,
  favorite,
  setFavoriteVariant,
  giftActive,
  giftCanMutate,
  allowSizeRequest,
  filterShapeKeys,
  filterLengthKeys,
  filterSizeKeys,
}: GalleryCardProps) {
  const { t, lang } = useLang();
  const { ref: cardRef, inView } = useInViewport<HTMLDivElement>({
    rootMargin: `${shopConfig.galleryCardRootMarginPx}px 0px`,
  });
  // Remembers which shape/length a favorited design was last viewed in,
  // across visits — otherwise it'd always reset to the defaults below.
  const sharedShape = favorite?.shapeKey;
  const initialVariation = validVariationKey(item, favorite?.variationKey);
  // Single nails with variations: the option shown (and added), remembered on
  // a favorite like shape and length. `''` for everything else. Each option is
  // its own product, so the card's title, description and alt are its own.
  const activeVariation = initialVariation;
  const shown = itemForVariation(item, activeVariation);
  const title = shown.title;
  const gappedShape = undefined;
  const initialShape =
    sharedShape && item.photosByShapeLength[sharedShape]
      ? sharedShape
      : (gappedShape ?? defaultShapeKey(item));
  const [activeShape, setActiveShape] = useState(initialShape);
  const sharedLength = favorite?.lengthKey;
  const [activeLength, setActiveLength] = useState(
    sharedLength && item.lengthsByShape[initialShape]?.[sharedLength]
      ? sharedLength
      : defaultLengthKey(item, initialShape),
  );
  // Authored alt text names the shape through a `$shape` placeholder, since
  // a set can be sold in several: resolved here so it follows the card's own
  // shape chip rather than describing the default shape.
  const alt = productAlt(shown, activeShape, activeLength) ?? `${t.gallery.altPrefix}${title}`;
  const photos = variationPhotos(item, activeShape, activeLength, activeVariation);
  // A single nail is priced per variation (its own price may override the
  // item's). No item price means prices are hidden (gift): keep them hidden.
  const cardPrice = item.price;
  // Shared with the lightbox so swiping to a different photo there is still
  // reflected on the card's own carousel after closing it.
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxScrollY, setLightboxScrollY] = useState(0);
  const [sizeRequestOpen, setSizeRequestOpen] = useState(false);
  const [lightboxOrigin, setLightboxOrigin] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  const availableSizes = availableSizesFor(item.available, activeShape, activeLength, SIZES);
  // Out-of-stock chips stay visible but muted. A valid cart/user choice is
  // retained; otherwise the initial selection follows the stock priority.
  const [selectedSize, setSelectedSize] = useState<Size>(
    () =>
      preferredAvailableSize(item.available, activeShape, activeLength, SIZE_SELECTION_PRIORITY, [
        cartLineSize,
      ]) ?? 'M',
  );

  // Shape changes retain a valid user/cart choice; if that size has no
  // stock for the new variant, immediately select the preferred in-stock
  // replacement instead of leaving a muted chip active.
  useEffect(() => {
    setSelectedSize(
      (current) =>
        preferredAvailableSize(item.available, activeShape, activeLength, SIZE_SELECTION_PRIORITY, [
          current,
        ]) ?? current,
    );
  }, [activeLength, activeShape, item.available]);

  // Mirrors the latest shape/length/size into refs so the filter-sync effect
  // below can read "what's currently shown" without depending on it — a
  // manual pick must never itself be a reason for that effect to re-fire.
  const activeShapeRef = useRef(activeShape);
  const activeLengthRef = useRef(activeLength);
  const selectedSizeRef = useRef(selectedSize);
  useEffect(() => {
    activeShapeRef.current = activeShape;
    activeLengthRef.current = activeLength;
    selectedSizeRef.current = selectedSize;
  });

  // Caption needs min-width: 0 (see CSS) so the flex card constrains width.
  useFitOneLineTitle(titleRef, title, TITLE_FIT_MQ);

  const applyShape = (key: string) => {
    // The chosen length is kept when the new shape offers it, else the
    // shape's own default (a length of the previous shape may not exist here).
    const nextLength = lengthAfterShapeChange(item, key, activeLength);
    const nextPhotos = item.photosByShapeLength[key]?.[nextLength] ?? [];
    setActiveShape(key);
    setActiveLength(nextLength);
    // Clamp (don't reset) — the newly active shape may have fewer photos
    // than the one currently being viewed.
    setIndex((current) => Math.max(0, Math.min(current, nextPhotos.length - 1)));
  };

  const selectShape = (key: string) => {
    if (key === activeShape) return;
    applyShape(key);
    if (favorite) {
      setFavoriteVariant(item.id, key, lengthAfterShapeChange(item, key, activeLength), activeVariation);
    }
  };

  const applyLength = (key: string) => {
    const nextPhotos = item.photosByShapeLength[activeShape]?.[key] ?? [];
    setActiveLength(key);
    setIndex((current) => Math.max(0, Math.min(current, nextPhotos.length - 1)));
  };

  const selectLength = (key: string) => {
    if (key === activeLength) return;
    applyLength(key);
    if (favorite) setFavoriteVariant(item.id, activeShape, key, activeVariation);
  };

  // Filtering by "Ballerine" should show the ballerina variant, not silently
  // keep whichever shape the card would otherwise default to — an active
  // shape/length/size filter takes priority over the card's own intrinsic
  // default and over a favorited variant memory (deliberately not persisted
  // via setFavoriteVariant: this is a display preference for the current
  // filter view, not a choice the customer made). Deliberately depends only
  // on the filter props + item, never on activeShape/activeLength/
  // selectedSize themselves (read instead from the refs above) — a manual
  // pick via the card's own shape/length menu or size chip must be able to
  // override the filter "for that instant" without this effect immediately
  // fighting it back. It only reasserts the filter's preferred variant when
  // the filter itself next changes (including an off/on toggle, which
  // produces a new array from useGalleryFeed).
  useEffect(() => {
    const currentShape = activeShapeRef.current;
    const currentLength = activeLengthRef.current;
    const currentSize = selectedSizeRef.current;

    const preferredShape =
      filterShapeKeys.length > 0
        ? Object.keys(item.shape).find((key) => filterShapeKeys.includes(key))
        : undefined;
    const shapeChanging = preferredShape !== undefined && preferredShape !== currentShape;
    const nextShape = shapeChanging ? preferredShape : currentShape;

    const preferredLength =
      filterLengthKeys.length > 0
        ? Object.keys(item.lengthsByShape[nextShape] ?? {}).find((key) => filterLengthKeys.includes(key))
        : undefined;
    const lengthChanging =
      shapeChanging || (preferredLength !== undefined && preferredLength !== currentLength);
    const nextLength = !lengthChanging
      ? currentLength
      : shapeChanging
        ? (preferredLength ?? defaultLengthKey(item, nextShape))
        : preferredLength!;

    // Only override size if the current pick no longer satisfies the filter
    // — mirrors shapeChanging/lengthChanging's "don't touch what already
    // matches" guard, so a multi-value size filter never reorders an
    // already-valid pick.
    const sizeSatisfiesFilter = filterSizeKeys.length === 0 || filterSizeKeys.includes(currentSize);
    const preferredSize = sizeSatisfiesFilter
      ? undefined
      : filterSizeKeys.find(
          (key) => availableQuantityFor(item.available, nextShape, nextLength, key as Size) > 0,
        );
    const nextSize = (preferredSize as Size | undefined) ?? currentSize;

    if (!shapeChanging && !lengthChanging && nextSize === currentSize) return;

    const nextPhotos = item.photosByShapeLength[nextShape]?.[nextLength] ?? [];
    setActiveShape(nextShape);
    setActiveLength(nextLength);
    setSelectedSize(nextSize);
    setIndex((current) => Math.max(0, Math.min(current, nextPhotos.length - 1)));
  }, [filterShapeKeys, filterLengthKeys, filterSizeKeys, item]);

  const openLightbox = useCallback((i: number, origin: { x: number; y: number }) => {
    triggerRef.current = document.activeElement as HTMLElement;
    setLightboxScrollY(window.scrollY);
    setIndex(i);
    setLightboxOrigin(origin);
    setLightboxOpen(true);
  }, []);
  const openLightboxFromControl = () => {
    const rect = cardRef.current?.getBoundingClientRect();
    openLightbox(
      index,
      rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    );
  };
  // Click-anywhere-to-zoom on the card: controls (buttons, links, chips)
  // keep their own action through the interactive-target guard, everything
  // else opens the lightbox. Same selector as useDragCarousel's own guard.
  // The photo zone never reaches this handler: the carousel stops click
  // propagation on its track (PhotoCarousel onClickCapture).
  const openLightboxFromCard = (e: React.MouseEvent) => {
    if (
      e.target instanceof Element &&
      e.target.closest('button, a, input, textarea, select, [role="button"]')
    ) {
      return;
    }
    openLightbox(index, { x: e.clientX, y: e.clientY });
  };
  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  // Hands this card's close function to the cart context while the modal is
  // open, so the header's cart drawer's "continue shopping" can close it too
  // (see registerModalClose's doc comment in useCart.tsx).
  useEffect(() => {
    if (!lightboxOpen) return;
    registerModalClose(closeLightbox);
    return () => registerModalClose(null);
  }, [closeLightbox, lightboxOpen, registerModalClose]);

  function handleAddToCart(e: React.MouseEvent) {
    e.stopPropagation();
    addToCart(
      item.id,
      activeShape,
      activeLength,
      selectedSize,
      { title: item.title, photo: photos[0]?.small ?? null, price: item.price },
      1,
      availableQuantityFor(item.available, activeShape, activeLength, selectedSize),
    );
  }

  const showCartAdd = availableSizes.length > 0 && (!giftActive || giftCanMutate);

  return (
    <div
      role="listitem"
      aria-posinset={position}
      aria-setsize={setSize}
      id={`gallery-${item.id}`}
      ref={cardRef}
      className={animateEnter ? `${styles.item} ${styles.itemEnter}` : styles.item}
    >
      {/* An article, not a figure: controls and a price are not an image caption.
          Keyboard zoom is the dedicated button (RGAA 10.7). Pointer on the card opens the same zoom. */}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- see comment above */}
      <article
        className={styles.card}
        aria-labelledby={`gallery-${item.id}-title`}
        data-testid="gallery-card"
        data-product-uid={item.productUid}
        onClick={openLightboxFromCard}
      >
        {/* Desktop keyboard path to the zoom, shown once focused (RGAA 10.7). */}
        <button type="button" className={styles.zoomKeyboard} onClick={openLightboxFromControl}>
          {t.gallery.zoomAlt}
        </button>
        <div className={styles.photoWrap}>
          {/* Sets slide through their photos; a single nail with variations
              slides through its options (swipe = change option); a single
              nail without options shows its one photo. */}
          {inView ? (
            <PhotoCarousel
              images={photos}
              alt={alt}
              index={index}
              onIndexChange={setIndex}
              onOpenLightbox={(i, x, y) => openLightbox(i, { x, y })}
              gateImages
            />
          ) : (
            <Skeleton aspectRatio="1 / 1" className={styles.photoPlaceholder} />
          )}
          <FavoriteButton
            itemId={item.id}
            shapeKey={activeShape}
            lengthKey={activeLength}
            variationKey={activeVariation}
            variant="floating"
            className={styles.favoriteButton}
            data-testid="gallery-favorite"
          />
          {/* On the photo, not in the caption, so it never pushes the title.
              Bottom-left on desktop; top-right on mobile (see .shapeBadges). */}
          <div className={styles.shapeBadges}>
            <ShapeTag shape={item.shape} activeShape={activeShape} onSelect={selectShape} />
          </div>
          <div
            className={
              item.isUserLibrary ? `${styles.lengthBadge} ${styles.lengthBadgeRaised}` : styles.lengthBadge
            }
          >
            <LengthTag
              lengths={item.lengthsByShape[activeShape] ?? {}}
              activeLength={activeLength}
              onSelect={selectLength}
            />
          </div>
          {item.isUserLibrary && (
            <span
              className={styles.userLibraryMarker}
              role="img"
              aria-label={t.gallery.userLibraryMarkerLabel}
              data-testid="gallery-user-library-marker"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 1.7 9.9 5.6l4.2.6-3 3 .7 4.2L8 11.4l-3.8 2 .7-4.2-3-3 4.2-.6L8 1.7Z"
                  fill="currentColor"
                />
              </svg>
            </span>
          )}
        </div>
        <div className={styles.caption}>
          {/* The card's title is the internal link into this set's own
              indexable page — without it /creations/* would be reachable
              only from the sitemap, with no crawlable path from the site
              itself and no anchor text describing the destination. The card's
              click-anywhere-to-zoom (the article's onClick) skips it: its
              interactive-target guard matches links, and the stopPropagation
              below keeps the navigation contained regardless. */}
          <h2 ref={titleRef} id={`gallery-${item.id}-title`} className={styles.title}>
            {item.isUserLibrary ? (
              <span className={styles.titleLink}>{title}</span>
            ) : (
              <Link
                className={styles.titleLink}
                to={localizedPath(productPath(item), lang)}
                data-testid="gallery-card-link"
                onClick={(e) => e.stopPropagation()}
              >
                {title}
              </Link>
            )}
          </h2>
          {/* Kept in the DOM for SEO (prerendered HTML); hidden on mobile
              via CSS so the compact card stays title + price + zoom. */}
          <p className={styles.desc}>{shown.desc}</p>
          <PluginSlot name={CORE_FRONT_SLOTS.galleryCardCompose} props={{ product: item }} />
          <div className={styles.sizeRow}>
            {availableSizes.length > 0 ? (
              <div className={styles.sizeGroup} role="group" aria-label={t.gallery.sizeLabel}>
                {availableSizes.map((size) => (
                  <Chip
                    key={size}
                    active={size === selectedSize}
                    data-testid="gallery-size"
                    data-size={size}
                    onClick={() => setSelectedSize(size)}
                  >
                    {size}
                  </Chip>
                ))}
              </div>
            ) : (
              <div className={styles.outOfStockBlock}>
                <p className={styles.outOfStock}>{t.gallery.outOfStockNotice}</p>
                {allowSizeRequest && !giftActive && (
                  <button
                    type="button"
                    className={styles.sizeRequestButton}
                    data-testid="gallery-size-request"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSizeRequestOpen(true);
                    }}
                  >
                    {t.gallery.sizeRequestCta}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className={styles.purchaseRow}>
            {cardPrice !== undefined && (
              <span className={styles.price} data-testid="gallery-card-price">
                {formatPrice(cardPrice)}
              </span>
            )}
            {/* Hide Ajouter when sold out (caption offers size request). */}
            {showCartAdd && (
              <button
                type="button"
                className={styles.addButton}
                data-testid="gallery-add-to-cart"
                onClick={handleAddToCart}
                disabled={!cartReady}
              >
                <CartGlyph />
                {t.gallery.addCta}
                <span className="visuallyHidden"> {title}</span>
              </button>
            )}
            {/* Mobile-only: replaces Ajouter in the purchase row. The whole
                card opens the zoom through the article's onClick; this button
                is the visible affordance for it (excluded from the card
                handler by its interactive-target guard, hence its own
                handler). */}
            <button
              type="button"
              className={styles.zoomPurchaseButton}
              data-testid="gallery-zoom"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openLightboxFromControl}
              aria-label={t.gallery.zoomAlt}
            >
              <ZoomGlyph />
            </button>
          </div>
        </div>
      </article>
      {sizeRequestOpen && !giftActive && allowSizeRequest && (
        <SizeRequestModal
          productId={item.id}
          shapeKey={activeShape}
          lengthKey={activeLength}
          photo={photos[0]?.small}
          title={title}
          shapeLabel={item.shape[activeShape] ?? activeShape}
          lengthLabel={item.lengthsByShape[activeShape]?.[activeLength] ?? activeLength}
          onClose={() => setSizeRequestOpen(false)}
        />
      )}
      {lightboxOpen && (
        <PhotoLightbox
          item={shown}
          activeShape={activeShape}
          activeLength={activeLength}
          onSelectShape={selectShape}
          onSelectLength={selectLength}
          index={index}
          onIndexChange={setIndex}
          alt={alt}
          onClose={closeLightbox}
          initialSize={selectedSize}
          originX={lightboxOrigin?.x}
          originY={lightboxOrigin?.y}
          openedAtScrollY={lightboxScrollY}
        />
      )}
    </div>
  );
}

/**
 * Memoized because GalleryGrid re-renders on every scroll frame — that is how
 * useWindowVirtualizer works — and without this each of those frames also
 * re-rendered every mounted card, each of which runs a title auto-fit, a
 * stock lookup and a favorites lookup. Props are stable primitives or
 * feed-identity objects (`item` is never mutated in place); cart/gift
 * context is subscribed once in the grid so memo is not defeated.
 */
export const GalleryCard = memo(GalleryCardImpl);
