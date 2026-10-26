import type pg from 'pg';
import { pairVisibleSql, productHasStockSql, productHasVisiblePairSql } from './availability.js';
import { productOfferSql } from './productOfferSql.js';
import { getLatestPricesForSets } from './prices.js';
import { toPhotoUrl } from './products.js';
import type { PartialTrilingual } from '../../../types.js';
import { localize, type Language } from '../../../utils/language.js';
import { loadDefaultCopyResolver } from './productCopyResolution.js';
/** One card in the server-rendered gallery index. Deliberately flat and
 * already localized: the only consumer renders it straight to HTML. */
export interface GallerySeoRow {
  productUid: string;
  /** A single-nail option: the row is that option's own page
   * (tuucho/docs/plans/nail-variation-copy.md). Absent for sets and for nails
   * without options. */
  optionKey?: string;
  title: string;
  desc: string;
  occasion: string;
  /** Absolute URL of the set's first photo, or undefined when it has none. */
  photo: string | undefined;
  photoAlt: string;
  /** EUR, or undefined when no price is in effect yet. */
  price: number | undefined;
}

/** `nail` is a set (the gallery, `/creations/<uid>`); `nail_single` is a unit. */
export type SeoProductType = 'nail' | 'nail_single';

async function seoStockSql(productType: SeoProductType): Promise<string> {
  return productType === 'nail_single'
    ? productOfferSql(productType, 'products.id')
    : productHasStockSql('products.id');
}

/** The catalogue columns both queries below select. Nullable in the table
 * even though the gallery feed's own row type calls them mandatory: a set
 * imported without a description or an occasion is valid, and one reached
 * this route as `null.fr`. */
interface SeoSetRow {
  id: string;
  product_uid: string;
  title: PartialTrilingual;
  desc: PartialTrilingual | null;
  occasion: PartialTrilingual | null;
  alt: PartialTrilingual | null;
}

/** Every visible set, in the gallery's own alphabetical order, reduced to
 * what a crawler needs.
 *
 * Deliberately not `listGalleryFeed`: that one runs `assembleItems`, six
 * queries assembling shapes, lengths, colours, every photo, prices and
 * availability for one page of results. This route renders the whole
 * catalogue at once, so it reads three lean queries instead and keeps only
 * the first photo. Same visibility predicate as the product sitemap, so the
 * index and the sitemap can never disagree about which sets exist.
 */
export async function listGallerySeoIndex(
  client: pg.Pool,
  publicMediaUrl: string,
  language: Language,
  inStockOnly = false,
  productType: SeoProductType = 'nail',
): Promise<GallerySeoRow[]> {
  const stockSql = inStockOnly ? `and ${await seoStockSql(productType)}` : '';
  const sortTitleSql = `lower(coalesce(nullif(title->>$1, ''), nullif(title->>'en', ''), title->>'fr'))`;
  const { rows: setRows } = await client.query<SeoSetRow>(
    `select id, product_uid, title, "desc", occasion, alt
     from products
     where hidden = false and product_type = $2 and audience = 'public'
       and ${productHasVisiblePairSql('products.id')}
       ${stockSql}
     order by ${sortTitleSql} asc, id asc`,
    [language, productType],
  );
  return hydrateSeoRows(client, publicMediaUrl, language, setRows);
}

/** Shared tail of the two queries above: first photo, current price, and the
 * localization of the already-selected rows, in the order they came in. A
 * single nail with options becomes one row per option, each with its own
 * copy, photo and price, since every option is its own page. */
async function hydrateSeoRows(
  client: pg.Pool,
  publicMediaUrl: string,
  language: Language,
  setRows: SeoSetRow[],
): Promise<GallerySeoRow[]> {
  if (setRows.length === 0) return [];
  const setIds = setRows.map((row) => row.id);
  const [{ rows: photoRows }, pricesBySet, { rows: optionRows }, resolveCopy] = await Promise.all([
    // `distinct on` with the same ordering assembleItems uses picks each
    // set's (or option's) first shape/length/position photo, which is the
    // one the gallery card shows.
    client.query<{ product_id: string; variation_key: string; small_path: string }>(
      `select distinct on (pp.product_id, pp.variation_key) pp.product_id, pp.variation_key, pp.small_path
       from product_photos pp
       where pp.product_id = any($1::uuid[]) and ${pairVisibleSql('pp')}
       order by pp.product_id, pp.variation_key, pp.shape_key, pp.length_key, pp."position"`,
      [setIds],
    ),
    getLatestPricesForSets(client, setIds),
    client.query<{
      product_id: string;
      option_key: string;
      price: string | null;
      title: PartialTrilingual | null;
      desc: PartialTrilingual | null;
      alt: PartialTrilingual | null;
      occasion: PartialTrilingual | null;
    }>(
      `select product_id, option_key, price, title, "desc", alt, occasion
       from product_variations
       where product_id = any($1::uuid[])
       order by product_id, sort_order`,
      [setIds],
    ),
    loadDefaultCopyResolver(client, setIds),
  ]);
  const photoByKey = new Map(
    photoRows.map((row) => [`${row.product_id}|${row.variation_key}`, row.small_path]),
  );
  const optionsBySet = new Map<string, typeof optionRows>();
  for (const option of optionRows) {
    const list = optionsBySet.get(option.product_id) ?? [];
    list.push(option);
    optionsBySet.set(option.product_id, list);
  }

  return setRows.flatMap((row): GallerySeoRow[] => {
    const productRow = (
      optionKey: string,
      copy: {
        title: PartialTrilingual;
        desc: PartialTrilingual | null;
        alt: PartialTrilingual | null;
        occasion: PartialTrilingual | null;
      },
      price: number | undefined,
    ): GallerySeoRow => {
      const title = localize(copy.title, language);
      const smallPath = photoByKey.get(`${row.id}|${optionKey}`);
      return {
        productUid: row.product_uid,
        ...(optionKey ? { optionKey } : {}),
        title,
        desc: copy.desc ? resolveCopy(row.id, copy.desc, language) : '',
        occasion: copy.occasion ? localize(copy.occasion, language) : '',
        photo: smallPath ? toPhotoUrl(publicMediaUrl, smallPath) : undefined,
        photoAlt: copy.alt ? resolveCopy(row.id, copy.alt, language) : title,
        price,
      };
    };
    const options = optionsBySet.get(row.id) ?? [];
    if (options.length === 0) return [productRow('', row, pricesBySet.get(row.id))];
    return options.map((option) =>
      productRow(
        option.option_key,
        option.title
          ? { title: option.title, desc: option.desc, alt: option.alt, occasion: option.occasion }
          : row,
        option.price === null ? pricesBySet.get(row.id) : Number(option.price),
      ),
    );
  });
}

/** A handful of other sets to link to from one product page.
 *
 * Why it exists: the server-rendered product page's only outgoing link was
 * the gallery index, so a crawler saw one flat list of the whole catalogue
 * and no relationship between the sets in it. These anchors give it the
 * topical grouping the filters express for a visitor but that a crawler never
 * reaches, since `/gallery?...` is disallowed in robots.txt.
 *
 * Ranked by what a shopper would call similar: same occasion first, then a
 * shape in common, then the newest, so a set with few neighbours still gets a
 * full row rather than none. Same visibility predicate as the index, and the
 * set itself is always excluded.
 */
export async function listRelatedSeoSets(
  client: pg.Pool,
  publicMediaUrl: string,
  language: Language,
  productId: string,
  limit = 8,
  inStockOnly = false,
  productType: SeoProductType = 'nail',
): Promise<GallerySeoRow[]> {
  const stockSql = inStockOnly ? `and ${await seoStockSql(productType)}` : '';
  const { rows: setRows } = await client.query<SeoSetRow>(
    `select products.id, products.product_uid, products.title, products."desc", products.occasion,
            products.alt
     from products
     cross join (select occasion, id from products where id = $1) as self
     where products.hidden = false and products.product_type = $3 and products.audience = 'public'
       and ${productHasVisiblePairSql('products.id')}
       and products.id <> self.id
       ${stockSql}
     order by
       (products.occasion is not distinct from self.occasion) desc,
       exists (
         select 1 from product_shapes ps
         where ps.product_id = products.id
           and ps.shape_key in (select shape_key from product_shapes where product_id = self.id)
       ) desc,
       products.created_at desc,
       products.id
     limit $2`,
    [productId, limit, productType],
  );
  return hydrateSeoRows(client, publicMediaUrl, language, setRows);
}
