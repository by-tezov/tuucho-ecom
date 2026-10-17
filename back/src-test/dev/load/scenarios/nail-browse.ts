import http from 'k6/http';
import { check } from 'k6';
import { apiBaseUrl, getJson, successEnvelope } from '../_lib/http.ts';
import type { LoadSetupData } from '../_lib/types.ts';

function hasFeedItems(body: unknown): boolean {
  return Array.isArray((body as { items?: unknown })?.items);
}

function hasShapeFilters(body: unknown): boolean {
  return Array.isArray((body as { shape?: unknown })?.shape);
}

/** The shop host's PHP relays send these; without them the API answers 410. */
const SSR_RELAY = { 'X-Lumen-Ssr-Relay': '1' };
const SITEMAP_RELAY = { 'X-Lumen-Sitemap-Relay': '1' };

function seoDocumentOk(body: unknown): boolean {
  const doc = body as { title?: string; head?: string; body?: string } | null;
  return Boolean(doc?.title && doc.head && doc.body);
}

/** What a crawler costs: every SEO relay route renders the whole catalogue
 * (or one product plus its related row) from the database on a cache miss. */
function crawl(baseUrl: string, data: LoadSetupData): void {
  getJson(baseUrl, '/seo/gallery?lang=fr', 'seo_gallery', seoDocumentOk, undefined, SSR_RELAY);
  getJson(baseUrl, '/seo/gallery-nail?lang=fr', 'seo_gallery_nail', seoDocumentOk, undefined, SSR_RELAY);
  const set = data.catalogs[(__VU + __ITER) % data.catalogs.length];
  if (set) {
    getJson(
      baseUrl,
      `/seo/product/${encodeURIComponent(set.productUid.toLowerCase())}?lang=fr`,
      'seo_product',
      seoDocumentOk,
      undefined,
      SSR_RELAY,
    );
  }
  const nail = data.nails[(__VU + __ITER) % Math.max(data.nails.length, 1)];
  if (nail) {
    getJson(
      baseUrl,
      `/seo/nail/${encodeURIComponent(nail.productUid.toLowerCase())}?lang=fr`,
      'seo_nail',
      seoDocumentOk,
      undefined,
      SSR_RELAY,
    );
  }
  const sitemap = http.get(`${baseUrl}/sitemap-products.xml`, {
    headers: SITEMAP_RELAY,
    tags: { name: 'sitemap_products', phase: 'vu' },
  });
  check(sitemap, {
    'sitemap_products status 200': (r) => r.status === 200,
    'sitemap_products body': (r) => String(r.body ?? '').includes('<urlset'),
  });
}

/** The compose-a-set gallery a shopper browses, plus a crawler pass on every
 * fourth iteration (bots are a real share of this shop's traffic). */
export function nailBrowse(data: LoadSetupData): void {
  const baseUrl = apiBaseUrl();
  const filters = getJson(
    baseUrl,
    '/gallery/filter-options?productType=nail_single',
    'nail_filter_options',
    hasShapeFilters,
  );
  const feed = getJson(
    baseUrl,
    '/gallery/nails?limit=24&stock=in',
    'nail_feed',
    hasFeedItems,
  );
  const shape = ((filters.body as { shape?: Array<{ value?: string }> } | null)?.shape ?? [])[0]?.value;
  if (shape) {
    getJson(
      baseUrl,
      `/gallery/nails?limit=24&stock=in&shape=${encodeURIComponent(shape)}`,
      'nail_feed_shape',
      hasFeedItems,
    );
  }
  const nextCursor = (feed.body as { nextCursor?: string | null } | null)?.nextCursor;
  if (nextCursor) {
    getJson(
      baseUrl,
      `/gallery/nails?limit=24&stock=in&cursor=${encodeURIComponent(nextCursor)}`,
      'nail_feed_page2',
      hasFeedItems,
    );
  }
  const nail = data.nails[(__VU + __ITER) % Math.max(data.nails.length, 1)];
  if (nail) {
    getJson(baseUrl, `/gallery/nail/${encodeURIComponent(nail.productUid)}`, 'nail_detail', (body) =>
      Boolean((body as { id?: string } | null)?.id),
    );
  }
  getJson(baseUrl, '/gallery/cart-rules', 'gallery_cart_rules', successEnvelope);

  if (__ITER % 4 === 0) crawl(baseUrl, data);
}
