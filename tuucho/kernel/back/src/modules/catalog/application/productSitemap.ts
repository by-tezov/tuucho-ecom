import type pg from 'pg';
import { productHasStockSql, productHasVisiblePairSql } from './availability.js';
import { productOfferSql } from './productOfferSql.js';

export interface SitemapProductRow {
  productUid: string;
  /** A single-nail option, listed as its own page; absent otherwise. */
  optionKey?: string;
  /** The product's last change from an import or the admin
   * (`products.updated_at`), not its creation: a lastmod that never moves tells a crawler nothing, and one
   * that moves for no reason gets ignored. Already-formatted `YYYY-MM-DD`,
   * straight from SQL. Not a Date: db/pool.ts
   * overrides the TIMESTAMPTZ parser to hand back the raw string, so anything
   * that treats a timestamp column as a Date object throws at runtime. */
  lastmod: string;
}

/** Every visible product's URL for the live product sitemap (see
 * galleryPreview.router.ts's GET /sitemap-products.xml) — deliberately lean (no
 * photos/pricing/stock, unlike getProductByUid's assembleItems) since a
 * sitemap only ever needs the URL and a lastmod date. Generated fresh on
 * every request: the catalogue changes constantly and nobody redeploys the
 * front on every product edit, so there is no build-time equivalent. */
export async function listPublicProductUidsForSitemap(
  client: pg.Pool,
  inStockOnly = false,
  productType: 'nail' | 'nail_single' | 'accessory',
): Promise<SitemapProductRow[]> {
  const hasStock =
    productType === 'nail_single'
      ? await productOfferSql(productType, 'products.id')
      : productHasStockSql('products.id');
  const stockSql = inStockOnly ? `and ${hasStock}` : '';
  // A single nail with options lists one URL per option (each is its own
  // page, docs/plans/nail-variation-copy.md); the left join keeps one row
  // with a null option for everything else.
  const { rows } = await client.query<{ product_uid: string; option_key: string | null; lastmod: string }>(
    `select products.product_uid, pv.option_key,
            to_char(products.updated_at at time zone 'UTC', 'YYYY-MM-DD') as lastmod
     from products
     left join product_variations pv on pv.product_id = products.id
     where products.hidden = false and products.product_type = $1 and products.audience = 'public'
       and ${productHasVisiblePairSql('products.id')}
       ${stockSql}
     order by products.created_at desc, products.id, pv.sort_order`,
    [productType],
  );
  return rows.map((row) => ({
    productUid: row.product_uid,
    ...(row.option_key ? { optionKey: row.option_key } : {}),
    lastmod: row.lastmod,
  }));
}
