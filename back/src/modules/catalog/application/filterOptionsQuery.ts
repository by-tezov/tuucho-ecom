import type pg from 'pg';
import {
  pairVisibleSql,
  productHasNailOfferSql,
  productHasStockSql,
  productHasVisiblePairSql,
} from './availability.js';
import type { PartialTrilingual } from '../../../types.js';
import { localize, type Language } from '../../../utils/language.js';
import {
  type FilterOption,
  type FilterOptionsResult,
  readFilterOptionsCache,
  writeFilterOptionsCache,
  type FilterOptionsProductType,
} from './filterOptionsCache.js';

/** Display order for nail sizes in the gallery filter — smallest to largest. */
const SIZE_FILTER_ORDER = ['XS', 'S', 'M', 'L'] as const;

function publicCatalogSql(
  alias: string,
  productType: FilterOptionsProductType,
  inStockOnly: boolean,
): string {
  const stock = inStockOnly
    ? productType === 'nail_single'
      ? ` and ${productHasNailOfferSql(`${alias}.id`)}`
      : ` and ${productHasStockSql(`${alias}.id`)}`
    : '';
  return `${alias}.hidden = false and ${alias}.product_type = '${productType}' and ${alias}.audience = 'public' and ${productHasVisiblePairSql(`${alias}.id`)}${stock}`;
}

/** Distinct occasion/shape/length/size values in use
 * across every non-hidden set — same "no fixed vocabulary, whatever's
 * actually in use" semantics as pamsurin-front's old data/filterOptions.ts.
 * Shape/length come from the normalized shapes/shape_lengths
 * tables (already deduplicated by key); occasion is still free text per set,
 * deduplicated by `.fr` here in JS, first-encountered-wins for the label —
 * same rule the front used to apply itself. Size comes from live stock rows
 * (`product_availability` for sets, `product_nail_availability` for
 * nail_single). Scoped by `productType` so compose-a-set filters never list
 * set-only occasions/shapes. */
export async function listFilterOptions(
  client: pg.Pool,
  language: Language,
  outOfStockEnabled = true,
  productType: FilterOptionsProductType = 'nail',
): Promise<FilterOptionsResult> {
  const inStockOnly = !outOfStockEnabled;
  const cached = readFilterOptionsCache(language, inStockOnly, productType);
  if (cached) return cached;

  const catalogSql = publicCatalogSql('products', productType, inStockOnly);

  // A single nail's options each carry their own occasion, and the feed
  // matches any of them (feedWhere.ts), so they are listed too.
  const { rows: occasionRows } = await client.query<{ occasion: PartialTrilingual }>(
    `select occasion from (
       select products.occasion, products.created_at, 0 as sort_order
       from products
       where ${catalogSql} and products.occasion is not null
       union all
       select pv.occasion, products.created_at, pv.sort_order + 1 as sort_order
       from product_variations pv
       join products on products.id = pv.product_id
       where ${catalogSql} and pv.occasion is not null
     ) occasions
     order by created_at asc, sort_order asc`,
  );
  const occasionByFr = new Map<string, PartialTrilingual>();
  for (const row of occasionRows) {
    if (!row.occasion?.fr) continue;
    if (!occasionByFr.has(row.occasion.fr)) occasionByFr.set(row.occasion.fr, row.occasion);
  }
  const occasion = [...occasionByFr.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, label]) => ({ value, label: localize(label, language) }));

  const { rows: shapeRows } = await client.query<{ key: string; label: PartialTrilingual }>(
    `select distinct s.key, s.label
     from shapes s
     join product_shape_lengths gss on gss.shape_key = s.key and not gss.hidden
     join products gs on gs.id = gss.product_id
     where ${publicCatalogSql('gs', productType, inStockOnly)}`,
  );
  const shape = dedupeByFr(shapeRows, language);

  const { rows: lengthRows } = await client.query<{ key: string; label: PartialTrilingual }>(
    `select distinct sl.length_key as key, sl.label
     from shape_lengths sl
     join product_shape_lengths gsl
       on gsl.shape_key = sl.shape_key and gsl.length_key = sl.length_key and not gsl.hidden
     join products gs on gs.id = gsl.product_id
     where ${publicCatalogSql('gs', productType, inStockOnly)}`,
  );
  const length = dedupeByFr(lengthRows, language);

  const sizePresent = new Set<string>();
  if (productType === 'nail_single') {
    const { rows: sizeRows } = await client.query<{ size: string }>(
      `select distinct pna.size
       from product_nail_availability pna
       join products gs on gs.id = pna.product_id
       where ${publicCatalogSql('gs', productType, inStockOnly)}
         and pna.available = true
         and ${pairVisibleSql('pna')}
         and pna.size = any($1::text[])`,
      [SIZE_FILTER_ORDER],
    );
    for (const row of sizeRows) sizePresent.add(row.size);
  } else {
    const { rows: sizeRows } = await client.query<{ size: string }>(
      `select distinct gsa.size
       from product_availability gsa
       join products gs on gs.id = gsa.product_id
       where ${publicCatalogSql('gs', productType, inStockOnly)}
         and ${pairVisibleSql('gsa')}
         and gsa.size = any($1::text[])`,
      [SIZE_FILTER_ORDER],
    );
    for (const row of sizeRows) sizePresent.add(row.size);
  }
  const size = SIZE_FILTER_ORDER.filter((value) => sizePresent.has(value)).map((value) => ({
    value,
    label: value,
  }));

  const { rows: priceRangeRows } = await client.query<{ min: string | null; max: string | null }>(
    `select min(latest.price) as min, max(latest.price) as max
       from (
         select distinct on (pp.product_id) pp.price::numeric as price
           from product_prices pp
           join products p on p.id = pp.product_id
          where ${publicCatalogSql('p', productType, inStockOnly)}
            and pp.effective_at <= now()
          order by pp.product_id, pp.effective_at desc
       ) latest`,
  );
  const rawMin = priceRangeRows[0]?.min;
  const rawMax = priceRangeRows[0]?.max;
  const priceRange =
    rawMin !== null && rawMax !== null
      ? { min: Math.floor(Number(rawMin)), max: Math.ceil(Number(rawMax)) }
      : null;

  const options = { occasion, shape, length, size, priceRange, outOfStockEnabled };
  writeFilterOptionsCache(language, inStockOnly, productType, options);
  return options;
}

/** One option per distinct French label, first key wins — unchanged from when
 * this deduplicated bare labels, so the option list a customer sees is exactly
 * the same. What changed is `value`: it is now the catalogue key rather than
 * the label. Two keys sharing a label still collapse to one option, and the
 * feed expands whichever key it receives back to its whole label group, so the
 * results are identical either way (see products.ts's buildFeedWhere /
 * labelGroupSql).
 *
 * A second pass then also collapses by key: `shape_lengths` is keyed by
 * (shape_key, length_key), so the same length_key can carry a different label
 * per shape (two shapes independently titling "medium" their own way). Two
 * rows with the same key but different labels would otherwise survive the
 * first pass as two options sharing one `value` — an option list a picker
 * can't render (duplicate React keys) and a choice with no visible
 * difference in effect (both match the same key). */
function dedupeByFr(
  entries: { key: string; label: PartialTrilingual }[],
  language: Language,
): FilterOption[] {
  const byFr = new Map<string, { key: string; label: PartialTrilingual }>();
  for (const entry of entries) {
    if (!byFr.has(entry.label.fr)) byFr.set(entry.label.fr, entry);
  }
  const byKey = new Map<string, { key: string; label: PartialTrilingual }>();
  for (const entry of byFr.values()) {
    if (!byKey.has(entry.key)) byKey.set(entry.key, entry);
  }
  return [...byKey.values()]
    .sort((a, b) => a.label.fr.localeCompare(b.label.fr))
    .map((entry) => ({ value: entry.key, label: localize(entry.label, language) }));
}
