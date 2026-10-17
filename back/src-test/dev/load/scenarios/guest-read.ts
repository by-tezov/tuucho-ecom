import { check } from 'k6';
import { apiBaseUrl, getHealthz, getJson, successEnvelope } from '../_lib/http.ts';

type FeedItem = { id?: string; productUid?: string };
type FilterOption = { value?: string; label?: string };
type FilterOptions = {
  occasion?: FilterOption[];
  shape?: FilterOption[];
  size?: FilterOption[];
};

function hasFeedItems(body: unknown): boolean {
  return Array.isArray((body as { items?: unknown })?.items);
}

function hasShapeFilters(body: unknown): boolean {
  return Array.isArray((body as { shape?: unknown })?.shape);
}

function featuredOk(body: unknown): boolean {
  if (Array.isArray(body)) return true;
  return hasFeedItems(body);
}

function productSetOk(body: unknown): boolean {
  const item = body as { id?: string; productUid?: string } | null;
  return Boolean(item?.id && item?.productUid);
}

function productsListOk(body: unknown): boolean {
  return Array.isArray(body) && body.length > 0;
}

function firstCatalogItem(feedBody: unknown): FeedItem | null {
  const items = (feedBody as { items?: FeedItem[] } | null)?.items;
  if (!Array.isArray(items)) return null;
  return items.find((item) => item?.id && item?.productUid) ?? null;
}

function optionValues(options: FilterOption[] | undefined, limit: number): string[] {
  return (options ?? [])
    .map((entry) => entry.value)
    .filter((value): value is string => Boolean(value))
    .slice(0, limit);
}

/** Guest-readable catalogue + shipping vocabulary, with filter-combo hammering. */
export function guestRead(): void {
  const baseUrl = apiBaseUrl();
  getHealthz(baseUrl);

  const filters = getJson(
    baseUrl,
    '/gallery/filter-options',
    'gallery_filter_options',
    hasShapeFilters,
  );
  const options = (filters.body as FilterOptions | null) ?? {};
  const shapes = optionValues(options.shape, 4);
  const occasions = optionValues(options.occasion, 3);
  const sizes = optionValues(options.size, 4);

  // Unfiltered + stock views the gallery UI always sends.
  let feed = getJson(baseUrl, '/gallery/feed?limit=24&stock=in', 'gallery_feed', hasFeedItems);

  for (const shape of shapes) {
    feed = getJson(
      baseUrl,
      `/gallery/feed?limit=24&stock=in&shape=${encodeURIComponent(shape)}`,
      'gallery_feed_shape',
      hasFeedItems,
    );
  }
  for (const occasion of occasions) {
    getJson(
      baseUrl,
      `/gallery/feed?limit=24&stock=in&occasion=${encodeURIComponent(occasion)}`,
      'gallery_feed_occasion',
      hasFeedItems,
    );
  }
  if (sizes.length) {
    getJson(
      baseUrl,
      `/gallery/feed?limit=24&stock=in&size=${encodeURIComponent(sizes.join(','))}`,
      'gallery_feed_sizes',
      hasFeedItems,
    );
  }
  if (shapes[0] && sizes[0]) {
    getJson(
      baseUrl,
      `/gallery/feed?limit=24&stock=in&shape=${encodeURIComponent(shapes[0])}&size=${encodeURIComponent(sizes[0])}`,
      'gallery_feed_shape_size',
      hasFeedItems,
    );
  }

  // Second page when the catalogue has more than one screen.
  const nextCursor = (feed.body as { nextCursor?: string | null } | null)?.nextCursor;
  if (nextCursor) {
    getJson(
      baseUrl,
      `/gallery/feed?limit=24&stock=in&cursor=${encodeURIComponent(nextCursor)}`,
      'gallery_feed_page2',
      hasFeedItems,
    );
  }

  getJson(baseUrl, '/gallery/featured?limit=5', 'gallery_featured', featuredOk);
  getJson(baseUrl, '/gallery/cart-rules', 'gallery_cart_rules', successEnvelope);

  const item = firstCatalogItem(feed.body);
  check(item, { gallery_catalog_present: (value) => value !== null });
  if (item?.productUid && item.id) {
    getJson(baseUrl, `/gallery/set/${encodeURIComponent(item.productUid)}`, 'gallery_set', productSetOk);
    getJson(
      baseUrl,
      `/gallery/products?ids=${encodeURIComponent(item.id)}`,
      'gallery_products',
      productsListOk,
    );
  }

  getJson(baseUrl, '/account/address-countries', 'account_address_countries', (body) => {
    return successEnvelope(body) && Array.isArray((body as { countries?: unknown }).countries);
  });
  getJson(baseUrl, '/account/delivery-networks', 'account_delivery_networks', (body) => {
    return successEnvelope(body) && Array.isArray((body as { networks?: unknown }).networks);
  });
  getJson(baseUrl, '/account/couriers', 'account_couriers', (body) => {
    return successEnvelope(body) && Array.isArray((body as { couriers?: unknown }).couriers);
  });
}
