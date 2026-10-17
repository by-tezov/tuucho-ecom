import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductById } from '../../../src/api/gallery';
import type { GalleryItem } from '../../../src/data/types';

type ProductCacheModule = typeof import('../../../src/state/productCache');
let cache: ProductCacheModule;

beforeEach(async () => {
  vi.resetModules();
  cache = await import('../../../src/state/productCache');
});

afterEach(() => {
  vi.useRealTimers();
});

function product(id: string, productType: ProductById['productType'] = 'nail'): ProductById {
  return {
    id,
    productType,
    productUid: 'AB-CD-001',
    title: id,
    desc: '',
    price: 10,
    photo: null,
    available: 1,
  };
}

function set(id: string): GalleryItem {
  return {
    id,
    productUid: 'AB-CD-001',
    title: `set ${id}`,
    desc: '',
    price: 12,
    shape: { almond: 'Amande' },
    lengthsByShape: { almond: { short: 'Court' } },
    photosByShapeLength: { almond: { short: [{ small: '/s.webp' }] } },
    available: { almond: { short: { M: 3 } } },
  } as unknown as GalleryItem;
}

describe('product cache audiences', () => {
  it('maps auth status to an audience, and gift browsing to its own one', () => {
    expect(cache.audienceForStatus('loading')).toBeNull();
    expect(cache.audienceForStatus('authenticated')).toBe('user');
    expect(cache.audienceForStatus('anonymous')).toBe('anon');
    expect(cache.audienceForCatalogue('loading', true)).toBe('gift');
    expect(cache.audienceForCatalogue('authenticated', false)).toBe('user');
  });

  it('never serves an entry to another audience or language', () => {
    cache.seedProducts('fr', 'user', { products: [product('p1')] });
    expect(cache.readProductCache(['p1'], 'fr', 'user').productsById.p1).toBeDefined();
    expect(cache.readProductCache(['p1'], 'fr', 'anon').missingProductIds).toEqual(['p1']);
    expect(cache.readProductCache(['p1'], 'fr', 'gift').missingProductIds).toEqual(['p1']);
    expect(cache.readProductCache(['p1'], 'en', 'user').missingProductIds).toEqual(['p1']);
  });
});

describe('seedProducts', () => {
  it('derives a renderable product from a gallery set without replacing a fetched one', () => {
    cache.seedProducts('fr', 'anon', { sets: [set('s1')] });
    const seeded = cache.readProductCache(['s1'], 'fr', 'anon');
    expect(seeded.missingProductIds).toEqual([]);
    expect(seeded.productsById.s1).toMatchObject({ productType: 'nail', price: 12, photo: '/s.webp' });

    cache.seedProducts('fr', 'anon', { products: [product('s1')] });
    cache.seedProducts('fr', 'anon', { sets: [set('s1')] });
    expect(cache.readProductCache(['s1'], 'fr', 'anon').productsById.s1?.price).toBe(10);
  });

  it('reports a nail without its gallery set, but not an accessory', () => {
    cache.seedProducts('fr', 'anon', { products: [product('n1'), product('a1', 'accessory')] });
    expect(cache.readProductCache(['n1', 'a1'], 'fr', 'anon').missingSetIds).toEqual(['n1']);
  });
});

describe('loadProducts', () => {
  it('fills only what is missing and asks for the set of a nail revealed by the product fetch', async () => {
    cache.seedProducts('fr', 'anon', { products: [product('a1', 'accessory')] });
    const fetchProducts = vi.fn(async (ids: string[]) => ids.map((id) => product(id)));
    const fetchSets = vi.fn(async (ids: string[]) => ids.map(set));

    const snapshot = await cache.loadProducts({
      ids: ['a1', 'n1'],
      lang: 'fr',
      audience: 'anon',
      mode: 'fill',
      fetchProducts,
      fetchSets,
    });

    expect(fetchProducts).toHaveBeenCalledWith(['n1']);
    expect(fetchSets).toHaveBeenCalledWith(['n1']);
    expect(snapshot).toMatchObject({ missingProductIds: [], missingSetIds: [], fromNetwork: true });
  });

  it('does not re-ask for a set the feed already omitted (hidden product)', async () => {
    const fetchProducts = vi.fn(async (ids: string[]) => ids.map((id) => product(id)));
    const fetchSets = vi.fn(async () => [] as GalleryItem[]);
    cache.seedProducts('fr', 'anon', { products: [product('n1')] });
    await cache.loadProducts({
      ids: ['n1'],
      lang: 'fr',
      audience: 'anon',
      mode: 'revalidate',
      fetchProducts,
      fetchSets,
    });
    expect(fetchSets).toHaveBeenCalledTimes(1);
  });

  it('resolves from memory with no request when everything is cached', async () => {
    cache.seedProducts('fr', 'anon', { sets: [set('s1')] });
    const fetchProducts = vi.fn();
    const fetchSets = vi.fn();
    const snapshot = await cache.loadProducts({
      ids: ['s1'],
      lang: 'fr',
      audience: 'anon',
      mode: 'fill',
      fetchProducts,
      fetchSets,
    });
    expect(fetchProducts).not.toHaveBeenCalled();
    expect(fetchSets).not.toHaveBeenCalled();
    expect(snapshot.fromNetwork).toBe(false);
  });

  it('shares one request between concurrent identical callers', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchProducts = vi.fn(async (ids: string[]) => {
      await gate;
      return ids.map((id) => product(id, 'accessory'));
    });
    const options = {
      ids: ['a1'],
      lang: 'fr' as const,
      audience: 'anon' as const,
      mode: 'fill' as const,
      fetchProducts,
      fetchSets: vi.fn(),
    };
    const first = cache.loadProducts(options);
    const second = cache.loadProducts(options);
    release();
    await Promise.all([first, second]);
    expect(fetchProducts).toHaveBeenCalledTimes(1);
  });

  it('marks entries stale after the TTL and forgets everything on invalidate', () => {
    vi.useFakeTimers();
    cache.seedProducts('fr', 'anon', { products: [product('a1', 'accessory')] });
    expect(cache.readProductCache(['a1'], 'fr', 'anon').stale).toBe(false);
    vi.advanceTimersByTime(1_500);
    expect(cache.readProductCache(['a1'], 'fr', 'anon').stale).toBe(true);
    cache.invalidateProductCache('logout');
    expect(cache.readProductCache(['a1'], 'fr', 'anon').missingProductIds).toEqual(['a1']);
  });
});
