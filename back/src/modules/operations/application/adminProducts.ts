import type pg from 'pg';
import { invalidateFilterOptionsCache } from '../../catalog/application/products.js';
import type { AccessoryType } from '../../catalog/domain/accessoryPacks.js';
import { dbPackPrices, dbPacks } from '../../catalog/domain/accessoryPacks.js';
import type { PartialTrilingual } from '../../../types.js';

export interface SetDetail {
  id: string;
  product_uid: string;
  title: PartialTrilingual;
  desc: PartialTrilingual;
  /** Non-null for nails; null for accessories. */
  occasion: PartialTrilingual | null;
  /** Authored image alt text — null until pamsurin-manager's generation
   * pass has produced one for this set. */
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
}

export interface SetShapeDetail {
  shape_key: string;
  sort_order: number;
}

export interface SetShapeLengthDetail {
  shape_key: string;
  length_key: string;
  sort_order: number;
  hidden: boolean;
}

export interface SetColorDetail {
  color_key: string;
  role: 'main' | 'secondary';
  sort_order: number;
}

export interface SetPhotoDetail {
  id: string;
  shape_key: string;
  length_key: string;
  position: number;
  small_path: string;
  modal_path: string;
}

export async function getSetDetail(
  client: pg.Pool,
  id: string,
): Promise<
  | {
      set: SetDetail;
      shapes: SetShapeDetail[];
      shapeLengths: SetShapeLengthDetail[];
      colors: SetColorDetail[];
      photos: SetPhotoDetail[];
    }
  | undefined
> {
  const { rows: setRows } = await client.query<SetDetail>(
    `select id, product_uid, title, "desc", occasion, alt, hidden, featured_from, featured_for, creation_date,
            accessory_type, accessory_packs, accessory_pack_prices, in_cart_carousel, loyalty_multiplier
     from products where id = $1`,
    [id],
  );
  const raw = setRows[0];
  if (!raw) return undefined;
  const set: SetDetail = {
    ...raw,
    accessory_packs: dbPacks(raw.accessory_packs),
    accessory_pack_prices: dbPackPrices(raw.accessory_pack_prices),
    loyalty_multiplier: Number(raw.loyalty_multiplier ?? 1),
  };

  const { rows: shapes } = await client.query<SetShapeDetail>(
    `select shape_key, sort_order from product_shapes where product_id = $1 order by sort_order`,
    [id],
  );
  const { rows: shapeLengths } = await client.query<SetShapeLengthDetail>(
    `select shape_key, length_key, sort_order, hidden from product_shape_lengths where product_id = $1 order by shape_key, sort_order`,
    [id],
  );
  const { rows: colors } = await client.query<SetColorDetail>(
    `select color_key, role, sort_order from product_colors where product_id = $1 and option_key = '' order by role, sort_order`,
    [id],
  );
  const { rows: photos } = await client.query<SetPhotoDetail>(
    `select id, shape_key, length_key, "position", small_path, modal_path from product_photos where product_id = $1 order by shape_key, length_key, "position"`,
    [id],
  );

  return { set, shapes, shapeLengths, colors, photos };
}

/** Diffs against the current shape selection rather than delete-all +
 * re-insert — product_photos has a foreign key onto (product_id,
 * shape_key) with ON DELETE CASCADE, so blindly removing every row here
 * would silently wipe the photos of any shape the caller didn't actually
 * mean to remove. */
export async function replaceSetShapes(client: pg.Pool, id: string, shapeKeys: string[]): Promise<void> {
  const { rows: current } = await client.query<{ shape_key: string }>(
    `select shape_key from product_shapes where product_id = $1`,
    [id],
  );
  const currentKeys = new Set(current.map((row) => row.shape_key));
  const nextKeys = new Set(shapeKeys);

  for (const key of currentKeys) {
    if (!nextKeys.has(key)) {
      // Cascades to product_photos for this shape — intended: removing a
      // shape variant removes its photos with it.
      await client.query(`delete from product_shapes where product_id = $1 and shape_key = $2`, [id, key]);
    }
  }

  for (let i = 0; i < shapeKeys.length; i++) {
    const key = shapeKeys[i]!;
    if (currentKeys.has(key)) {
      await client.query(
        `update product_shapes set sort_order = $3 where product_id = $1 and shape_key = $2`,
        [id, key, i],
      );
    } else {
      await client.query(
        `insert into product_shapes (product_id, shape_key, sort_order) values ($1, $2, $3)`,
        [id, key, i],
      );
    }
  }
}

/** Same diff-don't-wipe reasoning as replaceSetShapes, one level down:
 * product_photos cascades off (product_id, shape_key, length_key), so
 * dropping every row would take the photos of untouched lengths with it.
 * Must run *after* replaceSetShapes — the FK points at product_shapes. */
export async function replaceSetShapeLengths(
  client: pg.Pool,
  id: string,
  shapeLengths: Record<string, string[]>,
  /** Pairs hidden while the rest of the product stays visible; every other
   * pair is set visible. */
  hiddenPairs: Array<{ shapeKey: string; lengthKey: string }> = [],
): Promise<void> {
  const { rows: current } = await client.query<{ shape_key: string; length_key: string }>(
    `select shape_key, length_key from product_shape_lengths where product_id = $1`,
    [id],
  );
  const hiddenKeys = new Set(hiddenPairs.map((pair) => `${pair.shapeKey}/${pair.lengthKey}`));
  const pairKey = (shapeKey: string, lengthKey: string) => `${shapeKey}/${lengthKey}`;
  const currentKeys = new Set(current.map((row) => pairKey(row.shape_key, row.length_key)));
  const nextPairs = Object.entries(shapeLengths).flatMap(([shapeKey, lengths]) =>
    lengths.map((lengthKey, order) => ({ shapeKey, lengthKey, order })),
  );
  const nextKeys = new Set(nextPairs.map((pair) => pairKey(pair.shapeKey, pair.lengthKey)));

  for (const row of current) {
    if (!nextKeys.has(pairKey(row.shape_key, row.length_key))) {
      // Cascades to product_photos for this shape/length — intended:
      // removing a length variant removes its photos with it.
      await client.query(
        `delete from product_shape_lengths where product_id = $1 and shape_key = $2 and length_key = $3`,
        [id, row.shape_key, row.length_key],
      );
    }
  }

  for (const { shapeKey, lengthKey, order } of nextPairs) {
    if (currentKeys.has(pairKey(shapeKey, lengthKey))) {
      await client.query(
        `update product_shape_lengths set sort_order = $4, hidden = $5
         where product_id = $1 and shape_key = $2 and length_key = $3`,
        [id, shapeKey, lengthKey, order, hiddenKeys.has(pairKey(shapeKey, lengthKey))],
      );
    } else {
      await client.query(
        `insert into product_shape_lengths (product_id, shape_key, length_key, sort_order, hidden)
         values ($1, $2, $3, $4, $5)`,
        [id, shapeKey, lengthKey, order, hiddenKeys.has(pairKey(shapeKey, lengthKey))],
      );
    }
  }
}

/** Colors have no dependents, so a plain delete-all + re-insert is fine
 * (unlike replaceSetShapes above). Only the product's own rows
 * (`option_key = ''`): a single nail's per-option colours belong to
 * replaceNailVariationsIfChanged. */
export async function replaceSetColors(
  client: pg.Pool,
  id: string,
  mainKeys: string[],
  secondaryKeys: string[],
): Promise<void> {
  await client.query(`delete from product_colors where product_id = $1 and option_key = ''`, [id]);
  const rowsToInsert: { key: string; role: 'main' | 'secondary'; order: number }[] = [
    ...mainKeys.map((key, order) => ({ key, role: 'main' as const, order })),
    ...secondaryKeys.map((key, order) => ({ key, role: 'secondary' as const, order })),
  ];
  for (const row of rowsToInsert) {
    await client.query(
      `insert into product_colors (product_id, color_key, role, sort_order) values ($1, $2, $3, $4)`,
      [id, row.key, row.role, row.order],
    );
  }
}

export async function deleteSet(client: pg.Pool, id: string): Promise<void> {
  await client.query(`delete from products where id = $1`, [id]);
  invalidateFilterOptionsCache();
}
