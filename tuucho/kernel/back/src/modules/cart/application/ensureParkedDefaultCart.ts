import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { DEFAULT_CART_NAME, listCarts } from './cart.js';
import type { CartListEntry } from './cartTypes.js';

/** True when another cart is in use and the account has no default cart left
 * to switch back to. Rename promotes a default cart to custom, and checkout
 * deletes a cart it has emptied, so the row can be gone while the shopper
 * still expects "Panier par défaut" under the other carts. */
export function needsParkedDefaultCart(
  carts: readonly Pick<CartListEntry, 'kind' | 'is_active'>[],
): boolean {
  const active = carts.find((cart) => cart.is_active);
  if (!active || active.kind === 'default') return false;
  return !carts.some((cart) => cart.kind === 'default');
}

/** Insert an empty inactive default cart when `needsParkedDefaultCart` is
 * true. The cart page lists it so the shopper can activate it again. */
export async function ensureParkedDefaultCart(pool: pg.Pool, userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Same per-user lock as ensureActiveCart, so two cart-list reads cannot
    // each insert a default.
    await client.query(`select pg_advisory_xact_lock(87215, hashtext($1))`, [userId]);
    const { rows } = await client.query<{ park: boolean }>(
      `select (
         not exists (select 1 from carts where user_id = $1 and kind = 'default')
         and exists (
           select 1 from carts where user_id = $1 and is_active and kind <> 'default'
         )
       ) as park`,
      [userId],
    );
    if (rows[0]?.park) {
      await client.query(
        `insert into carts (id, user_id, name, kind, is_active)
         values ($1, $2, $3, 'default', false)`,
        [randomUUID(), userId, DEFAULT_CART_NAME],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Cart list for the account page. Restores a missing default cart first
 * when another cart is the one in use. */
export async function listCartsForAccount(pool: pg.Pool, userId: string): Promise<CartListEntry[]> {
  const rows = await listCarts(pool, userId);
  if (!needsParkedDefaultCart(rows)) return rows;
  await ensureParkedDefaultCart(pool, userId);
  return listCarts(pool, userId);
}
