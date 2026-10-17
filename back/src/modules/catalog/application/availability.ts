import type pg from 'pg';
import type { Size } from '../../../types.js';

/** Quantity available per size, for a single shape/length of a single set —
 * a missing size key means "not available" (quantity 0), never an explicit
 * zero (see product_availability's migration comment). Accessories use
 * size `''` with shape_key `''` and length_key `''` (single scalar stock). */
export type LengthAvailability = Partial<Record<Size | '', number>>;

/** The lengths of one shape, keyed by length key. */
export type ShapeAvailability = Record<string, LengthAvailability>;

/** Same, keyed by shape then length — the pairs this backend tracks in
 * product_shape_lengths for nails. Accessories use a single entry at
 * shape_key `''` / length_key `''`. */
export type SetAvailability = Record<string, ShapeAvailability>;

interface AvailabilityRow {
  product_id: string;
  shape_key: string;
  length_key: string;
  size: Size;
  quantity: number;
}

/** The manager-imported quantity less every live checkout hold and every
 * confirmed-but-unshipped order's allocation. Expired holds are deliberately
 * ignored even if no request has yet changed their state: expiry must free
 * stock on its own. Once an order actually ships, its allocation is baked
 * into product_availability.quantity directly and the reservation row is
 * deleted (see orders.service.ts's setStatus, the 'sent' branch) — so this
 * subtraction only ever sees orders still waiting to go out.
 *
 * Exported so the gallery feed's in-stock/out-of-stock filter can ask the
 * same question the cards answer (see products.service.ts's
 * buildFeedWhere): a variant held by someone else's live checkout is not
 * purchasable, so it must not make a product count as in stock. Requires
 * the availability row to be aliased `gsa`. */
export const effectiveQuantitySql = `
  greatest(gsa.quantity - coalesce((
    select sum(sri.quantity)
    from stock_reservation_items sri
    join stock_reservations sr on sr.id = sri.reservation_id
    where sri.product_id = gsa.product_id
      and sri.shape_key = gsa.shape_key
      and sri.length_key = gsa.length_key
      and sri.size = gsa.size
      and (sr.state = 'consumed' or (sr.state = 'held' and sr.expires_at > now()))
  ), 0), 0)::integer
`;

/** True unless the row's shape/length pair is hidden
 * (`product_shape_lengths.hidden`, docs/plans/variant-visibility.md). `alias`
 * is a table with `product_id`, `shape_key` and `length_key`. An accessory
 * (`''`/`''`) has no pair row and is always visible. Every customer-facing
 * availability read applies it, so a hidden pair is simply not offered:
 * absent from the gallery, and unavailable to a cart line or checkout. */
export function pairVisibleSql(alias: string): string {
  return `not exists (
    select 1 from product_shape_lengths hidden_pair
    where hidden_pair.product_id = ${alias}.product_id
      and hidden_pair.shape_key = ${alias}.shape_key
      and hidden_pair.length_key = ${alias}.length_key
      and hidden_pair.hidden
  )`;
}

/** A nail product with at least one visible shape/length pair: one whose
 * every pair is hidden is treated like `products.hidden`. */
export function productHasVisiblePairSql(productIdExpr: string): string {
  return `exists (
    select 1 from product_shape_lengths visible_pair
    where visible_pair.product_id = ${productIdExpr} and not visible_pair.hidden
  )`;
}

/** Product-level "anything left to buy" test used by the gallery feed,
 * featured row, sitemap, and filter-options when sold-out sets are hidden. */
export function productHasStockSql(productIdExpr: string): string {
  return `exists (
    select 1 from product_availability gsa
    where gsa.product_id = ${productIdExpr} and ${effectiveQuantitySql} > 0 and ${pairVisibleSql('gsa')}
  )`;
}

function groupRows(rows: AvailabilityRow[]): SetAvailability {
  const result: SetAvailability = {};
  for (const row of rows) {
    ((result[row.shape_key] ??= {})[row.length_key] ??= {})[row.size] = row.quantity;
  }
  return result;
}

/** Batch form for feed/featured listings — one query instead of N, same
 * pattern as prices.service.ts's getLatestPricesForSets. */
export async function getAvailabilityForSets(
  client: pg.Pool,
  productIds: string[],
): Promise<Map<string, SetAvailability>> {
  if (productIds.length === 0) return new Map();
  const { rows } = await client.query<AvailabilityRow>(
    `select gsa.product_id, gsa.shape_key, gsa.length_key, gsa.size, ${effectiveQuantitySql} as quantity
     from product_availability gsa where gsa.product_id = any($1::uuid[]) and ${pairVisibleSql('gsa')}`,
    [productIds],
  );
  const bySet = new Map<string, AvailabilityRow[]>();
  for (const row of rows) {
    const list = bySet.get(row.product_id) ?? [];
    list.push(row);
    bySet.set(row.product_id, list);
  }
  return new Map([...bySet.entries()].map(([id, setRows]) => [id, groupRows(setRows)]));
}

/** Raw manager-imported quantities for operations/import comparisons. Unlike
 * getAvailabilityForSets, this deliberately does not subtract reservations:
 * `library -- check` must compare source state with source state, otherwise
 * every held or purchased item looks like catalogue drift that a seed cannot
 * resolve without incorrectly increasing the underlying inventory. */
export async function getImportedAvailabilityForSets(
  client: pg.Pool,
  productIds: string[],
): Promise<Map<string, SetAvailability>> {
  if (productIds.length === 0) return new Map();
  const { rows } = await client.query<AvailabilityRow>(
    `select product_id, shape_key, length_key, size, quantity
     from product_availability where product_id = any($1::uuid[])`,
    [productIds],
  );
  const bySet = new Map<string, AvailabilityRow[]>();
  for (const row of rows) {
    const list = bySet.get(row.product_id) ?? [];
    list.push(row);
    bySet.set(row.product_id, list);
  }
  return new Map([...bySet.entries()].map(([id, setRows]) => [id, groupRows(setRows)]));
}

/** The quantity in stock for this exact (set, shape, length, size) — 0 if
 * there's no row, no exceptions: a variant that's never been given an
 * "available" entry in pamsurin-manager's data-static.json is 0 in stock,
 * not unlimited (see the migration's doc comment — "missing means
 * unavailable" is the whole point of the feature, not a fallback for the
 * unconfigured case). This is the sole server-side gate on cart/order size
 * *and quantity* selection: every call site compares the quantity it's
 * about to write against this number, not just checking it's nonzero.
 * Doesn't reserve or decrement anything, so it's not safe against a
 * concurrent request consuming the same last unit; that's a deliberate
 * follow-up, not an oversight. */
export async function getAvailableQuantity(
  client: pg.Pool | pg.PoolClient,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  size: string,
): Promise<number> {
  const map = await getAvailableQuantities(client, [{ productId, shapeKey, lengthKey, size }]);
  return map.get(`${productId}|${shapeKey}|${lengthKey}|${size}`) ?? 0;
}

/** Batch form of getAvailableQuantity. Key is `productId|shapeKey|lengthKey|size`. */
export async function getAvailableQuantities(
  client: pg.Pool | pg.PoolClient,
  keys: Array<{ productId: string; shapeKey: string; lengthKey: string; size: string }>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (keys.length === 0) return out;
  const { rows } = await client.query<{
    product_id: string;
    shape_key: string;
    length_key: string;
    size: string;
    quantity: number;
  }>(
    `select gsa.product_id, gsa.shape_key, gsa.length_key, gsa.size,
            ${effectiveQuantitySql} as quantity
       from product_availability gsa
       join unnest($1::uuid[], $2::text[], $3::text[], $4::text[])
         as x(product_id, shape_key, length_key, size)
         on gsa.product_id = x.product_id
        and gsa.shape_key = x.shape_key
        and gsa.length_key = x.length_key
        and gsa.size = x.size
      where ${pairVisibleSql('gsa')}`,
    [
      keys.map((key) => key.productId),
      keys.map((key) => key.shapeKey),
      keys.map((key) => key.lengthKey),
      keys.map((key) => key.size),
    ],
  );
  for (const row of rows) {
    out.set(`${row.product_id}|${row.shape_key}|${row.length_key}|${row.size}`, row.quantity);
  }
  return out;
}

function availabilityEqual(a: SetAvailability, b: SetAvailability): boolean {
  const shapeKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const shapeKey of shapeKeys) {
    const lengthsA = a[shapeKey] ?? {};
    const lengthsB = b[shapeKey] ?? {};
    const lengthKeys = new Set([...Object.keys(lengthsA), ...Object.keys(lengthsB)]);
    for (const lengthKey of lengthKeys) {
      const sizesA = lengthsA[lengthKey] ?? {};
      const sizesB = lengthsB[lengthKey] ?? {};
      const sizes = new Set([...Object.keys(sizesA), ...Object.keys(sizesB)]);
      for (const size of sizes) {
        if ((sizesA[size as Size] ?? 0) !== (sizesB[size as Size] ?? 0)) return false;
      }
    }
  }
  return true;
}

/** Delete-all + re-insert, like adminProducts.service.ts's
 * replaceSetColors — nothing references this table, so there's no cascade
 * risk in dropping every row first. Only (shape, length, size) triples with
 * a positive quantity are ever stored. No-op (returns false) if `desired`
 * already matches what's on file, same idempotency as setPriceIfChanged, so
 * re-running `npm run library` with unchanged data never writes. */
export async function replaceAvailabilityIfChanged(
  client: pg.Pool,
  productId: string,
  desired: SetAvailability,
): Promise<boolean> {
  // Imports compare against the source quantity, not the effective customer-
  // visible quantity. The latter includes paid/reserved allocations and must
  // never make an unchanged manager import look different.
  const { rows: rawRows } = await client.query<AvailabilityRow>(
    `select product_id, shape_key, length_key, size, quantity from product_availability where product_id = $1`,
    [productId],
  );
  const current = groupRows(rawRows);
  if (availabilityEqual(current, desired)) return false;

  await client.query(`delete from product_availability where product_id = $1`, [productId]);
  for (const [shapeKey, lengths] of Object.entries(desired)) {
    for (const [lengthKey, sizes] of Object.entries(lengths)) {
      for (const [size, quantity] of Object.entries(sizes)) {
        if (!quantity || quantity <= 0) continue;
        await client.query(
          `insert into product_availability (product_id, shape_key, length_key, size, quantity) values ($1, $2, $3, $4, $5)`,
          [productId, shapeKey, lengthKey, size, quantity],
        );
      }
    }
  }
  return true;
}

/** Boolean offer map for nail_single exposed as 1 = offered (same nested
 * shape as SetAvailability so gallery helpers keep working). */
export type NailBooleanAvailability = SetAvailability;

interface NailAvailabilityRow {
  product_id: string;
  shape_key: string;
  length_key: string;
  size: Size;
  available: boolean;
  /** `''` for a nail without variations; the option key otherwise. */
  variation_key: string;
}

/** Offer per variation option (`''` = the nail has no variations). */
export type NailVariationAvailability = Record<string, NailBooleanAvailability>;

function groupNailBooleanRows(rows: NailAvailabilityRow[]): NailBooleanAvailability {
  const result: NailBooleanAvailability = {};
  for (const row of rows) {
    if (!row.available) continue;
    ((result[row.shape_key] ??= {})[row.length_key] ??= {})[row.size] = 1;
  }
  return result;
}

export function productHasNailOfferSql(productIdExpr: string): string {
  return `exists (
    select 1 from product_nail_availability pna
    where pna.product_id = ${productIdExpr} and pna.available = true and ${pairVisibleSql('pna')}
  )`;
}

/** `includeHidden` keeps hidden pairs: only `library -- check` wants them,
 * to compare source state with source state. */
export async function getNailBooleanAvailabilityForProducts(
  client: pg.Pool,
  productIds: string[],
  includeHidden = false,
): Promise<Map<string, NailBooleanAvailability>> {
  if (productIds.length === 0) return new Map();
  const { rows } = await client.query<NailAvailabilityRow>(
    `select pna.product_id, pna.shape_key, pna.length_key, pna.size, pna.available, pna.variation_key
     from product_nail_availability pna
     where pna.product_id = any($1::uuid[]) and ($2::boolean or ${pairVisibleSql('pna')})`,
    [productIds, includeHidden],
  );
  // Union over options: offered in at least one of them.
  const byProduct = new Map<string, NailAvailabilityRow[]>();
  for (const row of rows) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }
  return new Map(
    [...byProduct.entries()].map(([id, productRows]) => [id, groupNailBooleanRows(productRows)]),
  );
}

/** Per-option offer of the nails that have variations, for the gallery
 * item's `availableByOption`. Nails without variations are absent. */
export async function getNailVariationAvailabilityForProducts(
  client: pg.Pool,
  productIds: string[],
  includeHidden = false,
): Promise<Map<string, NailVariationAvailability>> {
  if (productIds.length === 0) return new Map();
  const { rows } = await client.query<NailAvailabilityRow>(
    `select pna.product_id, pna.shape_key, pna.length_key, pna.size, pna.available, pna.variation_key
     from product_nail_availability pna
     where pna.product_id = any($1::uuid[]) and pna.variation_key <> ''
       and ($2::boolean or ${pairVisibleSql('pna')})`,
    [productIds, includeHidden],
  );
  const out = new Map<string, NailVariationAvailability>();
  for (const row of rows) {
    if (!row.available) continue;
    const byOption = out.get(row.product_id) ?? {};
    (((byOption[row.variation_key] ??= {})[row.shape_key] ??= {})[row.length_key] ??= {})[row.size] = 1;
    out.set(row.product_id, byOption);
  }
  return out;
}

export async function getNailVariantAvailabilityMap(
  client: pg.Pool | pg.PoolClient,
  /** `variationKey` defaults to `''` (a nail without variations). The map is
   * keyed `product|shape|length|size|variation`. */
  keys: Array<{
    productId: string;
    shapeKey: string;
    lengthKey: string;
    size: string;
    variationKey?: string;
  }>,
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (keys.length === 0) return out;
  const { rows } = await client.query<{
    product_id: string;
    shape_key: string;
    length_key: string;
    size: string;
    variation_key: string;
    available: boolean;
  }>(
    `select pna.product_id, pna.shape_key, pna.length_key, pna.size, pna.variation_key, pna.available
       from product_nail_availability pna
       join unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[])
         as x(product_id, shape_key, length_key, size, variation_key)
         on pna.product_id = x.product_id
        and pna.shape_key = x.shape_key
        and pna.length_key = x.length_key
        and pna.size = x.size
        and pna.variation_key = x.variation_key
      where ${pairVisibleSql('pna')}`,
    [
      keys.map((key) => key.productId),
      keys.map((key) => key.shapeKey),
      keys.map((key) => key.lengthKey),
      keys.map((key) => key.size),
      keys.map((key) => key.variationKey ?? ''),
    ],
  );
  for (const row of rows) {
    out.set(
      `${row.product_id}|${row.shape_key}|${row.length_key}|${row.size}|${row.variation_key}`,
      row.available === true,
    );
  }
  return out;
}

/** Rewrites a single nail's offer rows when they differ. `desired` is keyed
 * by variation option (`{ '': … }` for a nail without variations), already
 * expanded: one entry per exact shape × length × size × option. */
export async function replaceNailAvailabilityIfChanged(
  client: pg.Pool,
  productId: string,
  desired: NailVariationAvailability,
): Promise<boolean> {
  const { rows: rawRows } = await client.query<NailAvailabilityRow>(
    `select product_id, shape_key, length_key, size, available, variation_key
     from product_nail_availability where product_id = $1`,
    [productId],
  );
  const current: NailVariationAvailability = {};
  for (const row of rawRows) {
    if (!row.available) continue;
    (((current[row.variation_key] ??= {})[row.shape_key] ??= {})[row.length_key] ??= {})[row.size] = 1;
  }
  const optionKeys = new Set([...Object.keys(current), ...Object.keys(desired)]);
  if ([...optionKeys].every((key) => availabilityEqual(current[key] ?? {}, desired[key] ?? {}))) return false;

  await client.query(`delete from product_nail_availability where product_id = $1`, [productId]);
  for (const [variationKey, byShape] of Object.entries(desired)) {
    for (const [shapeKey, lengths] of Object.entries(byShape)) {
      for (const [lengthKey, sizes] of Object.entries(lengths)) {
        for (const [size, offered] of Object.entries(sizes)) {
          if (!offered) continue;
          await client.query(
            `insert into product_nail_availability (product_id, shape_key, length_key, size, available, variation_key)
             values ($1, $2, $3, $4, true, $5)`,
            [productId, shapeKey, lengthKey, size, variationKey],
          );
        }
      }
    }
  }
  return true;
}
