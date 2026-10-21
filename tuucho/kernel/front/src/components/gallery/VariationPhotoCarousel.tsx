import type { Size } from '../../api/cart';
import type { GalleryItem } from '../../data/types';
import { variationSlides } from '../../utils/nailVariation';
import { PhotoCarousel } from './PhotoCarousel';

interface VariationPhotoCarouselProps {
  item: GalleryItem;
  shapeKey: string;
  lengthKey: string;
  /** The set size, when known: options not offered in it are left out, as
   * in the variation picker. */
  size: Size | null;
  active: string;
  alt: string;
  onSelect: (variationKey: string) => void;
  /** A tap on the photo (not a swipe). */
  onOpen: (x: number, y: number) => void;
  gateImages?: boolean;
  frameClassName?: string;
}

/**
 * A single nail with variations shown as the gallery's photo slider, one
 * slide per option (the picker's own list, in its order): swiping right or
 * left changes the option. Used by the compose-a-set gallery card and by the
 * composer's carousel cards.
 */
export function VariationPhotoCarousel({
  item,
  shapeKey,
  lengthKey,
  size,
  active,
  alt,
  onSelect,
  onOpen,
  gateImages = false,
  frameClassName,
}: VariationPhotoCarouselProps) {
  const slides = variationSlides(item, shapeKey, lengthKey, size, active);
  return (
    <PhotoCarousel
      images={slides.photos}
      alt={alt}
      index={slides.index}
      onIndexChange={(i) => {
        const key = slides.keys[i];
        if (key) onSelect(key);
      }}
      onOpenLightbox={(_i, x, y) => onOpen(x, y)}
      gateImages={gateImages}
      {...(frameClassName ? { frameClassName } : {})}
    />
  );
}
