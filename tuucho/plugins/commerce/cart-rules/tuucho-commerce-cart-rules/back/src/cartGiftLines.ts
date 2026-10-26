import type pg from 'pg';
import { CART_SET_UNITS_SQL } from '@kernel/back/modules/commerce/application/cartNailUnitsSql';
import { desiredGiftQuantities, listCartRules } from './cartRules.js';

/** Sync locked gift lines on a cart from the enabled `gift_per_nail_set`
 * rules: one line per gift product, filed under the first rule granting it
 * (see desiredGiftQuantities).
 *
 * Runs on every cart read and mutation, so it compares first and writes only
 * what differs: a cart page view whose gifts are already right is reads only
 * (it used to upsert every gift line and bump `carts.updated_at` each time,
 * which also reshuffled the most-recent-cart ordering).
 *
 * A rule never takes over a line the customer added themselves: the line key
 * has no origin, so when the gift product is also in the cart as a paid line,
 * that line is left alone instead of being turned into free locked units. */
export async function syncGiftLinesForCart(
  client: pg.Pool | pg.PoolClient,
  cartId: string,
  excludeReservationId?: string,
): Promise<void> {
  const rules = await listCartRules(client);
  const { rows: unitRows } = await client.query<{ set_units: string }>(
    `select ${CART_SET_UNITS_SQL}::text as set_units`,
    [cartId, excludeReservationId ?? null],
  );
  const gifts = desiredGiftQuantities(rules, {
    setUnits: Number(unitRows[0]?.set_units ?? 0),
  });

  // Resolve every gift product in one lookup.
  const productIdByUid = new Map<string, string>();
  if (gifts.length > 0) {
    const { rows: productRows } = await client.query<{ id: string; product_uid: string }>(
      `select id, product_uid from products where upper(product_uid) = any($1::text[])`,
      [gifts.map((gift) => gift.productUid.toUpperCase())],
    );
    for (const row of productRows) productIdByUid.set(row.product_uid.toUpperCase(), row.id);
  }
  const ruleIdByCode = new Map(rules.map((rule) => [rule.code, rule.id]));

  const desired = new Map<string, { quantity: number; ruleId: string }>();
  for (const gift of gifts) {
    const productId = productIdByUid.get(gift.productUid.toUpperCase());
    const ruleId = ruleIdByCode.get(gift.ruleCode);
    if (!productId || !ruleId || desired.has(productId)) continue;
    desired.set(productId, { quantity: gift.quantity, ruleId });
  }

  // Every rule line, plus any line already sitting on a gift product's key.
  const { rows: existingRows } = await client.query<{
    product_id: string;
    quantity: number;
    origin: 'user' | 'rule';
    rule_id: string | null;
  }>(
    `select product_id, quantity, origin, rule_id from cart_items
     where cart_id = $1
       and (origin = 'rule'
         or (product_id = any($2::uuid[]) and shape_key = '' and length_key = '' and size = ''))`,
    [cartId, [...desired.keys()]],
  );
  const existingByProduct = new Map(
    existingRows
      .filter((row) => row.origin === 'user' || desired.has(row.product_id))
      .map((row) => [row.product_id, row]),
  );

  let changed = false;
  for (const [productId, want] of desired) {
    const current = existingByProduct.get(productId);
    if (current?.origin === 'user') continue;
    if (current && current.quantity === want.quantity && current.rule_id === want.ruleId) continue;
    await client.query(
      `insert into cart_items (cart_id, product_id, shape_key, length_key, size, quantity, origin, locked, rule_id)
       select $1, $2, '', '', '', $3, 'rule', true, $4
       where exists (select 1 from carts where id = $1) -- no-op if the cart is gone
       on conflict (cart_id, product_id, shape_key, length_key, size) do update
         set quantity = excluded.quantity, locked = true,
             rule_id = excluded.rule_id, updated_at = now()
         where cart_items.origin = 'rule'`,
      [cartId, productId, want.quantity, want.ruleId],
    );
    changed = true;
  }

  // Drop stale rule gift lines (disabled rules, missing products, a product
  // whose gift moved to another line, etc.).
  const stale = existingRows.filter((row) => row.origin === 'rule' && !desired.has(row.product_id));
  if (stale.length > 0) {
    await client.query(
      `delete from cart_items where cart_id = $1 and origin = 'rule' and product_id = any($2::uuid[])`,
      [cartId, stale.map((row) => row.product_id)],
    );
    changed = true;
  }

  if (changed) await client.query(`update carts set updated_at = now() where id = $1`, [cartId]);
}

export async function syncGiftLinesForActiveCart(
  client: pg.Pool | pg.PoolClient,
  userId: string,
  excludeReservationId?: string,
): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `select id from carts where user_id = $1 and is_active = true`,
    [userId],
  );
  const cartId = rows[0]?.id;
  if (!cartId) return;
  await syncGiftLinesForCart(client, cartId, excludeReservationId);
}
