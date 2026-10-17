import type pg from 'pg';
import type { PartialTrilingual } from '../../../types.js';

/** One single nail's variation axis and options, as stored (not localized). */
export interface ProductVariationInfo {
  axisKey: string;
  axisTitle: PartialTrilingual;
  /** Option key → its vocabulary label (`title`, « Rose »), optional price
   * override (null = product price) and the option's own product title
   * (`productTitle`, « Cerise noire brillante »; null when imported before
   * per-option copy, the product's title then applies). */
  options: Map<
    string,
    { title: PartialTrilingual; price: number | null; productTitle: PartialTrilingual | null }
  >;
}

/** Variation axis and options per product; products without variations are
 * absent. Used wherever a nail is priced or labelled per option (cart
 * compositions, checkout, order snapshot). */
export async function loadProductVariations(
  client: pg.Pool | pg.PoolClient,
  productIds: string[],
): Promise<Map<string, ProductVariationInfo>> {
  const out = new Map<string, ProductVariationInfo>();
  if (productIds.length === 0) return out;
  const { rows } = await client.query<{
    product_id: string;
    axis_key: string;
    axis_title: PartialTrilingual;
    option_key: string;
    option_title: PartialTrilingual;
    price: string | null;
    product_title: PartialTrilingual | null;
  }>(
    `select pv.product_id, pv.axis_key, va.title as axis_title, pv.option_key, vo.title as option_title, pv.price,
            pv.title as product_title
     from product_variations pv
     join variation_axes va on va.key = pv.axis_key
     join variation_options vo on vo.axis_key = pv.axis_key and vo.option_key = pv.option_key
     where pv.product_id = any($1::uuid[])
     order by pv.product_id, pv.sort_order`,
    [productIds],
  );
  for (const row of rows) {
    const entry = out.get(row.product_id) ?? {
      axisKey: row.axis_key,
      axisTitle: row.axis_title,
      options: new Map(),
    };
    entry.options.set(row.option_key, {
      title: row.option_title,
      price: row.price === null ? null : Number(row.price),
      productTitle: row.product_title,
    });
    out.set(row.product_id, entry);
  }
  return out;
}

/** Under an occasion filter, the first option (display order) of each single
 * nail whose own occasion matches, so its card opens on the option the
 * visitor was looking for rather than on the default. Empty without a filter
 * or for products without options. */
export async function matchedOccasionOptions(
  client: pg.Pool,
  products: Array<{ id: string }>,
  occasion: string[] | undefined,
): Promise<Map<string, string>> {
  if (!occasion || occasion.length === 0 || products.length === 0) return new Map();
  const { rows } = await client.query<{ product_id: string; option_key: string }>(
    `select distinct on (product_id) product_id, option_key
     from product_variations
     where product_id = any($1::uuid[]) and occasion->>'fr' = any($2::text[])
     order by product_id, sort_order`,
    [products.map((product) => product.id), occasion],
  );
  return new Map(rows.map((row) => [row.product_id, row.option_key]));
}

/** A nail's unit price: its option's override, else the product price. */
export function nailUnitPrice(
  productPrice: number | undefined,
  variations: ProductVariationInfo | undefined,
  variationKey: string,
): number | undefined {
  const override = variationKey ? variations?.options.get(variationKey)?.price : null;
  return override ?? productPrice;
}
