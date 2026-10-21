import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@kernel/front/assets/i18n';
import { Chip } from '@kernel/front/components/ui/Chip';
import { Figure } from '@kernel/front/components/ui/Figure';
import { useCartCommands, useCartData, useCartOverlay } from '@kernel/front/hooks/useCart';
import { useOptionalGiftReceiver } from '@kernel/front/hooks/useGiftReceiver';
import { useOutOfStockSizeFlags } from '@kernel/front/hooks/useFilterOptions';
import { FavoriteButton } from '@kernel/front/components/gallery/FavoriteButton';
import { PhotoLightbox } from '@kernel/front/components/gallery/PhotoLightbox';
import { SizeRequestModal } from '@kernel/front/components/gallery/SizeRequestModal';
import { useGalleryFavorites } from '@kernel/front/hooks/useGalleryFavorites';
import type { GalleryItem } from '@kernel/front/data/types';
import type { Size } from '@kernel/front/api/cart';
import { defaultLengthKey, defaultShapeKey } from '@kernel/front/data/galleryShape';
import { availableQuantityFor, availableSizesFor, preferredAvailableSize } from '@kernel/front/utils/availability';
import { formatPrice } from '@kernel/front/utils/formatPrice';
import { SIZES, SIZE_SELECTION_PRIORITY } from '@kernel/front/data/sizes';
import styles from './NewArrivalCard.module.css';

interface NewArrivalCardProps {
  item: GalleryItem;
  altPrefix: string;
}

export function NewArrivalCard({ item, altPrefix }: NewArrivalCardProps) {
  const { t } = useLang();
  const gift = useOptionalGiftReceiver();
  const { allowSizeRequest } = useOutOfStockSizeFlags();
  const { cartReady, getCartLine } = useCartData();
  const { addToCart } = useCartCommands();
  const { registerModalClose } = useCartOverlay();
  const title = item.title;
  const shapeKeys = Object.keys(item.shape);
  const { isFavorite, getFavoriteVariant, setFavoriteVariant } = useGalleryFavorites();
  const sharedShape = isFavorite(item.id) ? getFavoriteVariant(item.id)?.shapeKey : undefined;
  const [activeShape, setActiveShape] = useState(() =>
    sharedShape && item.photosByShapeLength[sharedShape] ? sharedShape : defaultShapeKey(item),
  );
  // No length picker exists yet, so the active length always follows the
  // active shape's first one — see GalleryItem.lengthsByShape.
  const activeLength = defaultLengthKey(item, activeShape);
  // The home strip deliberately uses one static preview. Its arrows page
  // between products; they must never become a second, nested photo carousel.
  const photo = item.photosByShapeLength[activeShape]?.[activeLength]?.[0];
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [sizeRequestOpen, setSizeRequestOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOrigin, setLightboxOrigin] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const cartLine = getCartLine(item.id);
  const availableSizes = availableSizesFor(item.available, activeShape, activeLength, SIZES);
  const cartSize = cartLine?.size === '' ? undefined : cartLine?.size;
  const [selectedSize, setSelectedSize] = useState<Size>(
    () =>
      preferredAvailableSize(item.available, activeShape, activeLength, SIZE_SELECTION_PRIORITY, [
        cartSize,
      ]) ?? 'M',
  );

  useEffect(() => {
    setSelectedSize(
      (current) =>
        preferredAvailableSize(item.available, activeShape, activeLength, SIZE_SELECTION_PRIORITY, [
          current,
        ]) ?? current,
    );
  }, [activeLength, activeShape, item.available]);

  function selectShape(key: string) {
    if (key === activeShape) return;
    const nextPhotos = item.photosByShapeLength[key]?.[defaultLengthKey(item, key)] ?? [];
    setActiveShape(key);
    setLightboxIndex((current) => Math.max(0, Math.min(current, nextPhotos.length - 1)));
    if (isFavorite(item.id)) setFavoriteVariant(item.id, key, defaultLengthKey(item, key));
  }

  const openLightbox = (origin: { x: number; y: number }) => {
    triggerRef.current = document.activeElement as HTMLElement;
    setLightboxIndex(0);
    setLightboxOrigin(origin);
    setLightboxOpen(true);
  };
  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    registerModalClose(closeLightbox);
    return () => registerModalClose(null);
  }, [closeLightbox, lightboxOpen, registerModalClose]);

  function handleAddToCart() {
    addToCart(
      item.id,
      activeShape,
      activeLength,
      selectedSize,
      { title: item.title, photo: photo?.small ?? null, price: item.price },
      1,
      availableQuantityFor(item.available, activeShape, activeLength, selectedSize),
    );
  }

  return (
    <>
      <article className={styles.card}>
        <div className={styles.photoWrap}>
          <button
            type="button"
            className={styles.photoZoomHit}
            data-testid="home-featured-zoom"
            aria-label={t.gallery.zoomAlt}
            onClick={(e) => openLightbox({ x: e.clientX, y: e.clientY })}
          />
          <Figure
            src={photo?.small ?? ''}
            alt={`${altPrefix}${title}`}
            aspectRatio="1 / 1"
            bordered={false}
            draggable={false}
          />
          <FavoriteButton
            itemId={item.id}
            shapeKey={activeShape}
            lengthKey={activeLength}
            variant="floating"
          />
          <div className={styles.shapeBadges}>
            {shapeKeys.map((key) => (
              <Chip key={key} active={key === activeShape} onClick={() => selectShape(key)}>
                {item.shape[key]}
              </Chip>
            ))}
          </div>
        </div>
        <div className={styles.caption}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.desc}>{item.desc}</p>
          <div className={styles.sizeRow}>
            {availableSizes.length > 0 ? (
              <div className={styles.sizeGroup} role="group" aria-label={t.gallery.sizeLabel}>
                {availableSizes.map((size) => (
                  <Chip key={size} active={size === selectedSize} onClick={() => setSelectedSize(size)}>
                    {size}
                  </Chip>
                ))}
              </div>
            ) : (
              <div className={styles.outOfStockBlock}>
                <p className={styles.outOfStock}>{t.gallery.outOfStockNotice}</p>
                {allowSizeRequest && !gift.active && (
                  <button
                    type="button"
                    className={styles.sizeRequestButton}
                    onClick={() => setSizeRequestOpen(true)}
                  >
                    {t.gallery.sizeRequestCta}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className={styles.purchaseRow}>
            {item.price !== undefined && <span className={styles.price}>{formatPrice(item.price)}</span>}
            {/* Sold out for this shape: the caption offers the size request
                instead — same rule as GalleryCard. */}
            {availableSizes.length > 0 && (!gift.active || gift.canMutate) && (
              <button
                type="button"
                className={styles.addButton}
                onClick={handleAddToCart}
                disabled={!cartReady}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
                {t.gallery.addCta}
              </button>
            )}
          </div>
        </div>
      </article>
      {sizeRequestOpen && !gift.active && allowSizeRequest && (
        <SizeRequestModal
          productId={item.id}
          shapeKey={activeShape}
          lengthKey={activeLength}
          photo={photo?.small}
          title={title}
          shapeLabel={item.shape[activeShape] ?? activeShape}
          lengthLabel={item.lengthsByShape[activeShape]?.[activeLength] ?? activeLength}
          onClose={() => setSizeRequestOpen(false)}
        />
      )}
      {lightboxOpen && (
        <PhotoLightbox
          item={item}
          activeShape={activeShape}
          activeLength={activeLength}
          onSelectShape={selectShape}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          alt={`${altPrefix}${title}`}
          onClose={closeLightbox}
          initialSize={selectedSize}
          originX={lightboxOrigin?.x}
          originY={lightboxOrigin?.y}
        />
      )}
    </>
  );
}
