import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchGalleryFeed: vi.fn(),
  loadFilterOptions: vi.fn(),
}));
vi.mock('../../../src/api/gallery', () => ({
  fetchGalleryFeed: api.fetchGalleryFeed,
}));
vi.mock('../../../src/api/filterOptions', () => ({ loadFilterOptions: api.loadFilterOptions }));

type BootCacheModule = typeof import('../../../src/state/galleryBootCache');
let boot: BootCacheModule;

beforeEach(async () => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.loadFilterOptions.mockResolvedValue({});
  vi.resetModules();
  boot = await import('../../../src/state/galleryBootCache');
});

const setsPage = { items: [{ id: 'set' }] };

describe('gallery boot cache', () => {
  it('warms the gallery with the exact default query the page will ask for', async () => {
    api.fetchGalleryFeed.mockResolvedValue(setsPage);
    boot.preloadGalleryBoot('fr');
    boot.preloadGalleryBoot('fr');
    await vi.waitFor(() => expect(boot.takeGalleryBootCache('fr')).toBe(setsPage));

    expect(api.fetchGalleryFeed).toHaveBeenCalledTimes(1);
    expect(api.fetchGalleryFeed).toHaveBeenCalledWith(
      { limit: boot.GALLERY_BOOT_PAGE_LIMIT, stock: 'in' },
      'fr',
    );
    expect(api.loadFilterOptions).toHaveBeenCalledWith('fr');
  });

  it('serves a page once, only to its own language', async () => {
    api.fetchGalleryFeed.mockResolvedValue(setsPage);
    boot.preloadGalleryBoot('fr');
    await vi.waitFor(() => expect(api.fetchGalleryFeed).toHaveBeenCalled());
    await Promise.resolve();

    expect(boot.takeGalleryBootCache('en')).toBeNull();
    expect(boot.takeGalleryBootCache('fr')).toBe(setsPage);
    expect(boot.takeGalleryBootCache('fr')).toBeNull();
  });
});
