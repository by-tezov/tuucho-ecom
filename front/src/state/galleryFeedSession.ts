import type { Lang } from '../assets/i18n';
import type { AuthStatus } from './AuthContext';
import type { GalleryItem } from '../data/types';
import type { GalleryFilters, GalleryPriceRange, StockFilter } from '../hooks/useGalleryFeed';

/** In-memory gallery grid: leaving for the cart (or any other route) must
 * not throw away loaded pages / filters, or coming back looks like a reload
 * at the top. Module-level on purpose — GalleryPage unmounts with the route.
 * Keyed by catalogue (`sets` vs `nails`) so compose-nail never restores the
 * set gallery's first page. */
export interface GalleryFeedSession {
  apiLanguage: Lang;
  status: AuthStatus;
  /** Receiver token while the gift lock is live; `null` on the priced shop. */
  giftReceiverToken?: string | null;
  /** Remaining nail budget that was applied as the feed `maxPrice`. */
  giftRemainingBudget?: number | null;
  favoriteIdsKey: string;
  filters: GalleryFilters;
  sizes: string[];
  favoritesOnly: boolean;
  userLibraryOnly: boolean;
  hasUserLibraryItems: boolean;
  stockFilter: StockFilter;
  priceRange: GalleryPriceRange | null;
  items: GalleryItem[];
  totalCount: number;
  nextCursor: string | null;
}

export type GalleryFeedCatalog = 'sets' | 'nails';

const sessions = new Map<GalleryFeedCatalog, GalleryFeedSession>();

export function writeGalleryFeedSession(
  next: GalleryFeedSession,
  catalog: GalleryFeedCatalog = 'sets',
): void {
  sessions.set(catalog, next);
}

export function clearGalleryFeedSession(catalog?: GalleryFeedCatalog): void {
  if (catalog) sessions.delete(catalog);
  else sessions.clear();
}

export function readGalleryFeedSession(
  apiLanguage: Lang,
  status: AuthStatus,
  favoriteIds: string[],
  giftReceiverToken: string | null = null,
  giftRemainingBudget: number | null = null,
  catalog: GalleryFeedCatalog = 'sets',
): GalleryFeedSession | null {
  const session = sessions.get(catalog) ?? null;
  if (!session) return null;
  if (session.apiLanguage !== apiLanguage || session.status !== status) return null;
  if ((session.giftReceiverToken ?? null) !== giftReceiverToken) return null;
  if ((session.giftRemainingBudget ?? null) !== giftRemainingBudget) return null;
  if (session.favoritesOnly && session.favoriteIdsKey !== favoriteIds.join(',')) return null;
  return session;
}
