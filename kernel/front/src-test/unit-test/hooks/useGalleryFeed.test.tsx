import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendUnavailableError } from '@/api/http';
import type { GalleryItem } from '@/data/types';

const api = vi.hoisted(() => ({
  fetchGalleryFeed: vi.fn(),
  fetchGalleryNailsFeed: vi.fn(),
  getReceiverGalleryFeed: vi.fn(),
  takeGalleryBootCache: vi.fn(),
  writeGalleryFeedSession: vi.fn(),
}));
const env = vi.hoisted(() => ({
  status: 'anonymous' as 'anonymous' | 'authenticated',
  outOfStockEnabled: true,
  gift: { active: false, token: null as string | null, hidePrices: true, summary: null as unknown },
}));
const authedRequest = vi.hoisted(
  () =>
    async <T,>(request: (token: string) => Promise<T>) =>
      request('token'),
);

vi.mock('@/api/gallery', () => ({
  fetchGalleryFeed: api.fetchGalleryFeed,
  fetchGalleryNailsFeed: api.fetchGalleryNailsFeed,
}));
vi.mock('@/api/gift', () => ({ getReceiverGalleryFeed: api.getReceiverGalleryFeed }));
vi.mock('@/state/galleryBootCache', () => ({
  GALLERY_BOOT_PAGE_LIMIT: 24,
  takeGalleryBootCache: api.takeGalleryBootCache,
}));
vi.mock('@/state/galleryFeedSession', () => ({
  readGalleryFeedSession: () => null,
  writeGalleryFeedSession: api.writeGalleryFeedSession,
}));
vi.mock('@/state/giftLockSession', () => ({ readGiftLockSession: () => null }));
vi.mock('@/state/AuthContext', () => ({
  useAuthSession: () => ({ status: env.status, authedRequest }),
}));
vi.mock('@/hooks/useFilterOptions', () => ({
  useFilterOptions: () => ({ outOfStockEnabled: env.outOfStockEnabled }),
}));
vi.mock('@/hooks/useGiftReceiver', () => ({ useOptionalGiftReceiver: () => env.gift }));
vi.mock('@/assets/i18n/languagePreference', () => ({ preferredLanguage: () => 'fr' }));

import { useGalleryFeed } from '@/hooks/useGalleryFeed';

function page(ids: string[], nextCursor: string | null = null) {
  return {
    items: ids.map(
      (id) => ({ id, shape: {}, lengthsByShape: {}, photosByShapeLength: {} }) as unknown as GalleryItem,
    ),
    nextCursor,
    totalCount: 99,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const draft = {
  occasion: ['wedding'],
  shape: [],
  length: [],
  sizes: [],
  stockFilter: 'in' as const,
  price: { min: 10, max: 50 },
};

beforeEach(() => {
  env.status = 'anonymous';
  env.outOfStockEnabled = true;
  env.gift = { active: false, token: null, hidePrices: true, summary: null };
  api.takeGalleryBootCache.mockReturnValue(null);
  api.fetchGalleryFeed.mockResolvedValue(page(['a', 'b'], 'c2'));
});

afterEach(() => {
  vi.useRealTimers();
  for (const fn of Object.values(api)) fn.mockReset();
});

describe('useGalleryFeed first page', () => {
  it('paints the splash-prefetched default page without another request', async () => {
    api.takeGalleryBootCache.mockReturnValue(page(['boot'], 'next'));
    const { result } = renderHook(() => useGalleryFeed([]));
    await waitFor(() => expect(result.current.loadingInitial).toBe(false));
    expect(result.current.items.map((i) => i.id)).toEqual(['boot']);
    expect(api.fetchGalleryFeed).not.toHaveBeenCalled();
  });

  it('asks for the in-stock page by default', async () => {
    const { result } = renderHook(() => useGalleryFeed([]));
    await waitFor(() => expect(result.current.loadingInitial).toBe(false));
    expect(api.fetchGalleryFeed).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 24, stock: 'in', userLibraryOnly: false }),
      'fr',
    );
    expect(result.current).toMatchObject({ hasMore: true, totalCount: 99, unfiltered: true });
  });

  it('never lets a slow response for an older filter replace a newer one', async () => {
    const slow = deferred<ReturnType<typeof page>>();
    api.fetchGalleryFeed.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(page(['wedding-1']));
    const { result } = renderHook(() => useGalleryFeed([]));

    act(() => result.current.applyFilters(draft, null));
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['wedding-1']));
    await act(async () => slow.resolve(page(['stale'])));
    expect(result.current.items.map((i) => i.id)).toEqual(['wedding-1']);
  });

  it('flags a failed load for retry, but leaves a confirmed outage to the site-wide notice', async () => {
    api.fetchGalleryFeed.mockRejectedValueOnce(new Error('500'));
    const { result } = renderHook(() => useGalleryFeed([]));
    await waitFor(() => expect(result.current.initialLoadFailed).toBe(true));

    act(() => result.current.retryInitial());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.initialLoadFailed).toBe(false);

    api.fetchGalleryFeed.mockRejectedValueOnce(new BackendUnavailableError());
    act(() => result.current.retryInitial());
    await waitFor(() => expect(result.current.loadingInitial).toBe(false));
    expect(result.current.initialLoadFailed).toBe(false);
  });
});

describe('useGalleryFeed filters', () => {
  it('shows an empty favorites view without asking the server when there are no favorites', async () => {
    const { result } = renderHook(() => useGalleryFeed([]));
    await waitFor(() => expect(result.current.loadingInitial).toBe(false));
    api.fetchGalleryFeed.mockClear();
    act(() => result.current.toggleFavoritesOnly());
    expect(result.current.items).toEqual([]);
    expect(api.fetchGalleryFeed).not.toHaveBeenCalled();
  });

  it('makes favorites an exclusive view that clears the other filters', async () => {
    const { result } = renderHook(() => useGalleryFeed(['fav-1']));
    act(() => result.current.applyFilters(draft, { min: 0, max: 100 }));
    expect(result.current.priceRange).toEqual({ min: 10, max: 50 });

    act(() => result.current.toggleFavoritesOnly());
    expect(result.current).toMatchObject({
      favoritesOnly: true,
      filters: { occasion: [], shape: [], length: [] },
      priceRange: null,
    });
    await waitFor(() =>
      expect(api.fetchGalleryFeed).toHaveBeenLastCalledWith(
        expect.objectContaining({ ids: ['fav-1'] }),
        'fr',
      ),
    );
  });

  it('drops a price range that equals the whole catalogue range', () => {
    const { result } = renderHook(() => useGalleryFeed([]));
    act(() => result.current.applyFilters({ ...draft, price: { min: 0, max: 100 } }, { min: 0, max: 100 }));
    expect(result.current.priceRange).toBeNull();
  });

  it('keeps asking for in-stock designs when the shop disabled the sold-out view', async () => {
    env.outOfStockEnabled = false;
    const { result } = renderHook(() => useGalleryFeed([]));
    act(() => result.current.applyFilters({ ...draft, stockFilter: 'out' }, null));
    await waitFor(() => expect(result.current.stockFilter).toBe('in'));
    expect(api.fetchGalleryFeed).not.toHaveBeenCalledWith(expect.objectContaining({ stock: 'out' }), 'fr');
  });
});

describe('useGalleryFeed next pages', () => {
  it('appends the next page and retries a failed one once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useGalleryFeed([]));
    await waitFor(() => expect(result.current.loadingInitial).toBe(false));

    api.fetchGalleryFeed.mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce(page(['c', 'd']));
    act(() => result.current.loadMore());
    expect(result.current.loadingMore).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.current).toMatchObject({ loadingMore: false, hasMore: false });
    expect(api.fetchGalleryFeed).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c2' }), 'fr');
  });
});

describe('useGalleryFeed in a gift', () => {
  it('uses the receiver feed, hides price filters and only offers in-stock designs', async () => {
    env.gift = { active: true, token: 'gift-token', hidePrices: true, summary: null };
    api.getReceiverGalleryFeed.mockResolvedValue(page(['g1']));
    const { result } = renderHook(() => useGalleryFeed([]));
    act(() => result.current.applyFilters({ ...draft, stockFilter: 'all' }, { min: 0, max: 100 }));
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['g1']));

    const params = api.getReceiverGalleryFeed.mock.lastCall?.[2];
    expect(params).toMatchObject({ stock: 'in', occasion: ['wedding'] });
    expect(params).not.toHaveProperty('minPrice');
    expect(params).not.toHaveProperty('userLibraryOnly');
    expect(api.fetchGalleryFeed).not.toHaveBeenCalled();
  });
});
