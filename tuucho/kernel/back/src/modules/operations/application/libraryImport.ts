import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { withTransaction } from '../../../platform/db/transaction.js';
import { replaceSetColors, replaceSetShapeLengths, replaceSetShapes } from './adminProducts.js';
import { invalidateFilterOptionsCache } from '../../catalog/application/products.js';
import type { AccessoryType } from '../../catalog/domain/accessoryPacks.js';
import type { PartialTrilingual } from '../../../types.js';
import type { ShapeVocabularyEntry, VocabularyGender } from '../domain/vocabulary.js';
import { upsertVocabulary } from './vocabularyUpsert.js';

export { upsertVocabulary };

/** Backs `POST /operation/library-import/sets` — idempotency key is
 * product_uid (already unique, already required for every set): a real,
 * permanent identifier baked into catalog source's own data, unlike the
 * now-removed legacy_folder (which only ever existed for a production
 * migration this site never actually went through). */
export async function findProductIdByProductUid(
  client: pg.Pool,
  productUid: string,
): Promise<string | undefined> {
  const { rows } = await client.query<{ id: string }>('select id from products where product_uid = $1', [
    productUid,
  ]);
  return rows[0]?.id;
}

/** The full desired state of a set as catalog source's library describes
 * it — shared shape between creating a brand-new set and updating an
 * existing one back onto it. */
export type ProductType = 'nail' | 'accessory' | 'nail_single';
export type ProductAudience = 'public' | 'user-library';

export interface LibrarySetDesiredState {
  title: PartialTrilingual;
  desc: PartialTrilingual;
  /** Required for nails; null for accessories. */
  occasion: PartialTrilingual | null;
  /** Authored image alt text — optional; null until catalog source's
   * generation pass has produced one (older sets never regenerated). */
  alt: PartialTrilingual | null;
  shapeKeys: string[];
  /** The lengths of each offered shape, keyed by shape key — a subset of
   * that shape's vocabulary lengths. Empty for accessories. */
  shapeLengths: Record<string, string[]>;
  colorMainKeys: string[];
  colorSecondaryKeys: string[];
  hidden: boolean;
  /** `shape/length` pairs hidden while the rest of the product stays
   * visible (tuucho/docs/plans/variant-visibility.md). */
  hiddenShapeLengths: Array<{ shapeKey: string; lengthKey: string }>;
  featuredFrom: string | null;
  featuredFor: number | null;
  /** 'YYYY-MM-DD' — catalog source's data-static.json "creation-date",
   * not the row's own created_at/updated_at (when this DB row was
   * written), so it survives a re-import untouched. */
  creationDate: string;
  audience: ProductAudience;
  accessoryType: AccessoryType;
  accessoryPacks: Record<string, number>;
  accessoryPackPrices: Record<string, number>;
  inCartCarousel: boolean;
  /** Per-product loyalty earn multiplier (manager key `loyalties`). */
  loyaltyMultiplier: number;
}

export interface CreateLibrarySetInput extends LibrarySetDesiredState {
  productUid: string;
  productType: ProductType;
}

/** product_uid is set explicitly from catalog source's library data rather
 * than auto-generated — every set now originates from `npm run library`,
 * which already has a permanent product_uid baked into each library entry. */
export async function createLibrarySet(client: pg.Pool, input: CreateLibrarySetInput): Promise<string> {
  const id = randomUUID();
  await client.query(
    `insert into products (id, product_uid, product_type, title, "desc", occasion, alt, hidden, featured_from, featured_for, creation_date, audience, accessory_type, accessory_packs, accessory_pack_prices, in_cart_carousel, loyalty_multiplier)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16, $17)`,
    [
      id,
      input.productUid,
      input.productType,
      input.title,
      input.desc,
      input.occasion,
      input.alt,
      input.hidden,
      input.featuredFrom,
      input.featuredFor,
      input.creationDate,
      input.audience,
      input.productType === 'accessory' ? input.accessoryType : 'default',
      JSON.stringify(input.productType === 'accessory' ? input.accessoryPacks : {}),
      JSON.stringify(input.productType === 'accessory' ? input.accessoryPackPrices : {}),
      input.productType === 'accessory' ? input.inCartCarousel : false,
      input.loyaltyMultiplier,
    ],
  );
  await replaceSetShapes(client, id, input.shapeKeys);
  await replaceSetShapeLengths(client, id, input.shapeLengths, input.hiddenShapeLengths);
  await replaceSetColors(client, id, input.colorMainKeys, input.colorSecondaryKeys);
  invalidateFilterOptionsCache();
  return id;
}

/** Updates an *existing* set (by id) back onto the library's desired state —
 * same id preserved throughout (see libraryImport.routes.ts's comment on
 * why this is an in-place update rather than delete+recreate: GalleryItem.id
 * is products.id, referenced by URLs). Doesn't touch photos — the
 * caller (the /sets route) wipes and the CLI re-uploads them, since this
 * function only knows about metadata. */
export async function updateLibrarySet(
  client: pg.Pool,
  id: string,
  input: LibrarySetDesiredState,
): Promise<void> {
  await client.query(
    `update products
     set title = $2, "desc" = $3, occasion = $4, alt = $5, hidden = $6, featured_from = $7, featured_for = $8, creation_date = $9, audience = $10,
         accessory_type = $11, accessory_packs = $12::jsonb, accessory_pack_prices = $13::jsonb, in_cart_carousel = $14, loyalty_multiplier = $15, updated_at = now()
     where id = $1`,
    [
      id,
      input.title,
      input.desc,
      input.occasion,
      input.alt,
      input.hidden,
      input.featuredFrom,
      input.featuredFor,
      input.creationDate,
      input.audience,
      input.accessoryType,
      JSON.stringify(input.accessoryPacks),
      JSON.stringify(input.accessoryPackPrices),
      input.inCartCarousel,
      input.loyaltyMultiplier,
    ],
  );
  await replaceSetShapes(client, id, input.shapeKeys);
  await replaceSetShapeLengths(client, id, input.shapeLengths, input.hiddenShapeLengths);
  await replaceSetColors(client, id, input.colorMainKeys, input.colorSecondaryKeys);
  invalidateFilterOptionsCache();
}

/** Replaces an assignment set atomically with the import's resolved account
 * ids. User-library products with an empty list are intentionally retained
 * but visible to nobody. */
export async function replaceUserLibraryUsers(
  client: pg.Pool | pg.PoolClient,
  productId: string,
  userIds: string[],
): Promise<void> {
  await client.query('delete from product_user_library_users where product_id = $1', [productId]);
  if (userIds.length === 0) return;
  await client.query(
    `insert into product_user_library_users (product_id, user_id)
     select $1, unnest($2::uuid[]) on conflict do nothing`,
    [productId, [...new Set(userIds)]],
  );
}

/** `--clear-before`/`delete-all`: a full reset, not just the gallery sets —
 * shapes/colors are re-seeded from data-common.json every run anyway (see
 * upsertVocabulary below), so there's no reason to leave stale vocabulary
 * rows behind when the caller explicitly asked for a clean slate. Sets
 * first: product_shapes/product_colors/product_photos cascade away
 * with them (photo files on disk are left behind, same as deleteSet), which
 * is also what makes deleting shapes/colors afterward safe — nothing still
 * references them by then. */
export async function clearLibraryData(
  client: pg.Pool,
): Promise<{ sets: number; shapes: number; colors: number }> {
  const { rowCount: sets } = await client.query('delete from products');
  const { rowCount: shapes } = await client.query('delete from shapes');
  const { rowCount: colors } = await client.query('delete from colors');
  invalidateFilterOptionsCache();
  return { sets: sets ?? 0, shapes: shapes ?? 0, colors: colors ?? 0 };
}

async function refreshVocabularyDependents(_client: pg.Pool | pg.PoolClient): Promise<void> {
  invalidateFilterOptionsCache();
}

export async function syncVocabulary(
  pool: pg.Pool,
  shapes: Record<string, ShapeVocabularyEntry>,
  colors: Record<string, PartialTrilingual>,
  deleteMissing: boolean,
): Promise<{ shapes: number; colors: number; deletedShapes: string[]; deletedColors: string[] }> {
  return withTransaction(pool, async (client) => {
    const result = await upsertVocabulary(client, shapes, colors);
    const deletedShapes = deleteMissing
      ? (
          await client.query<{ key: string }>(
            `delete from shapes where key <> all($1::text[]) returning key`,
            [Object.keys(shapes)],
          )
        ).rows.map((row) => row.key)
      : [];
    const deletedColors = deleteMissing
      ? (
          await client.query<{ key: string }>(
            `delete from colors where key <> all($1::text[]) returning key`,
            [Object.keys(colors)],
          )
        ).rows.map((row) => row.key)
      : [];
    await refreshVocabularyDependents(client);
    return { ...result, deletedShapes, deletedColors };
  });
}

export async function listVocabulary(
  pool: pg.Pool,
): Promise<{ shapes: Record<string, ShapeVocabularyEntry>; colors: Record<string, PartialTrilingual> }> {
  const [{ rows: shapes }, { rows: lengths }, { rows: colors }] = await Promise.all([
    pool.query<{
      key: string;
      label: PartialTrilingual;
      gender: VocabularyGender;
      attributive: PartialTrilingual;
    }>('select key, label, gender, attributive from shapes order by key'),
    pool.query<{
      shape_key: string;
      length_key: string;
      value: string;
      label: PartialTrilingual;
      gender: VocabularyGender;
    }>(
      'select shape_key, length_key, value, label, gender from shape_lengths order by shape_key, length_key',
    ),
    pool.query<{ key: string; label: PartialTrilingual }>('select key, label from colors order by key'),
  ]);
  const shapeEntries: Record<string, ShapeVocabularyEntry> = Object.fromEntries(
    shapes.map((shape) => [
      shape.key,
      { title: shape.label, gender: shape.gender, attributive: shape.attributive, length: {} },
    ]),
  );
  for (const row of lengths) {
    const shape = shapeEntries[row.shape_key];
    if (!shape) continue;
    shape.length[row.length_key] = { value: row.value, title: row.label, gender: row.gender };
  }
  return {
    shapes: shapeEntries,
    colors: Object.fromEntries(colors.map((color) => [color.key, color.label])),
  };
}

export async function deleteShape(pool: pg.Pool, key: string): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    const result = await client.query('delete from shapes where key = $1', [key]);
    if (result.rowCount === 1) await refreshVocabularyDependents(client);
    return result.rowCount === 1;
  });
}

export async function deleteColor(pool: pg.Pool, key: string): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    const result = await client.query('delete from colors where key = $1', [key]);
    if (result.rowCount === 1) await refreshVocabularyDependents(client);
    return result.rowCount === 1;
  });
}

async function upsertAccessoryQuantities(
  client: pg.Pool | pg.PoolClient,
  quantities: Record<string, PartialTrilingual>,
): Promise<{ quantities: number }> {
  for (const [key, label] of Object.entries(quantities)) {
    await client.query(
      'insert into accessory_quantities (key, label) values ($1, $2) on conflict (key) do update set label = excluded.label',
      [key, label],
    );
  }
  return { quantities: Object.keys(quantities).length };
}

export async function syncAccessoryQuantities(
  pool: pg.Pool,
  quantities: Record<string, PartialTrilingual>,
  deleteMissing: boolean,
): Promise<{ quantities: number; deletedQuantities: string[] }> {
  return withTransaction(pool, async (client) => {
    const result = await upsertAccessoryQuantities(client, quantities);
    const deletedQuantities = deleteMissing
      ? (
          await client.query<{ key: string }>(
            `delete from accessory_quantities where key <> all($1::text[]) returning key`,
            [Object.keys(quantities)],
          )
        ).rows.map((row) => row.key)
      : [];
    return { ...result, deletedQuantities };
  });
}

export async function listAccessoryQuantities(
  pool: pg.Pool,
): Promise<{ quantities: Record<string, PartialTrilingual> }> {
  const { rows } = await pool.query<{ key: string; label: PartialTrilingual }>(
    'select key, label from accessory_quantities order by key',
  );
  return { quantities: Object.fromEntries(rows.map((row) => [row.key, row.label])) };
}
