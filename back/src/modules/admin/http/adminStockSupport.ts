import { type Request, type Response } from 'express';
import type pg from 'pg';
import { pool } from '../../../db/pool.js';
import { config } from '../../../config/env.js';
import { listLibrarySets } from '../../operations/application/libraryList.js';
import { invalidateFilterOptionsCache } from '../../catalog/application/filterOptionsCache.js';
import { recordAdminActivityBestEffort } from '../../activity/application/recordAdminActivity.js';
import { activityChangeDetail } from '../../activity/application/changeDetail.js';
import type { AccessoryType } from '../../catalog/domain/accessoryPacks.js';
import type { Size } from '../../../types.js';
import type { AdminLibraryStockRow } from '../../../contract/admin/catalog.js';

export const STOCK_SIZES = ['XS', 'S', 'M', 'L'] as const;

export type AdminLibraryStockSizes = Record<(typeof STOCK_SIZES)[number], number>;

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

/** Current price + size quantities for one nail variant (journal before snapshot). */
export async function readNailVariantSnapshot(
  db: Queryable,
  productId: string,
  shapeKey: string,
  lengthKey: string,
): Promise<{ price: number | null; sizes: AdminLibraryStockSizes }> {
  const [{ rows: priceRows }, { rows: sizeRows }] = await Promise.all([
    db.query<{ price: string }>(
      `select price from product_prices
        where product_id = $1 and effective_at <= now()
        order by effective_at desc limit 1`,
      [productId],
    ),
    db.query<{ size: string; quantity: number }>(
      `select size, quantity from product_availability
        where product_id = $1 and shape_key = $2 and length_key = $3`,
      [productId, shapeKey, lengthKey],
    ),
  ]);
  const sizes: AdminLibraryStockSizes = { XS: 0, S: 0, M: 0, L: 0 };
  for (const row of sizeRows) {
    if ((STOCK_SIZES as readonly string[]).includes(row.size)) {
      sizes[row.size as (typeof STOCK_SIZES)[number]] = Number(row.quantity) || 0;
    }
  }
  return {
    price: priceRows[0] ? Number(priceRows[0].price) : null,
    sizes,
  };
}

/** The shape this module actually sends. Taken from the contract rather than
 * restated here: a hand-written copy is what lets the response and the front's
 * type drift apart without either side failing to compile. */
type AdminLibraryStockVariantRow = AdminLibraryStockRow;

type AdminUserLibraryStockVariantRow = AdminLibraryStockVariantRow & {
  owners: string[];
};

export async function shapeLengthLabels(): Promise<{
  shapes: Map<string, string>;
  lengths: Map<string, string>;
}> {
  const [{ rows: shapeRows }, { rows: lengthRows }] = await Promise.all([
    pool.query<{ key: string; label: string }>(
      `select key, coalesce(label->>'fr', key) as label from shapes`,
    ),
    pool.query<{ shape_key: string; length_key: string; label: string }>(
      `select shape_key, length_key, coalesce(label->>'fr', length_key) as label from shape_lengths`,
    ),
  ]);
  return {
    shapes: new Map(shapeRows.map((row) => [row.key, row.label])),
    lengths: new Map(lengthRows.map((row) => [`${row.shape_key}::${row.length_key}`, row.label])),
  };
}

function variantSizes(
  availability: Record<string, Record<string, Partial<Record<Size, number>>>>,
  shapeKey: string,
  lengthKey: string,
): AdminLibraryStockSizes {
  const length = availability[shapeKey]?.[lengthKey] ?? {};
  const sizes = { XS: 0, S: 0, M: 0, L: 0 };
  for (const size of STOCK_SIZES) sizes[size] = length[size] ?? 0;
  return sizes;
}

/** How long the "mettre en avant" action features a set. One number, applied
 * by the API and echoed to the dashboard so the button can name it without a
 * second copy drifting in the front. */
export const FEATURED_DAYS = 15;

/** Last day of an active window, or null when there is none or it has passed.
 * `featured_from` is a plain `date` string (see docs/schema/00-overview.md),
 * so this stays string arithmetic — no timezone shifting a day boundary. */
export function featuredUntil(featuredFrom: string | null, featuredFor: number | null): string | null {
  if (!featuredFrom || !featuredFor) return null;
  const start = new Date(`${featuredFrom}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + featuredFor - 1);
  const today = new Date().toISOString().slice(0, 10);
  const until = end.toISOString().slice(0, 10);
  return until >= today ? until : null;
}

export function toLibraryStockVariantRow(
  set: {
    productUid: string;
    title: { fr?: string };
    thumbnailPath: string | null;
    creationDate: string;
    price: number | undefined;
    hidden: boolean;
    hiddenShapeLengths: Array<{ shapeKey: string; lengthKey: string }>;
    featuredFrom: string | null;
    featuredFor: number | null;
    availability: Record<string, Record<string, Partial<Record<Size, number>>>>;
  },
  shapeKey: string,
  lengthKey: string,
  shapeLabel: string,
  lengthLabel: string,
): AdminLibraryStockVariantRow {
  const sizes = variantSizes(set.availability, shapeKey, lengthKey);
  const total = STOCK_SIZES.reduce((sum, size) => sum + sizes[size], 0);
  const price = set.price ?? null;
  return {
    productUid: set.productUid,
    title: set.title.fr ?? set.productUid,
    thumbnail: set.thumbnailPath ? `${config.publicMediaUrl}/${set.thumbnailPath.replace(/^\/+/, '')}` : null,
    createdAt: set.creationDate,
    price,
    shapeKey,
    shapeLabel,
    lengthKey,
    lengthLabel,
    sizes,
    total,
    stockValue: price === null ? null : price * total,
    hidden: set.hidden,
    variantHidden: set.hiddenShapeLengths.some(
      (pair) => pair.shapeKey === shapeKey && pair.lengthKey === lengthKey,
    ),
    featuredUntil: featuredUntil(set.featuredFrom, set.featuredFor),
  };
}

/** One entry per shape × length for the public nail library. Source
 * quantities (manager-imported), alphabetically by title. Scoped to
 * `audience = 'public'`: private creations have their own list (see
 * adminUserLibraryStock) and their own editor, and PATCH
 * /admin/library-stock/:productUid only resolves public products — an
 * unscoped list would show rows this dashboard cannot edit. */
export async function adminLibraryStock(): Promise<AdminLibraryStockVariantRow[]> {
  const [sets, labels] = await Promise.all([listLibrarySets(pool, 'nail', 'public'), shapeLengthLabels()]);
  const rows: AdminLibraryStockVariantRow[] = [];
  for (const set of sets) {
    for (const shapeKey of set.shapeKeys) {
      for (const lengthKey of set.shapeLengths[shapeKey] ?? []) {
        rows.push(
          toLibraryStockVariantRow(
            set,
            shapeKey,
            lengthKey,
            labels.shapes.get(shapeKey) ?? shapeKey,
            labels.lengths.get(`${shapeKey}::${lengthKey}`) ?? lengthKey,
          ),
        );
      }
    }
  }
  return rows.sort((left, right) => {
    const byTitle = left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' });
    if (byTitle !== 0) return byTitle;
    const byUid = left.productUid.localeCompare(right.productUid);
    if (byUid !== 0) return byUid;
    const byShape = left.shapeKey.localeCompare(right.shapeKey);
    if (byShape !== 0) return byShape;
    return left.lengthKey.localeCompare(right.lengthKey);
  });
}

/** One entry per shape × length for private user-library nails, plus owners. */
export async function adminUserLibraryStock(): Promise<AdminUserLibraryStockVariantRow[]> {
  const [sets, labels] = await Promise.all([
    listLibrarySets(pool, 'nail', 'user-library'),
    shapeLengthLabels(),
  ]);
  const rows: AdminUserLibraryStockVariantRow[] = [];
  for (const set of sets) {
    for (const shapeKey of set.shapeKeys) {
      for (const lengthKey of set.shapeLengths[shapeKey] ?? []) {
        rows.push({
          ...toLibraryStockVariantRow(
            set,
            shapeKey,
            lengthKey,
            labels.shapes.get(shapeKey) ?? shapeKey,
            labels.lengths.get(`${shapeKey}::${lengthKey}`) ?? lengthKey,
          ),
          owners: set.users,
        });
      }
    }
  }
  return rows.sort((left, right) => {
    const byTitle = left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' });
    if (byTitle !== 0) return byTitle;
    const byUid = left.productUid.localeCompare(right.productUid);
    if (byUid !== 0) return byUid;
    const byShape = left.shapeKey.localeCompare(right.shapeKey);
    if (byShape !== 0) return byShape;
    return left.lengthKey.localeCompare(right.lengthKey);
  });
}

/** `*` = any characters. Without `*`, matches a case-insensitive substring of
 * the product UID. With `*`, the pattern is matched against the whole UID. */
export function productUidMatchesSearch(productUid: string, raw: string): boolean {
  const query = raw.trim();
  if (!query) return true;
  const hasWildcard = query.includes('*');
  const escaped = query.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const pattern = hasWildcard ? `^${escaped}$` : escaped;
  return new RegExp(pattern, 'i').test(productUid);
}

/** The two list switches, read off the query string.
 *
 * Filtering happens here rather than in the dashboard because the list is
 * paged: dropping rows client-side would leave a chunk of 30 looking empty
 * while the server still reports more to come. `hidden` and `stock` name the
 * kept set, matching the gallery feed's own vocabulary (see
 * catalog/application/feedWhere.ts). */
export interface StockListFilters {
  /** `all` (default) keeps hidden products; `visible` drops them. */
  hidden: 'all' | 'visible';
  /** `all` (default) keeps sold-out rows; `in` drops them. */
  stock: 'all' | 'in';
}

export function requestedStockFilters(query: Request['query']): StockListFilters {
  return {
    hidden: query.hidden === 'visible' ? 'visible' : 'all',
    stock: query.stock === 'in' ? 'in' : 'all',
  };
}

/** `available` for accessories, `total` for a nail variant — same question. */
export function stockRowMatchesFilters(
  row: { hidden: boolean; variantHidden?: boolean } & ({ total: number } | { available: number }),
  filters: StockListFilters,
): boolean {
  if (filters.hidden === 'visible' && (row.hidden || row.variantHidden)) return false;
  if (filters.stock === 'in') {
    const units = 'total' in row ? row.total : row.available;
    if (units <= 0) return false;
  }
  return true;
}

/** Accessory counterpart of `npm run accessory -- stock-report`: one shared
 * available-unit pool per accessory (including by-quantity accessories). */
type AdminAccessoryStockRow = {
  productUid: string;
  title: string;
  thumbnail: string | null;
  createdAt: string;
  type: AccessoryType;
  packs: Record<string, number>;
  unitPrice: number | null;
  packPrices: Record<string, number> | null;
  available: number;
  stockValue: number | null;
  hidden: boolean;
};

function toAccessoryStockRow(
  accessory: Awaited<ReturnType<typeof listLibrarySets>>[number],
): AdminAccessoryStockRow {
  const available = accessory.availability['']?.['']?.[''] ?? 0;
  const packs = accessory.accessoryPacks;
  const hasPackPrices =
    accessory.accessoryType === 'byQuantity' && Object.keys(accessory.accessoryPackPrices).length > 0;
  const packPrices = hasPackPrices ? accessory.accessoryPackPrices : null;
  const unitPrice = hasPackPrices ? null : (accessory.price ?? null);
  const maxPack = Object.entries(packs).sort((left, right) => right[1] - left[1])[0];
  const unitValue =
    unitPrice !== null
      ? unitPrice
      : maxPack && packPrices?.[maxPack[0]] !== undefined
        ? packPrices[maxPack[0]] / maxPack[1]
        : undefined;
  return {
    productUid: accessory.productUid,
    title: accessory.title.fr ?? accessory.productUid,
    thumbnail: accessory.thumbnailPath
      ? `${config.publicMediaUrl}/${accessory.thumbnailPath.replace(/^\/+/, '')}`
      : null,
    createdAt: accessory.creationDate,
    type: accessory.accessoryType,
    packs,
    unitPrice,
    packPrices,
    available,
    stockValue: unitValue === undefined ? null : unitValue * available,
    hidden: accessory.hidden,
  };
}

export async function adminAccessoryStock(): Promise<AdminAccessoryStockRow[]> {
  const accessories = await listLibrarySets(pool, 'accessory');
  return accessories.map(toAccessoryStockRow).sort((left, right) => {
    const byTitle = left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' });
    if (byTitle !== 0) return byTitle;
    return left.productUid.localeCompare(right.productUid);
  });
}

/** Starts or clears the "Nouveautés" window for one public nail set.
 * `current_date` rather than a JS date so the stored day is the database's,
 * which is what the gallery feed compares against. */
export async function setStockProductFeatured(req: Request, res: Response): Promise<void> {
  const productUid = typeof req.params.productUid === 'string' ? req.params.productUid.trim() : '';
  if (!productUid || typeof req.body?.featured !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const { rows: beforeRows } = await pool.query<{
    featured_from: string | null;
    featured_for: number | null;
  }>(
    `select featured_from, featured_for from products
      where product_uid = $1 and product_type = 'nail' and audience = 'public'`,
    [productUid],
  );
  if (!beforeRows[0]) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const beforeFeatured = featuredUntil(beforeRows[0].featured_from, beforeRows[0].featured_for) !== null;
  const { rows } = await pool.query<{ featured_from: string | null; featured_for: number | null }>(
    `update products
        set featured_from = case when $2 then current_date else null end,
            featured_for = case when $2 then $3::integer else null end,
            updated_at = now()
      where product_uid = $1 and product_type = 'nail' and audience = 'public'
      returning featured_from, featured_for`,
    [productUid, req.body.featured, FEATURED_DAYS],
  );
  const row = rows[0]!;
  const { changes, changeSummary, detail } = activityChangeDetail(
    { featuredDays: FEATURED_DAYS },
    { featured: beforeFeatured },
    { featured: req.body.featured },
  );
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'catalogue',
    action: req.body.featured ? 'catalogue.feature' : 'catalogue.unfeature',
    summary:
      changes.length === 0
        ? `Mise en avant ${productUid}: aucun changement`
        : `Mise en avant ${productUid}: ${changeSummary}`,
    targetType: 'product',
    targetId: productUid,
    detail,
  });
  res.json({ success: true, featuredUntil: featuredUntil(row.featured_from, row.featured_for) });
}

/** `{ hidden }` hides or shows the whole product. With `shapeKey` (and
 * optionally `lengthKey`) it hides or shows that shape (every length of it)
 * or that one shape/length instead, the rest of the product unchanged
 * (docs/plans/variant-visibility.md). Accessories have no shape. The next
 * `seed --update` re-applies data-static.json, same as the product toggle. */
export async function setStockProductHidden(
  req: Request,
  res: Response,
  productType: 'nail' | 'accessory' | 'nail_single',
  audience?: 'public' | 'user-library',
): Promise<void> {
  const productUid = typeof req.params.productUid === 'string' ? req.params.productUid.trim() : '';
  const shapeKey = typeof req.body?.shapeKey === 'string' ? req.body.shapeKey : '';
  const lengthKey = typeof req.body?.lengthKey === 'string' ? req.body.lengthKey : '';
  if (
    !productUid ||
    typeof req.body?.hidden !== 'boolean' ||
    (lengthKey && !shapeKey) ||
    (shapeKey && productType === 'accessory')
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const { rows: productRows } = await pool.query<{ id: string; hidden: boolean }>(
    `select id, hidden from products
      where product_uid = $1 and product_type = $2 and ($3::text is null or audience = $3)`,
    [productUid, productType, audience ?? null],
  );
  const product = productRows[0];
  if (!product) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  let beforeHidden = product.hidden;
  if (shapeKey) {
    const { rows: variantHidden } = await pool.query<{ hidden: boolean }>(
      `select hidden from product_shape_lengths
        where product_id = $1 and shape_key = $2 and ($3 = '' or length_key = $3)
        limit 1`,
      [product.id, shapeKey, lengthKey],
    );
    if (!variantHidden[0]) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    beforeHidden = variantHidden[0].hidden;
  }
  let hidden = product.hidden;
  if (shapeKey) {
    const result = await pool.query(
      `update product_shape_lengths set hidden = $4
        where product_id = $1 and shape_key = $2 and ($3 = '' or length_key = $3)`,
      [product.id, shapeKey, lengthKey, req.body.hidden],
    );
    if (result.rowCount === 0) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    await pool.query(`update products set updated_at = now() where id = $1`, [product.id]);
    hidden = req.body.hidden;
  } else {
    const { rows } = await pool.query<{ hidden: boolean }>(
      `update products set hidden = $2, updated_at = now() where id = $1 returning hidden`,
      [product.id, req.body.hidden],
    );
    hidden = rows[0]?.hidden ?? req.body.hidden;
  }
  invalidateFilterOptionsCache();
  const { rows: hiddenRows } = await pool.query<{ shape_key: string; length_key: string }>(
    `select shape_key, length_key from product_shape_lengths
      where product_id = $1 and hidden order by shape_key, sort_order`,
    [product.id],
  );
  const targetLabel = shapeKey
    ? `${productUid} ${shapeKey}${lengthKey ? `/${lengthKey}` : ''}`
    : productUid;
  const { changes, changeSummary, detail } = activityChangeDetail(
    {
      productType,
      audience: audience ?? null,
      shapeKey: shapeKey || null,
      lengthKey: lengthKey || null,
    },
    { hidden: beforeHidden },
    { hidden: req.body.hidden },
  );
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'catalogue',
    action: req.body.hidden ? 'catalogue.hide' : 'catalogue.show',
    summary:
      changes.length === 0
        ? `Visibilite ${targetLabel}: aucun changement`
        : `Visibilite ${targetLabel}: ${changeSummary}`,
    targetType: 'product',
    targetId: productUid,
    detail,
  });
  res.json({
    success: true,
    hidden,
    hiddenShapeLengths: hiddenRows.map((row) => ({ shapeKey: row.shape_key, lengthKey: row.length_key })),
  });
}
