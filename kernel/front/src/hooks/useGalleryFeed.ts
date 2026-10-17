import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchGalleryFeed, fetchGalleryNailsFeed, type GalleryFeedParams } from '../api/gallery';
import { getReceiverGalleryFeed } from '../api/gift';
import { isBackendUnavailableError } from '../api/http';
import { shopConfig } from '../config/env';
import type { GalleryItem } from '../data/types';
import { preferredLanguage } from '../assets/i18n/languagePreference';
import { GALLERY_BOOT_PAGE_LIMIT, takeGalleryBootCache } from '../state/galleryBootCache';
import { readGalleryFeedSession, writeGalleryFeedSession } from '../state/galleryFeedSession';
import { readGiftLockSession } from '../state/giftLockSession';
import { audienceForCatalogue, seedProducts } from '../state/productCache';
import { useAuthSession } from '../state/AuthContext';
import { useFilterOptions } from './useFilterOptions';
import { useOptionalGiftReceiver } from './useGiftReceiver';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function giftGalleryFeedParams(params: GalleryFeedParams, hidePrices: boolean): GalleryFeedParams {
  const { userLibraryOnly: _userLibraryOnly, minPrice, maxPrice, stock, ids, ...rest } = params;
  const next: GalleryFeedParams = { ...rest };
  if (ids && ids.length > 0) {
    next.ids = ids;
    if (stock !== undefined) next.stock = stock;
  } else {
    next.stock = 'in';
  }
  if (!hidePrices) {
    if (minPrice !== undefined) next.minPrice = minPrice;
    if (maxPrice !== undefined) next.maxPrice = maxPrice;
  }
  return next;
}

/** Occasion/shape are both OR-matched within themselves (picking two shapes
 * shows either), same as size — every filter dimension then combines with
 * every other by AND. */
export interface GalleryFilters {
  occasion: string[];
  shape: string[];
  length: string[];
}
/** Which half of the catalogue the grid is showing. Sold-out designs are
 * hidden by default; `'out'` is the deliberate "what did I miss" view;
 * `'all'` shows both together. */
export type StockFilter = 'in' | 'out' | 'all';
export interface GalleryPriceRange {
  min: number;
  max: number;
}
export interface GalleryFilterDraft {
  occasion: string[];
  shape: string[];
  length: string[];
  sizes: string[];
  stockFilter: StockFilter;
  price: GalleryPriceRange;
}

const initialFilters: GalleryFilters = {
  occasion: [],
  shape: [],
  length: [],
};

const PAGE_LIMIT = GALLERY_BOOT_PAGE_LIMIT;
/** A failed loadMore() otherwise leaves the grid silently one page short
 * forever: nextCursor/hasMore stay valid, but GalleryGrid's own
 * scroll-trigger only re-fires once the visitor scrolls away from the end
 * and back — which never happens once the grid already looks complete. One
 * retry after a short pause papers over a transient blip without hammering
 * a genuinely down backend (which gets its own site-wide notice instead —
 * see isBackendUnavailableError below). */
const LOAD_MORE_RETRY_DELAY_MS = 1500;

/**
 * Drives the Gallery page's infinite scroll: filtering/counting now
 * happen server-side (kernel/back's GET /api/gallery/feed) instead of
 * over a fully-loaded in-memory array — see the plan doc's "Milestone 2"
 * section. `loadMore()` fetches the next chunk by cursor; call it from an
 * IntersectionObserver sentinel near the end of the rendered list (same
 * approach as useInViewport elsewhere in this codebase).
 *
 * Loaded item metadata is appended, not evicted, as more pages load —
 * unlike the per-image release GalleryCard's useInViewport already does
 * (which stays exactly as it was), this hook doesn't drop old pages from
 * memory once scrolled past. Metadata is small (not the decoded images,
 * which is what actually matters for memory) and evicting-then-refetching
 * on scroll-back-up is real added complexity; revisit if the gallery grows
 * large enough for this to matter in practice.
 *
 * `favoriteIds` (from useGalleryFavorites, backed by the account's stored
 * favorites — see kernel/back's `favorites` table) is only ever read here
 * when `favoritesOnly` is on — see toggleFavoritesOnly.
 */
export function useGalleryFeed(favoriteIds: string[], options?: { catalog?: 'sets' | 'units' }) {
  const catalog = options?.catalog ?? 'sets';
  const fetchFeed = catalog === 'units' ? fetchGalleryNailsFeed : fetchGalleryFeed;
  const { status, authedRequest } = useAuthSession();
  const gift = useOptionalGiftReceiver();
  const giftRemainingBudget = gift.active ? (gift.summary?.remaining.remainingBudget ?? null) : null;
  const filterData = useFilterOptions({ catalog });
  const outOfStockEnabled = filterData?.outOfStockEnabled !== false;
  const apiLanguage = preferredLanguage();
  const [session] = useState(() =>
    readGalleryFeedSession(
      apiLanguage,
      status,
      favoriteIds,
      typeof window !== 'undefined' ? (readGiftLockSession()?.receiverToken ?? null) : null,
      giftRemainingBudget,
      catalog,
    ),
  );
  const skipInitialFetchRef = useRef(session !== null);
  const restoredSessionSeededRef = useRef(false);
  const restoredFromSession = session !== null;

  const [filters, setFilters] = useState<GalleryFilters>(session?.filters ?? initialFilters);
  const [sizes, setSizes] = useState<string[]>(session?.sizes ?? []);
  // Exclusive with every other filter above — turning it on resets them all
  // (see toggleFavoritesOnly), and changing any of them turns it back off
  // (see the wrapped setters below), so there's never a confusing combined
  // "favorites AND occasion=X" state to reason about.
  const [favoritesOnly, setFavoritesOnly] = useState(session?.favoritesOnly ?? false);
  const [userLibraryOnly, setUserLibraryOnly] = useState(session?.userLibraryOnly ?? false);
  const [hasUserLibraryItems, setHasUserLibraryItems] = useState(session?.hasUserLibraryItems ?? false);
  // Combines with every other filter rather than resetting them (unlike
  // favorites/user-library, which are exclusive views): "out of stock" is a
  // second way to look at whatever the customer already narrowed down to.
  const [stockFilter, setStockFilter] = useState<StockFilter>(session?.stockFilter ?? 'in');
  const [priceRange, setPriceRange] = useState<GalleryPriceRange | null>(session?.priceRange ?? null);

  useEffect(() => {
    if (filterData && !filterData.outOfStockEnabled && stockFilter !== 'in') {
      setStockFilter('in');
    }
  }, [filterData, stockFilter]);

  const [items, setItems] = useState<GalleryItem[]>(session?.items ?? []);
  const [totalCount, setTotalCount] = useState(session?.totalCount ?? 0);
  const [nextCursor, setNextCursor] = useState<string | null>(session?.nextCursor ?? null);
  const [loadingInitial, setLoadingInitial] = useState(!session);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [initialRetryGeneration, setInitialRetryGeneration] = useState(0);

  useEffect(() => {
    if (!session?.items.length || restoredSessionSeededRef.current) return;
    restoredSessionSeededRef.current = true;
    const audience = audienceForCatalogue(status, false);
    if (audience) seedProducts(apiLanguage, audience, { sets: session.items });
    // Restore once — the live feed effect seeds every later fetch.
  }, [apiLanguage, session, status]);

  // Guards a slow, now-stale request from overwriting state once a newer
  // one (from a later filter change) has already resolved.
  const requestIdRef = useRef(0);

  // Only meaningful while favoritesOnly is on — this stays the same empty
  // string across every single favorite toggle otherwise, so favoriting an
  // item while browsing the normal grid doesn't refetch (and fully replace)
  // the whole feed for a filter that isn't even applied. Without this, every
  // heart click below caused a full-grid refetch — new item references for
  // everything, which reset the virtualized grid's scroll position, reading
  // as the page jumping the instant you favorited something.
  const favoriteIdsKey = favoritesOnly ? favoriteIds.join(',') : '';
  const requestedFavoriteIds = useMemo(
    () => (favoriteIdsKey === '' ? [] : favoriteIdsKey.split(',')),
    [favoriteIdsKey],
  );

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
    const requestId = ++requestIdRef.current;

    // An empty `ids` array isn't "no filter" to the API (an omitted `ids`
    // param and an empty one are indistinguishable over the wire, and the
    // backend correctly treats either as "don't filter by id") — so with
    // zero favorites there's nothing a real request could ever return.
    // Short-circuit locally instead of asking the server a question whose
    // answer is already known, and skip stomping on the empty grid a
    // request in flight for a *different* state might currently be filling.
    if (favoritesOnly && requestedFavoriteIds.length === 0) {
      setInitialLoadFailed(false);
      setLoadingInitial(false);
      setItems([]);
      setNextCursor(null);
      setTotalCount(0);
      return;
    }

    // Cold `/` splash may have already fetched this catalogue's default
    // first page — reuse it once so the grid paints without a duplicate
    // round-trip. The cache holds one entry per catalogue (see
    // galleryBootCache), so the unit gallery warms and consumes its own; it
    // can never be handed the set gallery's page.
    const isDefaultFeed =
      !gift.active &&
      status !== 'authenticated' &&
      !favoritesOnly &&
      filters.occasion.length === 0 &&
      filters.shape.length === 0 &&
      filters.length.length === 0 &&
      priceRange === null &&
      // Size, "Mes créations" and the stock view are set-only axes — the
      // nail feed sends none of them, so they cannot make its page
      // non-default. The set boot prefetch asks for the in-stock page, so
      // it can't stand in for the sold-out view.
      (catalog === 'units' || (!userLibraryOnly && sizes.length === 0 && stockFilter === 'in'));
    // Everything the feed returns is exactly what the cart surfaces need to
    // draw a nail line (shape labels, photosByShapeLength, stock). Seeding it
    // here is what lets "add from the gallery, open the drawer" cost zero
    // requests — see state/productCache.ts.
    const seedFromFeed = (feedItems: GalleryItem[]) => {
      const audience = audienceForCatalogue(status, gift.active);
      if (audience) seedProducts(apiLanguage, audience, { sets: feedItems });
    };

    if (isDefaultFeed) {
      const cached = takeGalleryBootCache(apiLanguage, catalog);
      if (cached) {
        setInitialLoadFailed(false);
        seedFromFeed(cached.items);
        setItems(cached.items);
        setNextCursor(cached.nextCursor);
        setTotalCount(cached.totalCount);
        setHasUserLibraryItems(false);
        setLoadingInitial(false);
        return;
      }
    }

    setLoadingInitial(true);
    setInitialLoadFailed(false);
    const request = (params: Parameters<typeof fetchGalleryFeed>[0]) => {
      if (gift.active && gift.token && catalog !== 'units') {
        return getReceiverGalleryFeed(
          gift.token,
          apiLanguage,
          giftGalleryFeedParams(params, gift.hidePrices),
        );
      }
      return status === 'authenticated'
        ? authedRequest((accessToken) => fetchFeed(params, apiLanguage, accessToken))
        : fetchFeed(params, apiLanguage);
    };
    request({
      limit: PAGE_LIMIT,
      occasion: filters.occasion,
      shape: filters.shape,
      length: filters.length,
      ...(catalog === 'sets' ? { size: sizes } : {}),
      userLibraryOnly: catalog === 'units' ? false : userLibraryOnly,
      ...(catalog === 'sets' ? { stock: outOfStockEnabled ? stockFilter : 'in' } : {}),
      ...(favoritesOnly ? { ids: requestedFavoriteIds } : {}),
      ...(priceRange ? { minPrice: priceRange.min, maxPrice: priceRange.max } : {}),
    })
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        seedFromFeed(result.items);
        setItems(result.items);
        setNextCursor(result.nextCursor);
        setTotalCount(result.totalCount);
        setHasUserLibraryItems(result.hasUserLibraryItems === true);
      })
      .catch((error) => {
        if (requestIdRef.current !== requestId) return;
        // The backend-wide unavailable view owns confirmed outages. Other
        // failures remain recoverable instead of silently looking like an
        // empty catalogue; callers can expose retry when appropriate.
        if (!isBackendUnavailableError(error)) setInitialLoadFailed(true);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoadingInitial(false);
      });
  }, [
    filters.occasion,
    filters.shape,
    filters.length,
    sizes,
    favoritesOnly,
    userLibraryOnly,
    stockFilter,
    outOfStockEnabled,
    priceRange,
    favoriteIdsKey,
    requestedFavoriteIds,
    apiLanguage,
    status,
    authedRequest,
    gift.active,
    gift.hidePrices,
    gift.token,
    giftRemainingBudget,
    initialRetryGeneration,
    catalog,
    fetchFeed,
  ]);

  // Enforces a minimum visible loading time for each next-page fetch (see
  // VITE_GALLERY_LOAD_MORE_DELAY) — deliberate, not a bug: it gives the
  // skeleton loading state (see GalleryGrid.tsx) room to actually register
  // instead of flashing past unnoticed on a fast connection, and it caps
  // how fast consecutive pages can load even for a very fast scroller,
  // since loadMore() below is a no-op while loadingMore is still true.
  const attemptLoadMore = (cursor: string, requestId: number, isRetry: boolean) => {
    const params = {
      cursor,
      limit: PAGE_LIMIT,
      occasion: filters.occasion,
      shape: filters.shape,
      length: filters.length,
      ...(catalog === 'sets' ? { size: sizes } : {}),
      userLibraryOnly: catalog === 'units' ? false : userLibraryOnly,
      ...(catalog === 'sets' ? { stock: outOfStockEnabled ? stockFilter : 'in' } : {}),
      ...(favoritesOnly ? { ids: favoriteIds } : {}),
      ...(priceRange ? { minPrice: priceRange.min, maxPrice: priceRange.max } : {}),
    };
    Promise.all([
      gift.active && gift.token && catalog !== 'units'
        ? getReceiverGalleryFeed(gift.token, apiLanguage, giftGalleryFeedParams(params, gift.hidePrices))
        : status === 'authenticated'
          ? authedRequest((accessToken) => fetchFeed(params, apiLanguage, accessToken))
          : fetchFeed(params, apiLanguage),
      delay(shopConfig.galleryLoadMoreDelayMs),
    ])
      .then(([result]) => {
        if (requestIdRef.current !== requestId) return;
        const audience = audienceForCatalogue(status, gift.active);
        if (audience) seedProducts(apiLanguage, audience, { sets: result.items });
        setItems((current) => [...current, ...result.items]);
        setNextCursor(result.nextCursor);
        setLoadingMore(false);
      })
      .catch((error) => {
        if (requestIdRef.current !== requestId) return;
        if (!isRetry && !isBackendUnavailableError(error)) {
          window.setTimeout(() => attemptLoadMore(cursor, requestId, true), LOAD_MORE_RETRY_DELAY_MS);
          return;
        }
        setLoadingMore(false);
      });
  };

  const loadMore = () => {
    if (loadingInitial || loadingMore || !nextCursor) return;
    setLoadingMore(true);
    attemptLoadMore(nextCursor, requestIdRef.current, false);
  };

  /** Turning on resets every other filter field to its default first
   * (favorites is meant as a quick, exclusive view, not another dimension
   * to combine with occasion/shape/length); turning off just goes
   * back to that same unfiltered default state. */
  const toggleFavoritesOnly = () => {
    const next = !favoritesOnly;
    if (next) {
      setFilters(initialFilters);
      setSizes([]);
      setPriceRange(null);
    }
    setFavoritesOnly(next);
    setUserLibraryOnly(false);
  };

  const toggleUserLibraryOnly = () => {
    const next = !userLibraryOnly;
    if (next) {
      setFilters(initialFilters);
      setSizes([]);
      setPriceRange(null);
    }
    setFavoritesOnly(false);
    setUserLibraryOnly(next);
  };

  const reset = () => {
    setFilters(initialFilters);
    setSizes([]);
    setFavoritesOnly(false);
    setUserLibraryOnly(false);
    setStockFilter('in');
    setPriceRange(null);
  };

  /** Commits a whole draft bundle at once — the gallery filter sheet's
   * "Valider" — instead of one field at a time, so opening the sheet,
   * changing several sections, then applying only ever triggers a single
   * feed refetch. Same favorites/library-exit side effect every other
   * filter setter above already has. */
  const applyFilters = (next: GalleryFilterDraft, priceCatalogue: GalleryPriceRange | null) => {
    setFavoritesOnly(false);
    setUserLibraryOnly(false);
    setFilters({ occasion: next.occasion, shape: next.shape, length: next.length });
    setSizes(next.sizes);
    setStockFilter(next.stockFilter);
    if (priceCatalogue && (next.price.min > priceCatalogue.min || next.price.max < priceCatalogue.max)) {
      setPriceRange({ min: next.price.min, max: next.price.max });
    } else {
      setPriceRange(null);
    }
  };

  useEffect(() => {
    if (loadingInitial) return;
    if (gift.active && !gift.token) return;
    writeGalleryFeedSession(
      {
        apiLanguage,
        status,
        giftReceiverToken: gift.token,
        giftRemainingBudget,
        favoriteIdsKey,
        filters,
        sizes,
        favoritesOnly,
        userLibraryOnly,
        hasUserLibraryItems,
        stockFilter,
        priceRange,
        items,
        totalCount,
        nextCursor,
      },
      catalog,
    );
  }, [
    loadingInitial,
    gift.active,
    gift.token,
    giftRemainingBudget,
    apiLanguage,
    status,
    favoriteIdsKey,
    filters,
    sizes,
    catalog,
    favoritesOnly,
    userLibraryOnly,
    hasUserLibraryItems,
    stockFilter,
    priceRange,
    items,
    totalCount,
    nextCursor,
  ]);

  return {
    filters,
    sizes,
    favoritesOnly,
    toggleFavoritesOnly,
    userLibraryOnly,
    toggleUserLibraryOnly,
    hasUserLibraryItems,
    stockFilter,
    priceRange,
    applyFilters,
    items,
    totalCount,
    hasMore: nextCursor !== null,
    loadingInitial,
    initialLoadFailed,
    retryInitial: () => setInitialRetryGeneration((generation) => generation + 1),
    loadingMore,
    loadMore,
    reset,
    restoredFromSession,
    unfiltered:
      !favoritesOnly &&
      !userLibraryOnly &&
      filters.occasion.length === 0 &&
      filters.shape.length === 0 &&
      filters.length.length === 0 &&
      sizes.length === 0 &&
      stockFilter === 'in' &&
      priceRange === null,
  };
}
