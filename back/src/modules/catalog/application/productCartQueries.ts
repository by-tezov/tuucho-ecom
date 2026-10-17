import type pg from 'pg';
import { dbPacks, packMultiplier, parseAccessoryType, type AccessoryType } from '../domain/accessoryPacks.js';
import { isNonEmptyString, isUuid } from '../../../utils/validate.js';

const SIZES = ['XS', 'S', 'M', 'L'] as const;
const DEFAULT_LENGTH_KEY = 'medium';

type ProductType = 'nail' | 'accessory';

export function isValidSize(value: unknown): value is (typeof SIZES)[number] {
  return typeof value === 'string' && (SIZES as readonly string[]).includes(value);
}

async function lookupProductCartMeta(
  pool: pg.Pool,
  productId: string,
): Promise<
  { productType: ProductType; accessoryType: AccessoryType; packs: Record<string, number> } | undefined
> {
  const { rows } = await pool.query<{
    product_type: ProductType;
    accessory_type: AccessoryType;
    accessory_packs: unknown;
  }>(`select product_type, accessory_type, accessory_packs from products where id = $1`, [productId]);
  const row = rows[0];
  if (!row) return undefined;
  return {
    productType: row.product_type,
    accessoryType: row.product_type === 'accessory' ? parseAccessoryType(row.accessory_type) : 'default',
    packs: dbPacks(row.accessory_packs),
  };
}

export async function userCanAccessProduct(
  pool: pg.Pool,
  userId: string,
  productId: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `select 1 from products p
     where p.id = $1 and (p.audience = 'public' or exists (
       select 1 from product_user_library_users pulu where pulu.product_id = p.id and pulu.user_id = $2
     ))`,
    [productId, userId],
  );
  return rows.length > 0;
}

export async function productOffersShapeLength(
  pool: pg.Pool,
  productId: string,
  shapeKey: string,
  lengthKey: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ ok: number }>(
    `select 1 as ok from product_shape_lengths
     where product_id = $1 and shape_key = $2 and length_key = $3 and not hidden`,
    [productId, shapeKey, lengthKey],
  );
  return rows.length > 0;
}

export async function defaultLengthFor(pool: pg.Pool, productId: string, shapeKey: string): Promise<string> {
  const { rows } = await pool.query<{ length_key: string }>(
    `select length_key from product_shape_lengths
     where product_id = $1 and shape_key = $2 and not hidden order by sort_order limit 1`,
    [productId, shapeKey],
  );
  return rows[0]?.length_key ?? DEFAULT_LENGTH_KEY;
}

export async function resolveAccessoryPackKey(
  pool: pg.Pool,
  productId: string,
  packKeyRaw: unknown,
): Promise<string | null> {
  const meta = await lookupProductCartMeta(pool, productId);
  if (!meta) return null;
  if (meta.productType !== 'accessory' || meta.accessoryType !== 'byQuantity') return '';
  if (!isNonEmptyString(packKeyRaw) || packMultiplier(meta.packs, packKeyRaw) === undefined) return null;
  return packKeyRaw;
}

export async function resolveCartLineVariant(
  pool: pg.Pool,
  productId: string,
  shapeKeyRaw: unknown,
  lengthKeyRaw: unknown,
  sizeRaw: unknown,
  options: { requireShapeSizeInBody: boolean } = { requireShapeSizeInBody: true },
): Promise<{ shapeKey: string; lengthKey: string; size: string } | null> {
  const productType = (await lookupProductCartMeta(pool, productId))?.productType;
  if (!productType) return null;
  if (productType === 'accessory') return { shapeKey: '', lengthKey: '', size: '' };

  const shapeKey = isNonEmptyString(shapeKeyRaw) ? shapeKeyRaw : undefined;
  const size = isValidSize(sizeRaw) ? sizeRaw : undefined;
  if (options.requireShapeSizeInBody && (!shapeKey || !size)) return null;
  if (!shapeKey || !size) return null;
  const lengthKey = isNonEmptyString(lengthKeyRaw)
    ? lengthKeyRaw
    : await defaultLengthFor(pool, productId, shapeKey);
  if (!(await productOffersShapeLength(pool, productId, shapeKey, lengthKey))) return null;
  return { shapeKey, lengthKey, size };
}

export interface RawCartLine {
  productId: unknown;
  shapeKey: unknown;
  lengthKey: unknown;
  size: unknown;
  packKey: unknown;
}

export interface ResolvedCartLine {
  shapeKey: string;
  lengthKey: string;
  size: string;
  packKey: string;
}

/** Batched resolveCartLineVariant + resolveAccessoryPackKey +
 * userCanAccessProduct for many lines at once (guest-cart import at sign-in):
 * two queries in total instead of three to four per line. Same rules as the
 * single-line functions; an entry is null when its line does not resolve, is
 * not a UUID, or names a product this user cannot see. */
export async function resolveCartLinesForUser(
  pool: pg.Pool,
  userId: string,
  lines: ReadonlyArray<RawCartLine>,
): Promise<Array<ResolvedCartLine | null>> {
  const productIds = [
    ...new Set(lines.map((line) => line.productId).filter((id): id is string => isUuid(id))),
  ];
  if (productIds.length === 0) return lines.map(() => null);

  const [{ rows: products }, { rows: shapeLengths }] = await Promise.all([
    pool.query<{
      id: string;
      product_type: ProductType;
      accessory_type: AccessoryType;
      accessory_packs: unknown;
    }>(
      `select p.id, p.product_type, p.accessory_type, p.accessory_packs
       from products p
       where p.id = any($1::uuid[]) and (p.audience = 'public' or exists (
         select 1 from product_user_library_users pulu where pulu.product_id = p.id and pulu.user_id = $2
       ))`,
      [productIds, userId],
    ),
    pool.query<{ product_id: string; shape_key: string; length_key: string }>(
      `select product_id, shape_key, length_key from product_shape_lengths
       where product_id = any($1::uuid[]) and not hidden
       order by product_id, shape_key, sort_order`,
      [productIds],
    ),
  ]);

  const productById = new Map(products.map((row) => [row.id, row]));
  const offered = new Set<string>();
  const defaultLength = new Map<string, string>();
  for (const row of shapeLengths) {
    offered.add(`${row.product_id}|${row.shape_key}|${row.length_key}`);
    const shapeKey = `${row.product_id}|${row.shape_key}`;
    if (!defaultLength.has(shapeKey)) defaultLength.set(shapeKey, row.length_key);
  }

  return lines.map((line) => {
    if (!isUuid(line.productId)) return null;
    const product = productById.get(line.productId);
    if (!product) return null;
    if (product.product_type === 'accessory') {
      const accessoryType = parseAccessoryType(product.accessory_type);
      if (accessoryType !== 'byQuantity') return { shapeKey: '', lengthKey: '', size: '', packKey: '' };
      const packs = dbPacks(product.accessory_packs);
      if (!isNonEmptyString(line.packKey) || packMultiplier(packs, line.packKey) === undefined) return null;
      return { shapeKey: '', lengthKey: '', size: '', packKey: line.packKey };
    }
    const shapeKey = isNonEmptyString(line.shapeKey) ? line.shapeKey : undefined;
    const size = isValidSize(line.size) ? line.size : undefined;
    if (!shapeKey || !size) return null;
    const lengthKey = isNonEmptyString(line.lengthKey)
      ? line.lengthKey
      : (defaultLength.get(`${line.productId}|${shapeKey}`) ?? DEFAULT_LENGTH_KEY);
    if (!offered.has(`${line.productId}|${shapeKey}|${lengthKey}`)) return null;
    return { shapeKey, lengthKey, size, packKey: '' };
  });
}
