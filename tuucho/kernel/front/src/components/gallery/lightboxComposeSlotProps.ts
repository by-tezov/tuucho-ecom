import type { GalleryItem } from '../../data/types';

/** Props for `slot.gallery.lightbox.compose` (shape/length of the open zoom). */
export function lightboxComposeSlotProps(
  item: GalleryItem,
  media: unknown,
  activeShape: string,
  activeLength: string,
) {
  return {
    product: item,
    media,
    activeShape,
    activeLength,
  };
}
