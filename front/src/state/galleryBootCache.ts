import { fetchGalleryFeed, type GalleryFeedResult } from '../api/gallery';
import { loadFilterOptions } from '../api/filterOptions';
import type { Lang } from '../assets/i18n';
import type { GalleryFeedCatalog } from './galleryFeedSession';

/** Must match useGalleryFeed's PAGE_LIMIT. */
export const GALLERY_BOOT_PAGE_LIMIT = 24;

interface FeedCache {
  lang: Lang;
  result: GalleryFeedResult;
}

const feedCaches = new Map<GalleryFeedCatalog, FeedCache>();
let preloadStarted = false;

/**
 * Best-effort warm of the gallery first page + filter options while the `/`
 * splash plays. Failures are swallowed: splash exit must not wait, and the
 * page falls back to its own fetch.
 */
export function preloadGalleryBoot(lang: Lang): void {
  if (preloadStarted) return;
  preloadStarted = true;

  void fetchGalleryFeed({ limit: GALLERY_BOOT_PAGE_LIMIT, stock: 'in' }, lang)
    .then((result) => {
      feedCaches.set('sets', { lang, result });
    })
    .catch(() => {
      // Gallery page will fetch normally.
    });

  void loadFilterOptions(lang).catch(() => {
    // Filters stay empty until Gallery mounts its own load.
  });
}

/**
 * Consume a matching default-feed cache once. Returns null when missing,
 * lang-mismatched, or already taken.
 */
export function takeGalleryBootCache(
  lang: Lang,
  catalog: GalleryFeedCatalog = 'sets',
): GalleryFeedResult | null {
  const cached = feedCaches.get(catalog);
  if (!cached || cached.lang !== lang) return null;
  feedCaches.delete(catalog);
  return cached.result;
}
