import type { GalleryItem } from '../data/types';
import type { Lang } from '../assets/i18n';
import { apiFetch } from './http';
import { rememberNailItems } from '../utils/nailItemCache';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in pamsurin-back). Do not redeclare them here. */
import type {
  CartRuleKind,
  CompositionPageStatus,
  FilterOption,
  FilterOptionsResult,
  GalleryFeedParams,
  GalleryFeedResult,
  ProductById,
  ProductHydrationType,
  PublicCartRule,
} from './contract/gallery';

export type {
  CartRuleKind,
  CompositionPageStatus,
  FilterOption,
  FilterOptionsResult,
  GalleryFeedParams,
  GalleryFeedResult,
  ProductById,
  ProductHydrationType,
  PublicCartRule,
};

/** Boutique switch for the composition page. A missing or failed read stays
 * on: that is the preference default, and the catalogue routes still refuse
 * a page that is actually closed. */
export async function fetchCompositionPageEnabled(): Promise<boolean> {
  return false;
}

async function fetchJson<T>(path: string, lang: Lang, accessToken?: string): Promise<T> {
  const response = await apiFetch(path, {
    headers: { 'Accept-Language': lang, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
  });
  if (!response.ok) {
    throw new Error(`[gallery] GET ${path} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
/**
 * The gallery feed pamsurin-back's database now serves in chunks (see its
 * README) — every function here is a plain on-demand fetch, called from
 * whichever route/component actually needs it, unlike the old module-level
 * top-level-await that blocked every page's first paint on one big fetch.
 * `useGalleryFeed` (src/hooks/useGalleryFeed.ts) is the one that actually
 * drives infinite scroll by calling fetchGalleryFeed page by page.
 */
export async function fetchGalleryFeed(
  params: GalleryFeedParams,
  lang: Lang,
  accessToken?: string,
): Promise<GalleryFeedResult> {
  const query = buildQuery({
    cursor: params.cursor,
    limit: params.limit,
    occasion: params.occasion?.length ? params.occasion.join(',') : undefined,
    shape: params.shape?.length ? params.shape.join(',') : undefined,
    length: params.length?.length ? params.length.join(',') : undefined,
    size: params.size?.length ? params.size.join(',') : undefined,
    ids: params.ids?.length ? params.ids.join(',') : undefined,
    userLibraryOnly: params.userLibraryOnly ? 'true' : undefined,
    stock: params.stock,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
  });
  return fetchJson<GalleryFeedResult>(`/gallery/feed${query}`, lang, accessToken);
}

/** Composition catalogue is not part of this shop. */
export async function fetchGalleryNailsFeed(
  _params: GalleryFeedParams,
  _lang: Lang,
  _accessToken?: string,
): Promise<GalleryFeedResult> {
  return { items: [], nextCursor: null, totalCount: 0 };
}

export async function fetchNailByUid(uid: string, lang: Lang): Promise<GalleryItem | null> {
  const response = await apiFetch(`/gallery/nail/${encodeURIComponent(uid)}`, {
    headers: { 'Accept-Language': lang },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`[gallery] GET /gallery/nail/${uid} failed: ${response.status} ${response.statusText}`);
  }
  const item = (await response.json()) as GalleryItem;
  rememberNailItems([item], lang);
  return item;
}

/** Small, unpaginated — used by the Home page's "Nouveautés" section only. */
export async function fetchFeaturedItems(limit: number, lang: Lang): Promise<GalleryItem[]> {
  return fetchJson<GalleryItem[]>(`/gallery/featured${buildQuery({ limit })}`, lang);
}

/** One set by its `productUid` short code — backs the `/creations/<slug>`
 * product pages when they're reached by client-side navigation. A crawler
 * never depends on this call: the build has no catalogue access by design,
 * so those URLs are served through public/ssr.php, which fills a prerendered
 * shell from the API's own /seo/product/:uid.
 * Resolves to null on 404 (unknown/hidden set → the page renders 404). */
export async function fetchProductByUid(uid: string, lang: Lang): Promise<GalleryItem | null> {
  const response = await apiFetch(`/gallery/set/${encodeURIComponent(uid)}`, {
    headers: { 'Accept-Language': lang },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`[gallery] GET /gallery/set/${uid} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as GalleryItem;
}

export async function fetchFilterOptions(
  lang: Lang,
  options?: { productType?: 'nail' | 'nail_single' },
): Promise<FilterOptionsResult> {
  const query = buildQuery({
    productType: options?.productType === 'nail_single' ? 'nail_single' : undefined,
  });
  return fetchJson<FilterOptionsResult>(`/gallery/filter-options${query}`, lang);
}
/** Resolves product ids for cart hydration — nails and accessories. Missing
 * ids are omitted. Mounted on the gallery router as GET /gallery/products. */
export async function fetchProductsByIds(
  ids: string[],
  lang: Lang,
  accessToken?: string,
): Promise<ProductById[]> {
  if (ids.length === 0) return [];
  return fetchJson<ProductById[]>(
    `/gallery/products${buildQuery({ ids: ids.join(',') })}`,
    lang,
    accessToken,
  );
}

/** Visible accessories flagged for the cart-page upsell carousel. */
export async function fetchCartAccessories(lang: Lang): Promise<ProductById[]> {
  return fetchJson<ProductById[]>('/gallery/cart-accessories', lang);
}
/** Enabled permanent cart-rule params for cart progress / franco preview. */
export async function fetchCartRules(lang: Lang): Promise<PublicCartRule[]> {
  const result = await fetchJson<{ success: true; rules: PublicCartRule[] }>('/gallery/cart-rules', lang);
  return result.rules;
}
