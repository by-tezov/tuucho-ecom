import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GalleryFavoritesProvider, useGalleryFavorites } from '@/hooks/useGalleryFavorites';

const testState = vi.hoisted(() => ({
  auth: {
    status: 'authenticated' as 'loading' | 'authenticated' | 'anonymous',
    user: { id: 'account-a' } as { id: string } | null,
    authedRequest: async <T,>(request: (token: string) => Promise<T>) => request('token'),
  },
  listFavorites: vi.fn(),
  upsertFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));

vi.mock('@/state/AuthContext', () => ({ useAuthSession: () => testState.auth }));
vi.mock('@/state/guestCart', () => ({
  loadGuestState: () => ({ favorites: {}, cart: [] }),
  saveGuestState: vi.fn(),
}));
vi.mock('@/api/favorites', () => ({
  listFavorites: testState.listFavorites,
  upsertFavorite: testState.upsertFavorite,
  removeFavorite: testState.removeFavorite,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function Probe() {
  const favorites = useGalleryFavorites();
  return (
    <>
      <span data-testid="favorite">{String(favorites.isFavorite('product-1'))}</span>
      <button type="button" onClick={() => favorites.setFavoriteVariant('product-1', 'almond', 'long')}>
        Change variant
      </button>
      <button type="button" onClick={() => favorites.toggleFavorite('product-1', 'almond', 'long')}>
        Remove
      </button>
    </>
  );
}

afterEach(() => {
  testState.auth.status = 'authenticated';
  testState.auth.user = { id: 'account-a' };
});

describe('GalleryFavoritesProvider mutation ordering', () => {
  it('serializes a variant write before a later removal', async () => {
    const variantWrite = deferred<{ success: true }>();
    testState.listFavorites.mockResolvedValue({
      success: true,
      favorites: [{ productId: 'product-1', shapeKey: 'square', lengthKey: 'short' }],
    });
    testState.upsertFavorite.mockReturnValue(variantWrite.promise);
    testState.removeFavorite.mockResolvedValue({ success: true, deleted: true });

    render(
      <GalleryFavoritesProvider>
        <Probe />
      </GalleryFavoritesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('favorite')).toHaveTextContent('true'));

    fireEvent.click(screen.getByRole('button', { name: 'Change variant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(testState.upsertFavorite).toHaveBeenCalledOnce());
    expect(testState.removeFavorite).not.toHaveBeenCalled();

    variantWrite.resolve({ success: true });
    await waitFor(() => expect(testState.removeFavorite).toHaveBeenCalledOnce());
    expect(screen.getByTestId('favorite')).toHaveTextContent('false');
  });
});
