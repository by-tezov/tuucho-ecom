import type pg from 'pg';
import { decodeCursor, encodeCursor } from './galleryCursor.js';
import { productHasStockSql } from './availability.js';
import { buildFeedWhere, type GalleryFeedParams } from './feedWhere.js';
import { productOfferSql } from './productOfferSql.js';
import { assembleItems, type SetRow } from './galleryItemAssembly.js';
import type { GalleryItem } from '../../../types.js';
import type { Language } from '../../../utils/language.js';
import { toPhotoUrl } from './photoUrl.js';
import { getProductsByIds, type ProductByIdResult } from './productHydration.js';

export { assembleItems };
export type { SetRow };

export { toPhotoUrl };
export { getProductsByIds };
export type { ProductByIdResult, ProductHydrationType } from './productHydration.js';
import {
  type FilterOption,
  type FilterOptionsResult,
  invalidateFilterOptionsCache,
} from './filterOptionsCache.js';

export type { FilterOption, FilterOptionsResult };
export { invalidateFilterOptionsCache };
export { listFilterOptions } from './filterOptionsQuery.js';

export type { GalleryFeedParams } from './feedWhere.js';
export interface GalleryFeedResult {
  items: GalleryItem[];
  nextCursor: string | null;
  totalCount: number;
  hasUserLibraryItems?: boolean;
}

/** Keyset-paginated, filtered gallery feed — see the plan doc's "Milestone
 * 2" section for why keyset (not offset) pagination: stable and indexable,
 * so pages never skip/duplicate a set as `npm run library` writes between requests.
 * Ordered alphabetically by the localized title, with id as a stable
 * tie-breaker. The cursor carries both values so pagination cannot skip or
 * duplicate products that share a title. */
export async function listGalleryFeed(
  client: pg.Pool,
  publicMediaUrl: string,
  params: GalleryFeedParams,
  language: Language,
): Promise<GalleryFeedResult> {
  const unitOfferSql = await productOfferSql(params.productType === 'nail_single' ? 'nail_single' : 'nail', 'products.id');
  const where = buildFeedWhere(params, unitOfferSql);

  const pageValues = [...where.values];
  pageValues.push(language);
  const languageIndex = pageValues.length;
  const sortTitleSql = `lower(coalesce(nullif(title->>$${languageIndex}, ''), nullif(title->>'en', ''), title->>'fr'))`;
  let cursorSql = '';
  if (params.cursor) {
    const cursor = decodeCursor(params.cursor);
    if (cursor) {
      pageValues.push(cursor.sortTitle, cursor.id);
      cursorSql = ` and (${sortTitleSql}, id) > ($${pageValues.length - 1}::text, $${pageValues.length}::uuid)`;
    }
  }
  pageValues.push(params.limit + 1);

  // Count, page and the library flag do not depend on each other: one wait
  // instead of three in a row.
  const [{ rows: countRows }, { rows: setRows }, libraryRows] = await Promise.all([
    client.query<{ count: string }>(`select count(*) as count from products where ${where.sql}`, where.values),
    client.query<SetRow & { sort_title: string }>(
      `select id, product_uid, title, "desc", occasion, alt, featured_from, featured_for, created_at, audience,
              ${sortTitleSql} as sort_title
       from products
       where ${where.sql}${cursorSql}
       order by sort_title asc, id asc
       limit $${pageValues.length}`,
      pageValues,
    ),
    params.userId
      ? client
          .query(
            `select 1 from product_user_library_users pulu
             join products p on p.id = pulu.product_id
             where pulu.user_id = $1 and p.product_type = 'nail' and p.hidden = false
             limit 1`,
            [params.userId],
          )
          .then((result) => result.rows)
      : Promise.resolve(undefined),
  ]);
  const totalCount = Number(countRows[0]!.count);

  const hasMore = setRows.length > params.limit;
  const pageRows = hasMore ? setRows.slice(0, params.limit) : setRows;
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && lastRow ? encodeCursor({ sortTitle: lastRow.sort_title, id: lastRow.id }) : null;

  const mode = params.productType === 'nail_single' ? 'boolean' : 'quantity';
  const items = await assembleItems(client, pageRows, publicMediaUrl, language, mode, params);
  const hasUserLibraryItems = libraryRows ? libraryRows.length > 0 : undefined;
  return { items, nextCursor, totalCount, hasUserLibraryItems };
}

/** The sets whose featured window covers today, most recent first, capped by
 * the caller's `limit` (the front passes its own VITE_FEATURED_LIMIT).
 *
 * The active-window test used to run in JS after assembling *every* set that
 * had ever been featured — so the home page paid the full six-query assemble
 * over the entire history to display eight cards. It is the same arithmetic
 * activeFeaturedPeriod does (`featured_from` inclusive, `featured_for` days
 * long, end exclusive), just applied before the page is read rather than
 * after. `products_featured_pair_ck` guarantees the two columns are set
 * together, so neither needs a null guard here. */
export async function listFeaturedItems(
  client: pg.Pool,
  publicMediaUrl: string,
  limit: number,
  language: Language,
  inStockOnly = false,
): Promise<GalleryItem[]> {
  const stockSql = inStockOnly ? `and ${productHasStockSql('products.id')}` : '';
  const { rows: setRows } = await client.query<SetRow>(
    `select id, product_uid, title, "desc", occasion, alt, featured_from, featured_for, created_at, audience
     from products
     where hidden = false
       and product_type = 'nail'
       and audience = 'public'
       and featured_from is not null
       and featured_from <= (now() at time zone 'utc')::date
       and (now() at time zone 'utc')::date < featured_from + make_interval(days => featured_for)
       ${stockSql}
     order by featured_from desc, id asc
     limit $1`,
    [limit],
  );
  const items = await assembleItems(client, setRows, publicMediaUrl, language);
  return items
    .filter((item) => item.featured && Object.keys(item.shape).length > 0)
    .sort(
      (a, b) =>
        b.featured!.from.localeCompare(a.featured!.from) ||
        a.id.localeCompare(b.id, undefined, { numeric: true }),
    );
}

/** One public nail set, addressed by its customer-facing `product_uid`
 * (A-Z, 0-9, single dashes, 1-20 characters) rather than its uuid. That
 * code is already unique, stable across library re-imports and short enough
 * to live in a URL, so product pages need no new slug column of their own.
 * The title in an older `/creations/<title>-<uid>` URL is decorative: only
 * this code resolves the set, which keeps old links working after a title edit.
 *
 * Hidden sets return undefined (404 at the route) rather than a body — an
 * unpublished set must not be reachable by guessing its code. */
export async function getProductByUid(
  client: pg.Pool,
  publicMediaUrl: string,
  productUid: string,
  language: Language,
): Promise<GalleryItem | undefined> {
  const { rows } = await client.query<SetRow>(
    `select id, product_uid, title, "desc", occasion, alt, featured_from, featured_for, created_at, audience
     from products
     where hidden = false and product_type = 'nail' and audience = 'public' and upper(product_uid) = upper($1)
     limit 1`,
    [productUid],
  );
  if (rows.length === 0) return undefined;
  const [item] = await assembleItems(client, rows, publicMediaUrl, language);
  return item;
}

/** Public cart-page upsell: visible accessories flagged `in_cart_carousel`.
 * Empty array is a valid response (the front hides the carousel track). */
export async function listCartAccessories(
  client: pg.Pool,
  publicMediaUrl: string,
  language: Language,
): Promise<ProductByIdResult[]> {
  const { rows } = await client.query<{ id: string }>(
    `select id from products
     where product_type = 'accessory'
       and hidden = false
       and in_cart_carousel = true
       and audience = 'public'
     order by creation_date desc, product_uid`,
  );
  const orderedIds = rows.map((row) => row.id);
  if (orderedIds.length === 0) return [];
  const products = await getProductsByIds(client, publicMediaUrl, orderedIds, language);
  const byId = new Map(products.map((product) => [product.id, product]));
  return orderedIds.flatMap((id) => {
    const product = byId.get(id);
    return product ? [product] : [];
  });
}
