/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in pamsurin-back). Do not redeclare them here. */
import type {
  FeaturedPeriod,
  FilterCategory,
  GalleryItem,
  GalleryPhoto,
  GrammaticalGender,
  Trilingual,
} from '../api/contract/gallery-data';

export type { FeaturedPeriod, FilterCategory, GalleryItem, GalleryPhoto, GrammaticalGender, Trilingual };
