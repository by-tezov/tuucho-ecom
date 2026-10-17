import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { generateOpaqueToken, hashOpaqueToken as hashToken } from '../../../platform/security/opaqueToken.js';
import { syncGiftLinesForCart } from '../../commerce/application/cartGiftLines.js';
import { copyCompositionIntoCart } from './compositionWrite.js';
import {
  assertUnderLimit,
  CartNotFoundError,
  getCartForUser,
  listItemsForCart,
  mergedLineQuantitySql,
  type CartCheckoutFields,
  type CartItemRow,
  type CartRow,
} from './cart.js';

/** Reorder from a past order into a new or existing cart, with a 30-minute
 * one-shot token that undoes it (split out of cart.ts). */
const REBUY_SNAPSHOT_TTL_MS = 30 * 60 * 1000;

interface SnapshotPayload {
  mode: 'new' | 'merge';
  lines: CartItemRow[];
  checkout: CartCheckoutFields;
  /** Composed sets already in the cart before a merge rebuy; cancelling
   * removes the ones the rebuy added. Absent on snapshots written before it
   * existed, which then leave compositions alone. */
  compositionIds?: string[];
}

async function snapshotCartState(client: pg.PoolClient, cartId: string): Promise<SnapshotPayload> {
  const cart = (await client.query<CartRow>(`select * from carts where id = $1`, [cartId])).rows[0]!;
  const allLines = await listItemsForCart(client, cartId);
  const { rows: compositionRows } = await client.query<{ id: string }>(
    `select id from cart_compositions where cart_id = $1`,
    [cartId],
  );
  return {
    mode: 'merge',
    lines: allLines.filter((line) => line.origin === 'user'),
    compositionIds: compositionRows.map((row) => row.id),
    checkout: {
      address_id: cart.address_id,
      billing_address_id: cart.billing_address_id,
      same_as_billing: cart.same_as_billing,
      courier_code: cart.courier_code,
      express: cart.express,
      payment_method_id: cart.payment_method_id,
      voucher_code: cart.voucher_code,
      apply_loyalty: cart.apply_loyalty,
    },
  };
}

async function insertRebuySnapshot(
  client: pg.PoolClient,
  userId: string,
  cartId: string,
  mode: 'new' | 'merge',
  payload: SnapshotPayload,
): Promise<string> {
  const raw = generateOpaqueToken();
  // Snapshots live 30 minutes and used to be kept forever; expired ones are
  // dropped here (cart_rebuy_snapshots_expires_idx), a day past expiry.
  await client.query(`delete from cart_rebuy_snapshots where expires_at < now() - interval '1 day'`);
  await client.query(
    `insert into cart_rebuy_snapshots (id, user_id, token_hash, mode, cart_id, payload, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      userId,
      hashToken(raw),
      mode,
      cartId,
      JSON.stringify({ ...payload, mode }),
      new Date(Date.now() + REBUY_SNAPSHOT_TTL_MS),
    ],
  );
  return raw;
}

export interface RebuyResult {
  cartId: string;
  snapshotToken: string;
  addedLines: CartItemRow[];
}

/** Copy order lines into a new or existing cart; returns cancel token. */
export async function rebuyFromOrder(
  pool: pg.Pool,
  userId: string,
  _orderId: string,
  mode: 'new' | 'merge',
  targetCartId: string | undefined,
  orderNumber: string,
  lines: CartItemRow[],
  compositions: Array<{
    size: string;
    quantity: number;
    nails: Array<{ productId: string; shapeKey: string; lengthKey: string; finger: string }>;
  }> = [],
): Promise<RebuyResult> {
  if (lines.length === 0 && compositions.length === 0) throw new Error('invalid_request');
  const client = await pool.connect();
  try {
    await client.query('begin');

    let cartId: string;
    let snapshotPayload: SnapshotPayload;

    if (mode === 'new') {
      await assertUnderLimit(client, userId);
      cartId = randomUUID();
      const name = `Commander à nouveau ${orderNumber}`.slice(0, config.fieldLimits.cartNameMax);
      await client.query(
        `update carts set is_active = false, updated_at = now() where user_id = $1 and is_active`,
        [userId],
      );
      await client.query(
        `insert into carts (id, user_id, name, kind, is_active) values ($1, $2, $3, 'rebuy', true)`,
        [cartId, userId, name],
      );
      snapshotPayload = {
        mode: 'new',
        lines: [],
        checkout: {
          address_id: null,
          billing_address_id: null,
          same_as_billing: true,
          courier_code: null,
          express: false,
          payment_method_id: null,
          voucher_code: null,
          apply_loyalty: false,
        },
      };
    } else {
      if (!targetCartId) throw new Error('invalid_request');
      const target = await getCartForUser(client, userId, targetCartId);
      if (!target) {
        await client.query('rollback');
        throw new CartNotFoundError();
      }
      cartId = target.id;
      snapshotPayload = await snapshotCartState(client, cartId);
      await client.query(
        `update carts set is_active = false, updated_at = now() where user_id = $1 and is_active`,
        [userId],
      );
      await client.query(`update carts set is_active = true, updated_at = now() where id = $1`, [cartId]);
    }

    if (lines.length > 0) {
      await client.query(
        `insert into cart_items (cart_id, product_id, shape_key, length_key, size, pack_key, quantity, origin, locked, rule_id, comment)
         select $1, unnest($2::uuid[]), unnest($3::text[]), unnest($4::text[]), unnest($5::text[]),
                unnest($6::text[]), unnest($7::integer[]), 'user', false, null, unnest($8::text[])
         on conflict (cart_id, product_id, shape_key, length_key, size) do update
           set ${mergedLineQuantitySql()},
               comment = coalesce(cart_items.comment, excluded.comment),
               origin = 'user',
               locked = false,
               rule_id = null,
               updated_at = now()
         where cart_items.locked = false`,
        [
          cartId,
          lines.map((line) => line.product_id),
          lines.map((line) => line.shape_key),
          lines.map((line) => line.length_key),
          lines.map((line) => line.size),
          lines.map((line) => line.pack_key ?? ''),
          lines.map((line) => line.quantity),
          lines.map((line) => line.comment ?? null),
        ],
      );
    }
    // Availability is rechecked by the cart (compositionRequest.ts's
    // readOrderCompositions contract), so an out-of-stock nail keeps its set;
    // a set that can no longer exist at all is skipped.
    for (const composition of compositions) {
      await copyCompositionIntoCart(client, cartId, composition, { keepUnavailable: true });
    }
    await syncGiftLinesForCart(client, cartId);

    const snapshotToken = await insertRebuySnapshot(client, userId, cartId, mode, snapshotPayload);
    await client.query('commit');
    return { cartId, snapshotToken, addedLines: lines };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelRebuy(pool: pg.Pool, userId: string, rawToken: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<{
      id: string;
      mode: 'new' | 'merge';
      cart_id: string;
      payload: SnapshotPayload;
    }>(
      `update cart_rebuy_snapshots
       set consumed_at = now()
       where token_hash = $1 and user_id = $2 and consumed_at is null and expires_at > now()
       returning id, mode, cart_id, payload`,
      [hashToken(rawToken), userId],
    );
    const snap = rows[0];
    if (!snap) {
      await client.query('rollback');
      throw new Error('invalid_or_expired_token');
    }

    if (snap.mode === 'new') {
      await client.query(`delete from carts where id = $1 and user_id = $2`, [snap.cart_id, userId]);
      const { rows: next } = await client.query<{ id: string }>(
        `select id from carts where user_id = $1 and kind not in ('gift', 'wishlist')
         order by (kind = 'default') desc, updated_at desc limit 1`,
        [userId],
      );
      if (next[0]) {
        await client.query(`update carts set is_active = true, updated_at = now() where id = $1`, [
          next[0].id,
        ]);
      }
    } else {
      const cart = await getCartForUser(client, userId, snap.cart_id);
      if (cart) {
        await client.query(`delete from cart_items where cart_id = $1`, [snap.cart_id]);
        if (snap.payload.compositionIds) {
          await client.query(
            `delete from cart_compositions where cart_id = $1 and not (id = any($2::uuid[]))`,
            [snap.cart_id, snap.payload.compositionIds],
          );
        }
        if (snap.payload.lines.length > 0) {
          await client.query(
            `insert into cart_items (cart_id, product_id, shape_key, length_key, size, pack_key, quantity, origin, locked, rule_id, comment)
             select $1, unnest($2::uuid[]), unnest($3::text[]), unnest($4::text[]), unnest($5::text[]),
                    unnest($6::text[]), unnest($7::integer[]), 'user', false, null, unnest($8::text[])`,
            [
              snap.cart_id,
              snap.payload.lines.map((line) => line.product_id),
              snap.payload.lines.map((line) => line.shape_key),
              snap.payload.lines.map((line) => line.length_key),
              snap.payload.lines.map((line) => line.size),
              snap.payload.lines.map((line) => line.pack_key ?? ''),
              snap.payload.lines.map((line) => line.quantity),
              snap.payload.lines.map((line) => line.comment ?? null),
            ],
          );
        }
        const c = snap.payload.checkout;
        await client.query(
          `update carts set
             address_id = $2, billing_address_id = $3, same_as_billing = $4,
             courier_code = $5, express = $6, payment_method_id = $7, voucher_code = $8,
             apply_loyalty = $9,
             is_active = true, updated_at = now()
           where id = $1`,
          [
            snap.cart_id,
            c.address_id,
            c.billing_address_id,
            c.same_as_billing,
            c.courier_code,
            c.express,
            c.payment_method_id,
            c.voucher_code,
            c.apply_loyalty ?? false,
          ],
        );
        await client.query(
          `update carts set is_active = false, updated_at = now()
           where user_id = $1 and id <> $2 and is_active`,
          [userId, snap.cart_id],
        );
        await syncGiftLinesForCart(client, snap.cart_id);
      }
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
