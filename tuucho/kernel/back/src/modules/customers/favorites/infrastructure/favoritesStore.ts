import type pg from 'pg';

export interface FavoriteRow {
  product_id: string;
  shape_key: string;
  length_key: string;
  variation_key: string;
}

export async function listForUser(pool: pg.Pool, userId: string): Promise<FavoriteRow[]> {
  const { rows } = await pool.query<FavoriteRow>(
    `select product_id, shape_key, length_key, variation_key from favorites where user_id = $1 order by created_at desc`,
    [userId],
  );
  return rows;
}

/** Upsert — covers both "add a new favorite" and "update which shape tab was
 * active" for one already favorited (see GalleryCard.tsx's selectShape,
 * which calls this same endpoint again whenever the shape tab changes on an
 * already-favorited item). The composite FK on (product_id, shape_key, length_key)
 * rejects a shape the set doesn't actually offer. */
export async function upsert(
  pool: pg.Pool,
  userId: string,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  variationKey = '',
): Promise<void> {
  await pool.query(
    `insert into favorites (user_id, product_id, shape_key, length_key, variation_key)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id, product_id) do update
       set shape_key = excluded.shape_key, length_key = excluded.length_key, variation_key = excluded.variation_key`,
    [userId, productId, shapeKey, lengthKey, variationKey],
  );
}

export async function remove(pool: pg.Pool, userId: string, productId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `delete from favorites where user_id = $1 and product_id = $2 returning product_id`,
    [userId, productId],
  );
  return rows.length > 0;
}
