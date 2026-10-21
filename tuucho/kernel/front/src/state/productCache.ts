import type { GalleryItem } from '../data/types';
import type { ProductById } from '../api/gallery';
import type { Lang } from '../assets/i18n/types';
import { shopConfig } from '../config/env';

/**
 * Shared in-memory cache for the product data cart surfaces need to render.
 *
 * Cart lines carry identifiers only (see useCart.tsx's CartItem — no title,
 * photo or price), so every cart surface has to hydrate before it can draw
 * anything. Without a cache the header drawer refetched all of it on every
 * single open, behind a blocking spinner, even though the gallery the
 * customer just added from had already loaded exactly that data.
 *
 * Deliberately module-level and memory-only — never sessionStorage or
 * localStorage. That makes the lifetime exactly "this page, this tab": a
 * refresh, a new tab or reopening the browser all start cold, which is the
 * intended refresh point. Login/logout are handled by the audience key plus
 * invalidateProductCache.
 *
 * Nothing here is a source of truth about stock. Cached quantities only
 * decide what the UI *shows*; checkout re-prices and locks
 * product_availability server-side (kernel/back's reserveCart), and that
 * remains the only authoritative check.
 */

/** `/gallery/products` answers differently per audience: it returns extra
 * user-library products for a signed-in customer and is sent with
 * `private, no-store`. An entry is therefore only valid for the audience it
 * was fetched under, never shared across the two. Gift-lock catalogue
 * (prices often omitted) uses `'gift'` so it cannot leak into or from the
 * priced shop cache. */
export type CacheAudience = 'anon' | 'user' | 'gift';

/** Maps auth status onto a cache audience. `null` means "not yet known" —
 * callers must neither read nor write the cache then, or a session that is
 * about to resolve as signed-in would first write entries under 'anon'.
 * Takes the literal union rather than importing AuthStatus so this module
 * stays free of any dependency on AuthContext. */
export function audienceForStatus(status: 'loading' | 'authenticated' | 'anonymous'): CacheAudience | null {
  if (status === 'loading') return null;
  return status === 'authenticated' ? 'user' : 'anon';
}

/** Gift browsing must not read or write the priced shop cache. */
export function audienceForCatalogue(
  status: 'loading' | 'authenticated' | 'anonymous',
  giftActive: boolean,
): CacheAudience | null {
  if (giftActive) return 'gift';
  return audienceForStatus(status);
}

export interface ProductSnapshot {
  productsById: Record<string, ProductById>;
  gallerySets: Record<string, GalleryItem>;
  /** Requested ids with no ProductById cached — a genuine cold miss. */
  missingProductIds: string[];
  /** Nail ids with no GalleryItem cached. Only some surfaces treat this as a
   * blocking miss (the drawer degrades gracefully; the cart page cannot). */
  missingSetIds: string[];
  /** Older than the TTL: still returned and rendered, but worth revalidating. */
  stale: boolean;
  /** True only for a snapshot that came back from a real response. Callers
   * must not treat a cache hit as proof that a missing id no longer exists —
   * see CartPage's guest-cart pruning. */
  fromNetwork: boolean;
}

interface CacheEntry {
  productsById: Record<string, ProductById>;
  gallerySets: Record<string, GalleryItem>;
  /** Per-product fetch time, so one late addition doesn't reset the whole
   * entry's clock (and vice versa). */
  fetchedAt: Record<string, number>;
}

type FetchMode = 'fill' | 'revalidate';

interface LoadOptions {
  ids: string[];
  lang: Lang;
  audience: CacheAudience;
  /** 'fill' fetches only what's missing (cheap, blocks a cold render);
   * 'revalidate' refetches everything asked for so stock actually refreshes
   * (silent, never blocks). */
  mode: FetchMode;
  fetchProducts: (ids: string[]) => Promise<ProductById[]>;
  fetchSets: (nailIds: string[]) => Promise<GalleryItem[]>;
}

/** Keeps a long multilingual session from growing without bound. Only cart
 * and recently-viewed ids ever land here, so this is a safety net rather
 * than a working limit. */
const MAX_ENTRIES = 8;

const entries = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ProductSnapshot>>();

function keyFor(lang: Lang, audience: CacheAudience): string {
  return `${lang}::${audience}`;
}

function emptyEntry(): CacheEntry {
  return { productsById: {}, gallerySets: {}, fetchedAt: {} };
}

/** Drops whole-language/audience entries once past twice the TTL, then caps
 * the total. Runs on write, so an idle tab never does this work. */
function prune(): void {
  const cutoff = Date.now() - shopConfig.productCacheTtlMs * 2;
  for (const [key, entry] of entries) {
    const times = Object.values(entry.fetchedAt);
    if (times.length > 0 && times.every((at) => at < cutoff)) entries.delete(key);
  }
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    entries.delete(oldest.value);
  }
}

function snapshotFrom(entry: CacheEntry, ids: string[], fromNetwork: boolean): ProductSnapshot {
  const productsById: Record<string, ProductById> = {};
  const gallerySets: Record<string, GalleryItem> = {};
  const missingProductIds: string[] = [];
  const missingSetIds: string[] = [];
  const freshCutoff = Date.now() - shopConfig.productCacheTtlMs;
  let stale = false;

  for (const id of ids) {
    const product = entry.productsById[id];
    if (product) {
      productsById[id] = product;
      const set = entry.gallerySets[id];
      if (set) gallerySets[id] = set;
      // Only nails have a gallery set; an accessory is complete without one.
      else if (product.productType === 'nail') missingSetIds.push(id);
    } else {
      missingProductIds.push(id);
      // A set can be seeded from the gallery before its ProductById exists.
      const set = entry.gallerySets[id];
      if (set) gallerySets[id] = set;
    }
    if ((entry.fetchedAt[id] ?? 0) < freshCutoff) stale = true;
  }

  return { productsById, gallerySets, missingProductIds, missingSetIds, stale, fromNetwork };
}

/** Synchronous read — what the caller can already draw, and what it still
 * needs. Never triggers a request. */
export function readProductCache(ids: string[], lang: Lang, audience: CacheAudience): ProductSnapshot {
  return snapshotFrom(entries.get(keyFor(lang, audience)) ?? emptyEntry(), ids, false);
}

/** Feeds the cache from a fetch some other screen already paid for — the
 * gallery feed, the cart-accessory carousel, the product page. This is what
 * makes "add from the gallery, open the drawer" cost zero requests. */
/** Every field a cart line needs to render (title, price, a photo,
 * shape→length→size stock) is already on a GalleryItem — the feed IS the
 * source /gallery/products itself reads from. Derives the equivalent
 * ProductById so seeding from the feed satisfies a cold miss outright,
 * instead of only ever filling gallerySets and leaving productsById (what
 * CartControl/CartPage actually gate rendering on) permanently missing.
 * Only ever nails: the gallery feed never returns accessories. */
function productFromGalleryItem(item: GalleryItem): ProductById {
  const firstShapeKey = Object.keys(item.shape)[0];
  const firstLengthKey = firstShapeKey ? Object.keys(item.lengthsByShape[firstShapeKey] ?? {})[0] : undefined;
  const photo =
    (firstShapeKey &&
      firstLengthKey &&
      item.photosByShapeLength[firstShapeKey]?.[firstLengthKey]?.[0]?.small) ||
    null;
  return {
    id: item.id,
    productType: 'nail',
    productUid: item.productUid,
    title: item.title,
    desc: item.desc,
    price: item.price,
    photo,
    available: item.available,
  };
}

export function seedProducts(
  lang: Lang,
  audience: CacheAudience,
  seed: { products?: ProductById[]; sets?: GalleryItem[] },
): void {
  const key = keyFor(lang, audience);
  const entry = entries.get(key) ?? emptyEntry();
  const now = Date.now();
  for (const product of seed.products ?? []) {
    entry.productsById[product.id] = product;
    entry.fetchedAt[product.id] = now;
  }
  for (const set of seed.sets ?? []) {
    entry.gallerySets[set.id] = set;
    // A real fetched ProductById always wins over this approximation — never
    // overwrite one that's already here (e.g. from loadProducts).
    entry.productsById[set.id] ??= productFromGalleryItem(set);
    entry.fetchedAt[set.id] ??= now;
  }
  entries.set(key, entry);
  prune();
}

/**
 * Resolves everything the caller asked for, fetching only what it has to.
 *
 * Concurrent callers wanting the same thing share one request (the drawer
 * and the cart page can both mount at once, and StrictMode double-invokes
 * effects in development).
 */
export function loadProducts(options: LoadOptions): Promise<ProductSnapshot> {
  const { ids, lang, audience, mode, fetchProducts, fetchSets } = options;
  const key = keyFor(lang, audience);
  const cached = entries.get(key) ?? emptyEntry();
  const snapshot = snapshotFrom(cached, ids, false);

  const productIdsToFetch = mode === 'revalidate' ? ids : snapshot.missingProductIds;
  const setIdsToFetch =
    mode === 'revalidate'
      ? ids.filter((id) => cached.productsById[id]?.productType !== 'accessory')
      : snapshot.missingSetIds;

  if (productIdsToFetch.length === 0 && setIdsToFetch.length === 0) {
    return Promise.resolve(snapshot);
  }

  const dedupeKey = `${key}::${mode}::${[...productIdsToFetch].sort().join(',')}|${[...setIdsToFetch].sort().join(',')}`;
  const existing = inFlight.get(dedupeKey);
  if (existing) return existing;

  const request = (async (): Promise<ProductSnapshot> => {
    // Sets known to be needed up front can go in parallel with the product
    // request; ids never seen before cannot, because only the product tells
    // us whether it is a nail (and therefore has a gallery set at all).
    const [products, knownSets] = await Promise.all([
      productIdsToFetch.length > 0 ? fetchProducts(productIdsToFetch) : Promise.resolve([]),
      setIdsToFetch.length > 0 ? fetchSets(setIdsToFetch) : Promise.resolve([]),
    ]);

    const write = (fetchedProducts: ProductById[], fetchedSets: GalleryItem[]) => {
      // Re-read rather than reusing `cached`: an invalidate or a competing
      // write may have landed while this request was in flight.
      const entry = entries.get(key) ?? emptyEntry();
      const now = Date.now();
      for (const product of fetchedProducts) {
        entry.productsById[product.id] = product;
        entry.fetchedAt[product.id] = now;
      }
      for (const set of fetchedSets) {
        entry.gallerySets[set.id] = set;
        entry.fetchedAt[set.id] = now;
      }
      entries.set(key, entry);
      prune();
      return entry;
    };

    let entry = write(products, knownSets);

    // Second pass for nails whose type was only just revealed. Without this a
    // cold miss would resolve with no gallery set at all, and nothing would
    // ever ask for one again (the cart's ids haven't changed, so the effect
    // does not re-run). Ids already asked for above are excluded: the feed
    // legitimately omits hidden products, and retrying those every time
    // would turn each revalidation into a guaranteed second request.
    const alreadyAsked = new Set(setIdsToFetch);
    const followUpSetIds = snapshotFrom(entry, ids, false).missingSetIds.filter(
      (id) => !alreadyAsked.has(id),
    );
    if (followUpSetIds.length > 0) {
      entry = write([], await fetchSets(followUpSetIds));
    }

    return snapshotFrom(entry, ids, true);
  })();

  inFlight.set(dedupeKey, request);
  return request.finally(() => {
    inFlight.delete(dedupeKey);
  });
}

/**
 * Wipes everything. Called when what the backend would answer has changed
 * in a way the TTL must not paper over:
 *  - `login` / `logout`: a different audience sees a different catalogue,
 *    and signed-in responses are `private, no-store`.
 *  - `order`: stock just moved because of this customer.
 *
 * In-flight requests are deliberately left alone; each re-reads the entry
 * when it resolves, so at worst it re-populates data that was about to be
 * fetched again anyway.
 */
export function invalidateProductCache(_reason: 'login' | 'logout' | 'order'): void {
  entries.clear();
}
