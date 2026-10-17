import type pg from 'pg';

type Queryable = pg.Pool | pg.PoolClient;

/** Row presence in user_disabled_couriers = hidden from the cart primary list
 * (overflow only). Checkout still accepts an explicit customer choice; only
 * shop-wide `couriers.enabled` blocks reservation. No row means enabled. */
export async function listDisabledCourierCodes(pool: Queryable, userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ code: string }>(
    `select c.code from user_disabled_couriers udc
     join couriers c on c.id = udc.courier_id
     where udc.user_id = $1`,
    [userId],
  );
  return rows.map((row) => row.code);
}

export async function disable(pool: Queryable, userId: string, courierId: string): Promise<void> {
  await pool.query(
    `insert into user_disabled_couriers (user_id, courier_id)
     values ($1, $2)
     on conflict (user_id, courier_id) do nothing`,
    [userId, courierId],
  );
}

export async function enable(pool: Queryable, userId: string, courierId: string): Promise<void> {
  await pool.query(`delete from user_disabled_couriers where user_id = $1 and courier_id = $2`, [
    userId,
    courierId,
  ]);
}
