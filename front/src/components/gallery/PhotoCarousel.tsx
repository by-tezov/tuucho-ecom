import { useCallback, useRef } from 'react';
import { useLang } from '../../assets/i18n';
import { useDragCarousel } from '../../hooks/useDragCarousel';
import { useGatedGalleryImage } from '../../hooks/useGatedGalleryImage';
import { Skeleton } from '../ui/Skeleton';
import { PhotoSwapFade } from './PhotoSwapFade';
import type { GalleryPhoto } from '../../data/types';
import styles from './PhotoCarousel.module.css';

interface PhotoCarouselProps {
  images: GalleryPhoto[];
  alt: string;
  index: number;
  onIndexChange: (index: number) => void;
  /** Tapping the photo itself (not a drag/swipe) opens the lightbox — omit
   * to make the photo purely a slider, with opening the lightbox left to a
   * dedicated trigger elsewhere. */
  onOpenLightbox?: (index: number, x: number, y: number) => void;
  /** When true, thumbnail GETs go through the gallery image concurrency gate. */
  gateImages?: boolean;
  /** Extra class on the outer frame (e.g. ProductPage square corners). */
  frameClassName?: string;
}

function GatedSlide({
  photo,
  alt,
  index,
  retryLabel,
}: {
  photo: GalleryPhoto;
  alt: string;
  index: number;
  retryLabel: string;
}) {
  const { src, status, onLoad, onError, retry } = useGatedGalleryImage(photo.small, photo.modal);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const detachImageListenersRef = useRef<(() => void) | null>(null);

  // A callback ref attaches before the browser can normally settle the newly
  // mounted source. The explicit `complete` check also covers memory-cached
  // images which finished before that attachment. Every retry temporarily
  // removes the img, so a fresh node/listener pair owns each source.
  const setImageRef = useCallback(
    (image: HTMLImageElement | null) => {
      detachImageListenersRef.current?.();
      detachImageListenersRef.current = null;
      imageRef.current = image;
      if (!image) return;

      image.addEventListener('load', onLoad);
      image.addEventListener('error', onError);
      detachImageListenersRef.current = () => {
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
      };

      if (image.complete) {
        queueMicrotask(() => {
          if (imageRef.current !== image) return;
          if (image.naturalWidth > 0) onLoad();
          else onError();
        });
      }
    },
    [onError, onLoad],
  );

  return (
    <div
      className={`${styles.slide} ${styles.gatedSlide}`}
      data-photo-index={index}
      aria-busy={status === 'queued' || status === 'loading'}
    >
      {status !== 'loaded' && status !== 'unavailable' && <Skeleton className={styles.imageSkeleton} />}
      {src && (
        <img
          ref={setImageRef}
          src={src}
          alt={alt}
          className={styles.gatedImage}
          style={{ opacity: status === 'loaded' ? 1 : 0 }}
          data-testid="gallery-carousel-image"
          draggable={false}
        />
      )}
      {status === 'unavailable' && (
        <button
          type="button"
          className={styles.imageRetry}
          onClick={(event) => {
            event.stopPropagation();
            retry();
          }}
          aria-label={retryLabel}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M20 11a8 8 0 1 0-2.34 5.66M20 5v6h-6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

export function PhotoCarousel({
  images,
  alt,
  index,
  onIndexChange,
  onOpenLightbox,
  gateImages = false,
  frameClassName,
}: PhotoCarouselProps) {
  const { t } = useLang();
  const { isDragging, dragOffset, trackRef, goTo, next, prev, canPrev, canNext, trackHandlers } =
    useDragCarousel({
      count: images.length,
      index,
      onIndexChange,
      ...(onOpenLightbox ? { onOpen: onOpenLightbox } : {}),
    });
  const multi = images.length > 1;

  return (
    <div
      className={frameClassName ? `${styles.frame} ${frameClassName}` : styles.frame}
      data-testid="gallery-carousel"
    >
      <div
        ref={trackRef}
        className={styles.track}
        data-testid="gallery-carousel-track"
        style={{
          transform: `translateX(calc(${-index * 100}% + ${dragOffset}px))`,
          transition: isDragging ? 'none' : undefined,
          cursor: isDragging ? 'grabbing' : undefined,
          // A single photo has nothing to swipe between — allow native touch
          // panning in both axes so a horizontal drag scrolls an ancestor
          // (the favorites strip) instead of being claimed for in-card swipe.
          touchAction: multi ? 'pan-y' : 'auto',
        }}
        {...trackHandlers}
        onClickCapture={(event) => event.stopPropagation()}
        role="group"
        aria-roledescription="carousel"
        aria-label={alt}
      >
        {images.map((photo, i) =>
          Math.abs(i - index) <= 1 ? (
            gateImages ? (
              <GatedSlide
                key={photo.small}
                photo={photo}
                alt={multi ? `${alt} (${i + 1}/${images.length})` : alt}
                index={i}
                retryLabel={t.gallery.imageRetry}
              />
            ) : (
              <img
                key={photo.small}
                src={photo.small}
                alt={multi ? `${alt} (${i + 1}/${images.length})` : alt}
                className={styles.slide}
                data-testid="gallery-carousel-image"
                data-photo-index={i}
                draggable={false}
              />
            )
          ) : (
            <div key={photo.small} className={styles.slide} aria-hidden="true" />
          ),
        )}
      </div>
      <PhotoSwapFade sources={images.map((photo) => photo.small)} index={index} />

      {multi && (
        <>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowPrev}`}
            data-testid="gallery-carousel-prev"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            disabled={!canPrev}
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
            className={`${styles.arrow} ${styles.arrowNext}`}
            data-testid="gallery-carousel-next"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            disabled={!canNext}
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
          <span
            className="visuallyHidden"
            aria-live="polite"
            aria-atomic="true"
            data-testid="gallery-carousel-counter"
          >
            {t.gallery.photoLabel} {index + 1}/{images.length}
          </span>
        </>
      )}

      {multi && (
        <div className={styles.dots} role="group" aria-label={alt}>
          {images.map((photo, i) => (
            <button
              key={photo.small}
              type="button"
              className={i === index ? `${styles.dot} ${styles.dotActive}` : styles.dot}
              data-testid="gallery-carousel-dot"
              data-photo-index={i}
              onClick={(e) => {
                e.stopPropagation();
                goTo(i);
              }}
              aria-current={i === index}
              aria-label={`${t.gallery.goToPhoto} ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
