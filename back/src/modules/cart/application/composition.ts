import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { CartComposition } from '../../../contract/cart.js';
import type { Language } from '../../../utils/language.js';
import { validateComposition } from '../domain/composition.js';
import { ensureActiveCart, getActiveCart } from './cart.js';
import { retryIfActiveCartVanished } from './vanishedCartRetry.js';
import { listCompositionsForCart, listCompositionsForUser } from './compositionRead.js';
import {
  insertCompositionIntoCart,
  replaceCompositionItems,
  resolveWriteNails,
  type CompositionNailWrite,
  type CompositionWriteInput,
} from './compositionWrite.js';

export type { CompositionNailWrite, CompositionWriteInput };
export { insertCompositionIntoCart };

export { listCompositionsForCart, listCompositionsForUser };

export async function createComposition(
  pool: pg.Pool,
  userId: string,
  input: CompositionWriteInput,
  language: Language,
): Promise<CartComposition> {
  return retryIfActiveCartVanished(() => createCompositionOnce(pool, userId, input, language));
}

async function createCompositionOnce(
  pool: pg.Pool,
  userId: string,
  input: CompositionWriteInput,
  language: Language,
): Promise<CartComposition> {
  const cart = await ensureActiveCart(pool, userId);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const resolved = await resolveWriteNails(client, input.size, input.nails);
    const validation = validateComposition(input.size, resolved);
    if (!validation.ok) throw new Error(validation.code);
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error('invalid_request');

    const editingRows = await client.query(
      `select 1 from cart_compositions where cart_id = $1 and editing limit 1`,
      [cart.id],
    );
    if (editingRows.rows.length > 0) throw new Error('composition_editing');

    const id = randomUUID();
    await client.query(
      `insert into cart_compositions (id, cart_id, size, quantity, editing)
       values ($1, $2, $3, $4, false)`,
      [id, cart.id, input.size, input.quantity],
    );
    await replaceCompositionItems(client, id, input.nails);
    await client.query(`update carts set updated_at = now() where id = $1`, [cart.id]);
    await client.query('commit');
    const created = (await listCompositionsForCart(pool, cart.id, language)).find((row) => row.id === id);
    if (!created) throw new Error('not_found');
    return created;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function replaceComposition(
  pool: pg.Pool,
  userId: string,
  compositionId: string,
  input: CompositionWriteInput,
  language: Language,
  options: { clearEditing?: boolean } = {},
): Promise<CartComposition> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const cart = await getActiveCart(client, userId);
    if (!cart) throw new Error('not_found');
    const { rows } = await client.query<{
      id: string;
      cart_id: string;
      size: string;
      quantity: number;
      editing: boolean;
    }>(
      `select id, cart_id, size, quantity, editing from cart_compositions
       where id = $1 and cart_id = $2 for update`,
      [compositionId, cart.id],
    );
    if (!rows[0]) throw new Error('not_found');

    const resolved = await resolveWriteNails(client, input.size, input.nails);
    const validation = validateComposition(input.size, resolved);
    if (!validation.ok) throw new Error(validation.code);
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error('invalid_request');

    await client.query(
      `update cart_compositions
       set size = $2, quantity = $3, editing = $4, updated_at = now()
       where id = $1`,
      [compositionId, input.size, input.quantity, options.clearEditing ? false : rows[0].editing],
    );
    await replaceCompositionItems(client, compositionId, input.nails);
    await client.query(`update carts set updated_at = now() where id = $1`, [cart.id]);
    await client.query('commit');
    const updated = (await listCompositionsForCart(pool, cart.id, language)).find(
      (row) => row.id === compositionId,
    );
    if (!updated) throw new Error('not_found');
    return updated;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteComposition(pool: pg.Pool, userId: string, compositionId: string): Promise<void> {
  const cart = await getActiveCart(pool, userId);
  if (!cart) throw new Error('not_found');
  const result = await pool.query(`delete from cart_compositions where id = $1 and cart_id = $2`, [
    compositionId,
    cart.id,
  ]);
  if (result.rowCount === 0) throw new Error('not_found');
  await pool.query(`update carts set updated_at = now() where id = $1`, [cart.id]);
}

/** Sets (or clears, with null) the note on one composed set of the active cart. */
export async function setCompositionComment(
  pool: pg.Pool,
  userId: string,
  compositionId: string,
  comment: string | null,
): Promise<void> {
  const cart = await getActiveCart(pool, userId);
  if (!cart) throw new Error('not_found');
  const result = await pool.query(
    `update cart_compositions set comment = $3, updated_at = now() where id = $1 and cart_id = $2`,
    [compositionId, cart.id, comment],
  );
  if (result.rowCount === 0) throw new Error('not_found');
}

export async function startCompositionEdit(
  pool: pg.Pool,
  userId: string,
  compositionId: string,
  language: Language,
): Promise<CartComposition> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const cart = await getActiveCart(client, userId);
    if (!cart) throw new Error('not_found');
    const editing = await client.query(
      `select id from cart_compositions where cart_id = $1 and editing and id <> $2`,
      [cart.id, compositionId],
    );
    if (editing.rows.length > 0) throw new Error('composition_editing');
    const result = await client.query(
      `update cart_compositions set editing = true, updated_at = now()
       where id = $1 and cart_id = $2 returning id`,
      [compositionId, cart.id],
    );
    if (result.rowCount === 0) throw new Error('not_found');
    await client.query('commit');
    const updated = (await listCompositionsForCart(pool, cart.id, language)).find(
      (row) => row.id === compositionId,
    );
    if (!updated) throw new Error('not_found');
    return updated;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelCompositionEdit(
  pool: pg.Pool,
  userId: string,
  compositionId: string,
  language: Language,
): Promise<CartComposition> {
  const cart = await getActiveCart(pool, userId);
  if (!cart) throw new Error('not_found');
  const result = await pool.query(
    `update cart_compositions set editing = false, updated_at = now()
     where id = $1 and cart_id = $2 returning id`,
    [compositionId, cart.id],
  );
  if (result.rowCount === 0) throw new Error('not_found');
  const updated = (await listCompositionsForCart(pool, cart.id, language)).find(
    (row) => row.id === compositionId,
  );
  if (!updated) throw new Error('not_found');
  return updated;
}

export async function moveCompositionToWishlist(
  pool: pg.Pool,
  userId: string,
  compositionId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const active = await getActiveCart(client, userId);
    if (!active || active.kind === 'wishlist') throw new Error('invalid_request');
    await client.query(
      `insert into carts (id, user_id, name, kind, is_active)
       values ($1, $2, $3, 'wishlist', false)
       on conflict (user_id) where kind = 'wishlist' do nothing`,
      [randomUUID(), userId, 'Wish List'],
    );
    const { rows: wishlistRows } = await client.query<{ id: string }>(
      `select id from carts where user_id = $1 and kind = 'wishlist' for update`,
      [userId],
    );
    const wishlist = wishlistRows[0];
    if (!wishlist) throw new Error('invalid_request');
    const result = await client.query(
      `update cart_compositions set cart_id = $2, editing = false, updated_at = now()
       where id = $1 and cart_id = $3`,
      [compositionId, wishlist.id, active.id],
    );
    if (result.rowCount === 0) throw new Error('not_found');
    await client.query(`update carts set updated_at = now() where id in ($1, $2)`, [active.id, wishlist.id]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function cartHasEditingComposition(
  pool: pg.Pool | pg.PoolClient,
  cartId: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `select 1 from cart_compositions where cart_id = $1 and editing limit 1`,
    [cartId],
  );
  return rows.length > 0;
}

/** Insert a composition into a cart from resolved nails (rebuy / guest import). */
