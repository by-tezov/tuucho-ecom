import type pg from 'pg';
import {
  getImportedAvailabilityForSets,
  getNailBooleanAvailabilityForProducts,
  getNailVariationAvailabilityForProducts,
} from '../../catalog/application/availability.js';
import type { SetAvailability } from '../../catalog/application/availability.js';
import { getLatestPricesForSets } from '../../catalog/application/prices.js';
import type { AccessoryType } from '../../catalog/domain/accessoryPacks.js';
import { dbPackPrices, dbPacks } from '../../catalog/domain/accessoryPacks.js';
import type { PartialTrilingual } from '../../../types.js';
import type { ProductAudience, ProductType } from './libraryImport.js';

export interface LibrarySetListRow {
  id: string;
  productUid: string;
  productType: ProductType;
  title: PartialTrilingual;
  desc: PartialTrilingual;
  occasion: PartialTrilingual | null;
  /** Authored image alt text — null until pamsurin-manager's generation
   * pass has produced one for this set. */
  alt: PartialTrilingual | null;
  shapeKeys: string[];
  /** The lengths of each offered shape, keyed by shape key. */
  shapeLengths: Record<string, string[]>;
  colorMainKeys: string[];
  colorSecondaryKeys: string[];
  hidden: boolean;
  /** Shape/length pairs hidden while the rest stays visible. */
  hiddenShapeLengths: Array<{ shapeKey: string; lengthKey: string }>;
  featuredFrom: string | null;
  featuredFor: number | null;
  creationDate: string;
  /** Photo count per shape then length — lets `library -- check` flag a
   * variant with no photos on either side without a separate round trip.
   * A single nail's variation photos use the key `<length>/<variation>`. */
  photoCounts: Record<string, Record<string, number>>;
  /** Ordered modal content hashes per shape then length
   * (product_photos.content_hash). */
  photoHashes: Record<string, Record<string, string[]>>;
  /** Current price, or undefined if this set has no price history yet (e.g.
   * imported before the "price" data-static.json key existed). */
  price: number | undefined;
  /** Raw manager-imported quantity per shape/length/size, before reservations
   * are subtracted. Empty object for a set with no availability rows yet. */
  availability: SetAvailability;
  accessoryType: AccessoryType;
  accessoryPacks: Record<string, number>;
  accessoryPackPrices: Record<string, number>;
  inCartCarousel: boolean;
  /** Per-product loyalty earn multiplier (manager key `loyalties`). */
  loyaltyMultiplier: number;
  /** First small product image, relative to PUBLIC_MEDIA_DIR. */
  thumbnailPath: string | null;
  /** Single nails: the variation axis, or null. */
  variationAxis: string | null;
  /** Single nails: options in display order with their price override and
   * their own copy and colours (null copy fields: imported before per-option
   * copy existed). */
  variations: Array<{
    key: string;
    price: number | null;
    title: PartialTrilingual | null;
    desc: PartialTrilingual | null;
    alt: PartialTrilingual | null;
    occasion: PartialTrilingual | null;
    colorMainKeys: string[];
    colorSecondaryKeys: string[];
  }>;
  /** Single nails with variations: the expanded offer per option. */
  variationAvailability: Record<string, SetAvailability>;
  /** Assigned account emails for user-library products. Empty means the set
   * intentionally belongs to nobody yet. Exposed only through OPS/admin. */
  users: string[];
}

/** Backs `GET /operation/library-import/sets` (the `library -- check`
 * command's source of truth for what's actually in the DB). Four flat
 * queries + an in-memory join instead of one round trip per set — cheap at
 * this table's size (low hundreds of rows) and avoids an N+1 pattern.
 * Defaults to nails so `library -- check` ignores accessories. */
export async function listLibrarySets(
  client: pg.Pool,
  productType: ProductType = 'nail',
  audience?: ProductAudience,
): Promise<LibrarySetListRow[]> {
  const { rows: sets } = await client.query<{
    id: string;
    product_uid: string;
    product_type: ProductType;
    title: PartialTrilingual;
    desc: PartialTrilingual;
    occasion: PartialTrilingual | null;
    alt: PartialTrilingual | null;
    hidden: boolean;
    featured_from: string | null;
    featured_for: number | null;
    creation_date: string;
    accessory_type: AccessoryType;
    accessory_packs: Record<string, number>;
    accessory_pack_prices: Record<string, number>;
    in_cart_carousel: boolean;
    loyalty_multiplier: number;
  }>(
    `select id, product_uid, product_type, title, "desc", occasion, alt, hidden, featured_from, featured_for, creation_date,
            accessory_type, accessory_packs, accessory_pack_prices, in_cart_carousel, loyalty_multiplier
     from products where product_type = $1 and ($2::text is null or audience = $2) order by product_uid`,
    [productType, audience ?? null],
  );

  const { rows: shapeRows } = await client.query<{ product_id: string; shape_key: string }>(
    `select product_id, shape_key from product_shapes order by product_id, sort_order`,
  );
  const { rows: shapeLengthRows } = await client.query<{
    product_id: string;
    shape_key: string;
    length_key: string;
    hidden: boolean;
  }>(
    `select product_id, shape_key, length_key, hidden from product_shape_lengths order by product_id, shape_key, sort_order`,
  );
  const { rows: colorRows } = await client.query<{
    product_id: string;
    option_key: string;
    color_key: string;
    role: 'main' | 'secondary';
  }>(
    `select product_id, option_key, color_key, role from product_colors order by product_id, option_key, role, sort_order`,
  );
  const { rows: photoHashRows } = await client.query<{
    product_id: string;
    shape_key: string;
    length_key: string;
    content_hash: string;
  }>(
    `select product_id, shape_key,
            case when variation_key = '' then length_key else length_key || '/' || variation_key end as length_key,
            content_hash
     from product_photos order by product_id, shape_key, length_key, variation_key, "position"`,
  );
  const { rows: thumbnailRows } = await client.query<{ product_id: string; small_path: string }>(
    `select distinct on (product_id) product_id, small_path from product_photos
     where product_id = any($1::uuid[]) order by product_id, "position", shape_key, length_key`,
    [sets.map((set) => set.id)],
  );
  const thumbnailsBySet = new Map(thumbnailRows.map((row) => [row.product_id, row.small_path]));

  const shapesBySet = new Map<string, string[]>();
  for (const row of shapeRows) {
    const list = shapesBySet.get(row.product_id) ?? [];
    list.push(row.shape_key);
    shapesBySet.set(row.product_id, list);
  }
  const shapeLengthsBySet = new Map<string, Record<string, string[]>>();
  const hiddenPairsBySet = new Map<string, Array<{ shapeKey: string; lengthKey: string }>>();
  for (const row of shapeLengthRows) {
    const entry = shapeLengthsBySet.get(row.product_id) ?? {};
    (entry[row.shape_key] ??= []).push(row.length_key);
    shapeLengthsBySet.set(row.product_id, entry);
    if (row.hidden) {
      hiddenPairsBySet.set(row.product_id, [
        ...(hiddenPairsBySet.get(row.product_id) ?? []),
        { shapeKey: row.shape_key, lengthKey: row.length_key },
      ]);
    }
  }
  // Keyed `<product_id>` for the product's own colours, `<product_id>/<option>`
  // for a single nail option's.
  const colorsBySet = new Map<string, { main: string[]; secondary: string[] }>();
  for (const row of colorRows) {
    const mapKey = row.option_key ? `${row.product_id}/${row.option_key}` : row.product_id;
    const entry = colorsBySet.get(mapKey) ?? { main: [], secondary: [] };
    entry[row.role].push(row.color_key);
    colorsBySet.set(mapKey, entry);
  }
  // One hash per stored photo, so the count is the hash list's length.
  const photoHashesBySet = new Map<string, Record<string, Record<string, string[]>>>();
  const photoCountsBySet = new Map<string, Record<string, Record<string, number>>>();
  for (const row of photoHashRows) {
    const entry = photoHashesBySet.get(row.product_id) ?? {};
    const hashes = ((entry[row.shape_key] ??= {})[row.length_key] ??= []);
    hashes.push(row.content_hash);
    photoHashesBySet.set(row.product_id, entry);
    const counts = photoCountsBySet.get(row.product_id) ?? {};
    (counts[row.shape_key] ??= {})[row.length_key] = hashes.length;
    photoCountsBySet.set(row.product_id, counts);
  }

  const pricesBySet = await getLatestPricesForSets(
    client,
    sets.map((set) => set.id),
  );
  // Single nails carry a boolean offer grid, not imported quantities; both
  // come back in the same nested shape so the caller does not care which.
  const readAvailability =
    productType === 'nail_single' ? getNailBooleanAvailabilityForProducts : getImportedAvailabilityForSets;
  // Source state, hidden pairs included (library -- check compares it with
  // data-static.json, where hiding does not remove the offer).
  const availabilityBySet = await readAvailability(
    client,
    sets.map((set) => set.id),
    true,
  );
  const setIds = sets.map((set) => set.id);
  const { rows: variationRows } = await client.query<{
    product_id: string;
    axis_key: string;
    option_key: string;
    price: string | null;
    title: PartialTrilingual | null;
    desc: PartialTrilingual | null;
    alt: PartialTrilingual | null;
    occasion: PartialTrilingual | null;
  }>(
    `select product_id, axis_key, option_key, price, title, "desc", alt, occasion from product_variations
     where product_id = any($1::uuid[]) order by product_id, sort_order`,
    [setIds],
  );
  const variationsBySet = new Map<string, { axis: string; options: LibrarySetListRow['variations'] }>();
  for (const row of variationRows) {
    const entry = variationsBySet.get(row.product_id) ?? { axis: row.axis_key, options: [] };
    const colors = colorsBySet.get(`${row.product_id}/${row.option_key}`);
    entry.options.push({
      key: row.option_key,
      price: row.price === null ? null : Number(row.price),
      title: row.title,
      desc: row.desc,
      alt: row.alt,
      occasion: row.occasion,
      colorMainKeys: colors?.main ?? [],
      colorSecondaryKeys: colors?.secondary ?? [],
    });
    variationsBySet.set(row.product_id, entry);
  }
  const variationAvailabilityBySet =
    productType === 'nail_single'
      ? await getNailVariationAvailabilityForProducts(client, setIds, true)
      : new Map<string, Record<string, SetAvailability>>();
  const { rows: userRows } = await client.query<{ product_id: string; email: string }>(
    `select pulu.product_id, u.email from product_user_library_users pulu
     join users u on u.id = pulu.user_id order by pulu.product_id, u.email`,
  );
  const usersBySet = new Map<string, string[]>();
  for (const row of userRows) {
    usersBySet.set(row.product_id, [...(usersBySet.get(row.product_id) ?? []), row.email]);
  }

  return sets.map((set) => ({
    id: set.id,
    productUid: set.product_uid,
    productType: set.product_type,
    title: set.title,
    desc: set.desc,
    occasion: set.occasion,
    alt: set.alt,
    shapeKeys: shapesBySet.get(set.id) ?? [],
    colorMainKeys: colorsBySet.get(set.id)?.main ?? [],
    shapeLengths: shapeLengthsBySet.get(set.id) ?? {},
    colorSecondaryKeys: colorsBySet.get(set.id)?.secondary ?? [],
    hidden: set.hidden,
    hiddenShapeLengths: hiddenPairsBySet.get(set.id) ?? [],
    featuredFrom: set.featured_from,
    featuredFor: set.featured_for,
    creationDate: set.creation_date,
    photoCounts: photoCountsBySet.get(set.id) ?? {},
    photoHashes: photoHashesBySet.get(set.id) ?? {},
    price: pricesBySet.get(set.id),
    availability: availabilityBySet.get(set.id) ?? {},
    accessoryType: set.accessory_type,
    accessoryPacks: dbPacks(set.accessory_packs),
    accessoryPackPrices: dbPackPrices(set.accessory_pack_prices),
    inCartCarousel: set.in_cart_carousel,
    loyaltyMultiplier: Number(set.loyalty_multiplier ?? 1),
    thumbnailPath: thumbnailsBySet.get(set.id) ?? null,
    variationAxis: variationsBySet.get(set.id)?.axis ?? null,
    variations: variationsBySet.get(set.id)?.options ?? [],
    variationAvailability: variationAvailabilityBySet.get(set.id) ?? {},
    users: usersBySet.get(set.id) ?? [],
  }));
}
