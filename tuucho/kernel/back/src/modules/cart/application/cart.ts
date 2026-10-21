import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { isUuid } from '../../../utils/validate.js';
import { syncGiftLinesForCart } from '../../plugins/application/pluginBridges.js';
import { retryOnCartVanish } from './vanishedCartRetry.js';
import { mapCartListEntry, type CartKind, type CartListEntry, type CartListEntryRow } from './cartTypes.js';
export type { CartKind, CartListEntry };
import { discardOneTimeIfActiveCartEmpty } from '../../commerce/application/discardOneTimeCheckout.js';
import { isShopPaymentMethodEnabled, warmAppPreferences } from '../../settings/application/appPreferences.js';
import { CART_ITEM_COUNT_SQL, CART_TOTAL_SQL } from './cartTotalsSql.js';
import { applyFilters, doAction } from '../../plugins/application/hooks.js';

export type CartItemOrigin = 'user' | 'rule';

export interface CartItemRow {
  product_id: string;
  shape_key: string;
  length_key: string;
  size: string;
  pack_key: string;
  quantity: number;
  origin: CartItemOrigin;
  locked: boolean;
  rule_id: string | null;
  /** Customer note for the card (same value on every size line of one
   * product+shape+length). Null when none. */
  comment: string | null;
}

export interface CartCheckoutFields {
  address_id: string | null;
  billing_address_id: string | null;
  same_as_billing: boolean;
  courier_code: string | null;
  express: boolean;
  payment_method_id: string | null;
  voucher_code: string | null;
  apply_loyalty: boolean;
}

export interface CartRow extends CartCheckoutFields {
  id: string;
  user_id: string;
  name: string;
  kind: CartKind;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CartCheckoutSelection {
  addressId: string | null;
  courierCode: string | null;
  express: boolean;
  billingAddressId: string | null;
  sameAsBilling: boolean;
  paymentMethodId: string | null;
  voucherCode: string | null;
  applyLoyalty: boolean;
}

const EMPTY_CHECKOUT_SELECTION: CartCheckoutSelection = {
  addressId: null,
  courierCode: null,
  express: false,
  billingAddressId: null,
  sameAsBilling: true,
  paymentMethodId: null,
  voucherCode: null,
  applyLoyalty: false,
};

export const DEFAULT_CART_NAME = 'default cart';
/** Sentinel the front maps to its localized "Unconnected cart" label. */
export const UNCONNECTED_CART_NAME = 'unconnected cart';
const WISHLIST_CART_NAME = 'Wish List';
const NEW_CUSTOM_CART_NAME = 'New cart';

/** Carts the customer never created explicitly: labelled from their kind by the
 * client, and outside the CART_MAX_PER_USER budget. Only `default` can be
 * renamed — doing so turns it into an ordinary `custom` cart. */
export function isSystemCartKind(kind: CartKind): boolean {
  return kind === 'default' || kind === 'wishlist' || kind === 'unconnected' || kind === 'gift';
}

/** Trim and enforce non-empty + max length; throws `invalid_name` on failure. */
export function normalizeUserCartName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > config.fieldLimits.cartNameMax) throw new Error('invalid_name');
  return trimmed;
}

export class CartLimitError extends Error {
  readonly code = 'cart_limit_exceeded';
  constructor() {
    super('Cart limit exceeded');
  }
}

export class CartNotFoundError extends Error {
  readonly code = 'not_found';
  constructor() {
    super('Cart not found');
  }
}

export class CartLineLockedError extends Error {
  readonly code = 'line_locked';
  constructor() {
    super('line_locked');
  }
}

function toCheckoutSelection(row: CartCheckoutFields): CartCheckoutSelection {
  return {
    addressId: row.address_id,
    courierCode: row.courier_code,
    express: row.express,
    billingAddressId: row.billing_address_id,
    sameAsBilling: row.same_as_billing,
    paymentMethodId: row.payment_method_id,
    voucherCode: row.voucher_code,
    applyLoyalty: row.apply_loyalty,
  };
}

/** Only customer-created/rebuy carts consume CART_MAX_PER_USER. The default
 * checkout cart, the single lazy Wish List and the single Unconnected cart
 * (parked guest lines) are system carts. */
async function countLimitedCarts(client: pg.Pool | pg.PoolClient, userId: string): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    `select count(*)::text as count
     from carts
     where user_id = $1 and kind not in ('default', 'wishlist', 'unconnected', 'gift')`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function assertUnderLimit(client: pg.Pool | pg.PoolClient, userId: string): Promise<void> {
  if ((await countLimitedCarts(client, userId)) >= config.cartMaxPerUser) {
    throw new CartLimitError();
  }
}

/** Active cart for the user, or undefined if they have none yet. */
export async function getActiveCart(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
): Promise<CartRow | undefined> {
  const { rows } = await pool.query<CartRow>(`select * from carts where user_id = $1 and is_active = true`, [
    userId,
  ]);
  return rows[0];
}

/** Ensure the user has an active cart — creates a default one if needed. */
export async function ensureActiveCart(
  pool: pg.Pool,
  userId: string,
  name: string = DEFAULT_CART_NAME,
): Promise<CartRow> {
  const existing = await getActiveCart(pool, userId);
  if (existing) return existing;

  const client = await pool.connect();
  try {
    await client.query('begin');
    // Serialize first-active-cart creation per user (carts_user_active_uidx).
    await client.query(`select pg_advisory_xact_lock(87215, hashtext($1))`, [userId]);
    const raced = await getActiveCart(client, userId);
    if (raced) {
      await client.query('commit');
      return raced;
    }
    await assertUnderLimit(client, userId);
    const id = randomUUID();
    const { rows } = await client.query<CartRow>(
      `insert into carts (id, user_id, name, kind, is_active)
       values ($1, $2, $3, 'default', true)
       returning *`,
      [id, userId, name],
    );
    await client.query('commit');
    return rows[0]!;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Latest unit price for a cart line's gallery set — same "most recent
 * effective_at wins" rule as checkout / prices.service. Missing price → 0
 * so empty or unpriced lines still yield a numeric cart total. */
const CART_ITEM_COLUMNS =
  'product_id, shape_key, length_key, size, pack_key, quantity, origin, locked, rule_id, comment';

/** A line joining a card inherits that card's note, so a size added later
 * does not silently drop the comment the customer already typed. */
/** The `quantity` / `pack_key` assignments of an upsert onto an existing
 * cart line. The line key has no pack, so re-adding a byQuantity accessory
 * with a different pack switches the line to that pack and its quantity,
 * instead of adding packs of one size to the count of another (which priced
 * every pack at the new size). The same pack adds up, capped at
 * FIELD_CART_QUANTITY_MAX so repeated adds can never overflow the column. */
export function mergedLineQuantitySql(): string {
  return `quantity = least(
             case when cart_items.pack_key = excluded.pack_key
                  then cart_items.quantity + excluded.quantity
                  else excluded.quantity end,
             ${Math.trunc(config.fieldLimits.cartQuantityMax)}),
           pack_key = excluded.pack_key`;
}

const GROUP_COMMENT_SQL = (cart: string, product: string, shape: string, length: string) =>
  `(select g.comment from cart_items g
    where g.cart_id = ${cart} and g.product_id = ${product} and g.shape_key = ${shape}
      and g.length_key = ${length} and g.comment is not null
    limit 1)`;

export async function listCarts(pool: pg.Pool, userId: string): Promise<CartListEntry[]> {
  const { rows } = await pool.query<CartListEntryRow>(
    `select c.id, c.name, c.kind, c.is_active,
            ${CART_ITEM_COUNT_SQL} as item_count,
            ${CART_TOTAL_SQL} as total,
            c.created_at, c.updated_at
     from carts c
     where c.user_id = $1
     order by c.created_at desc`,
    [userId],
  );
  return applyFilters('cart.summaries', rows.map(mapCartListEntry), { client: pool, userId });
}

/** Single-cart summary (item count + subtotal) for mutation responses. */
export async function getCartSummary(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
  cartId: string,
): Promise<CartListEntry | undefined> {
  const { rows } = await pool.query<CartListEntryRow>(
    `select c.id, c.name, c.kind, c.is_active,
            ${CART_ITEM_COUNT_SQL} as item_count,
            ${CART_TOTAL_SQL} as total,
            c.created_at, c.updated_at
     from carts c
     where c.user_id = $1 and c.id = $2`,
    [userId, cartId],
  );
  const mapped = rows[0] ? mapCartListEntry(rows[0]) : undefined;
  if (!mapped) return undefined;
  const [summary] = await applyFilters('cart.summaries', [mapped], { client: pool, userId });
  return summary;
}

export async function getCartForUser(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
  cartId: string,
): Promise<CartRow | undefined> {
  // A malformed id is simply not one of this user's carts (404), not a 500.
  if (!isUuid(cartId)) return undefined;
  const { rows } = await pool.query<CartRow>(`select * from carts where id = $1 and user_id = $2`, [
    cartId,
    userId,
  ]);
  return rows[0];
}

export async function createCart(
  pool: pg.Pool,
  userId: string,
  opts: { name?: string; kind?: CartKind; activate?: boolean } = {},
): Promise<CartRow> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const kind = opts.kind ?? 'custom';
    if (!isSystemCartKind(kind)) await assertUnderLimit(client, userId);
    const id = randomUUID();
    const provided = opts.name?.trim();
    const name = provided
      ? normalizeUserCartName(provided)
      : kind === 'default'
        ? DEFAULT_CART_NAME
        : kind === 'wishlist'
          ? WISHLIST_CART_NAME
          : kind === 'unconnected'
            ? UNCONNECTED_CART_NAME
            : NEW_CUSTOM_CART_NAME;
    const activate = opts.activate !== false;
    if (activate) {
      await client.query(
        `update carts set is_active = false, updated_at = now() where user_id = $1 and is_active`,
        [userId],
      );
    }
    const { rows } = await client.query<CartRow>(
      `insert into carts (id, user_id, name, kind, is_active)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [id, userId, name, kind, activate],
    );
    await client.query('commit');
    return rows[0]!;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Renaming the default cart promotes it to a custom one. The Wish List and
 * the Unconnected cart keep a kind-derived label, so a rename would be a no-op
 * the customer can see — it is rejected instead. Gift carts keep `kind=gift`
 * and store the display name the giver chooses. */
export async function renameCart(
  pool: pg.Pool,
  userId: string,
  cartId: string,
  name: string,
): Promise<CartRow> {
  const trimmed = normalizeUserCartName(name);
  const existing = await getCartForUser(pool, userId, cartId);
  if (!existing) throw new CartNotFoundError();
  if (existing.kind === 'wishlist' || existing.kind === 'unconnected') {
    throw new Error('invalid_request');
  }
  const { rows } = await pool.query<CartRow>(
    `update carts set name = $3, kind = case when kind = 'default' then 'custom' else kind end, updated_at = now()
     where id = $1 and user_id = $2
     returning *`,
    [cartId, userId, trimmed],
  );
  if (!rows[0]) throw new CartNotFoundError();
  return rows[0];
}

export async function activateCart(pool: pg.Pool, userId: string, cartId: string): Promise<CartRow> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const cart = await getCartForUser(client, userId, cartId);
    if (!cart) {
      await client.query('rollback');
      throw new CartNotFoundError();
    }
    await client.query(
      `update carts set is_active = false, updated_at = now() where user_id = $1 and is_active`,
      [userId],
    );
    const { rows } = await client.query<CartRow>(
      `update carts set is_active = true, updated_at = now() where id = $1 returning *`,
      [cartId],
    );
    await client.query('commit');
    return rows[0]!;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteCart(pool: pg.Pool, userId: string, cartId: string): Promise<void> {
  const client = await pool.connect();
  let wasActive = false;
  try {
    await client.query('begin');
    const cart = await getCartForUser(client, userId, cartId);
    if (!cart) {
      await client.query('rollback');
      throw new CartNotFoundError();
    }
    if (cart.kind === 'gift') {
      await client.query('rollback');
      throw new Error('invalid_request');
    }
    wasActive = cart.is_active;
    // The default cart is what every add-to-cart implicitly assumes exists
    // (see ensureActiveCart) — deleting it would just recreate an identical
    // one the next time something is added, so "delete" from Autres paniers
    // almost certainly means "empty this", not "remove my main cart". Clear
    // it in place instead of dropping the row.
    if (cart.kind === 'default') {
      await client.query(`delete from cart_items where cart_id = $1`, [cartId]);
      await doAction('cart.cleared', { client, cartId });
      await client.query(`update carts set updated_at = now() where id = $1`, [cartId]);
    } else {
      await client.query(`delete from carts where id = $1`, [cartId]);
      if (wasActive) {
        const { rows } = await client.query<{ id: string }>(
          `select id from carts where user_id = $1 and kind not in ('gift', 'wishlist')
         order by (kind = 'default') desc, updated_at desc limit 1`,
          [userId],
        );
        if (rows[0]) {
          await client.query(`update carts set is_active = true, updated_at = now() where id = $1`, [
            rows[0].id,
          ]);
        }
      }
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  if (wasActive) {
    await discardOneTimeIfActiveCartEmpty(pool, userId);
  }
}

/** Merge source into target (additive quantities), delete source. If target
 * has no checkout selection filled, copy from source. Activates target. */
export async function mergeCarts(
  pool: pg.Pool,
  userId: string,
  targetCartId: string,
  sourceCartId: string,
): Promise<CartRow> {
  if (targetCartId === sourceCartId) throw new Error('invalid_request');
  const client = await pool.connect();
  try {
    await client.query('begin');
    const target = await getCartForUser(client, userId, targetCartId);
    const source = await getCartForUser(client, userId, sourceCartId);
    if (!target || !source) {
      await client.query('rollback');
      throw new CartNotFoundError();
    }
    if (target.kind === 'gift' || source.kind === 'gift') {
      await client.query('rollback');
      throw new Error('invalid_request');
    }

    // Copy only customer lines; gift/rule lines are rebuilt by sync below.
    await client.query(
      `insert into cart_items (cart_id, product_id, shape_key, length_key, size, pack_key, quantity, origin, locked, rule_id, comment)
       select $1, product_id, shape_key, length_key, size, pack_key, quantity, 'user', false, null, comment
       from cart_items where cart_id = $2 and origin = 'user'
       on conflict (cart_id, product_id, shape_key, length_key, size) do update
         set ${mergedLineQuantitySql()},
             comment = coalesce(cart_items.comment, excluded.comment),
             origin = 'user',
             locked = false,
             rule_id = null,
             updated_at = now()`,
      [targetCartId, sourceCartId],
    );

    const targetEmptySelection =
      !target.address_id && !target.courier_code && !target.payment_method_id && !target.voucher_code;
    if (targetEmptySelection) {
      await client.query(
        `update carts set
           address_id = $2, billing_address_id = $3, same_as_billing = $4,
           courier_code = $5, express = $6, payment_method_id = $7, voucher_code = $8,
           apply_loyalty = $9,
           updated_at = now()
         where id = $1`,
        [
          targetCartId,
          source.address_id,
          source.billing_address_id,
          source.same_as_billing,
          source.courier_code,
          source.express,
          source.payment_method_id,
          source.voucher_code,
          source.apply_loyalty,
        ],
      );
    }

    await doAction('cart.merged', { client, targetCartId, sourceCartId });

    await client.query(`delete from carts where id = $1`, [sourceCartId]);
    await client.query(
      `update carts set is_active = false, updated_at = now() where user_id = $1 and is_active`,
      [userId],
    );
    const { rows } = await client.query<CartRow>(
      `update carts set is_active = true, updated_at = now() where id = $1 returning *`,
      [targetCartId],
    );
    await syncGiftLinesForCart(client, targetCartId);
    await client.query('commit');
    return rows[0]!;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function getCheckoutSelection(pool: pg.Pool, userId: string): Promise<CartCheckoutSelection> {
  const cart = await getActiveCart(pool, userId);
  if (!cart) return EMPTY_CHECKOUT_SELECTION;
  return toCheckoutSelection(cart);
}

/** This is the "advisory" endpoint's write path (see the route's own doc
 * comment) — the client can send any addressId it still has lying around in
 * local state, including one for an address that's since been deleted or
 * belongs to someone else. Silently dropping an id that doesn't resolve to
 * one of this user's addresses (rather than trusting it straight into the
 * FK'd column) keeps that a no-op instead of a 500. */
async function ownedAddressIds(pool: pg.Pool, userId: string, ids: (string | null)[]): Promise<Set<string>> {
  const candidates = ids.filter((id): id is string => isUuid(id));
  if (candidates.length === 0) return new Set();
  const { rows } = await pool.query<{ id: string }>(
    `select id from addresses
     where user_id = $1 and id = any($2::uuid[])
       and (
         (saved_for_future and checkout_use_status = 'saved')
         or (not saved_for_future and checkout_use_status = 'one_time_available')
       )`,
    [userId, candidates],
  );
  return new Set(rows.map((row) => row.id));
}

/** Cart selection is only advisory, but it is still a server write. Never
 * let a delayed browser request put a consumed one-time card back into it.
 * Shop-disabled payment methods are also dropped so a stale selection
 * cannot keep a forbidden method. */
async function eligiblePaymentMethodId(
  pool: pg.Pool,
  userId: string,
  paymentMethodId: string | null,
): Promise<string | null> {
  if (!paymentMethodId) return null;
  await warmAppPreferences();
  const sentinelShop =
    (
      {
        paypal: 'paypal',
        bancontact: 'bancontact',
        google_pay: 'google_pay',
        apple_pay: 'apple_pay',
        new_card: 'card',
      } as const
    )[paymentMethodId as 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay' | 'new_card'] ?? null;
  if (sentinelShop) return isShopPaymentMethodEnabled(sentinelShop) ? paymentMethodId : null;
  if (!isShopPaymentMethodEnabled('card')) return null;
  const { rows } = await pool.query<{ id: string }>(
    `select stripe_payment_method_id as id
     from customer_card_retention
     where user_id = $1 and stripe_payment_method_id = $2
       and (
         (purpose = 'saved' and checkout_use_status = 'saved')
         or (purpose = 'one_time' and checkout_use_status = 'one_time_available')
       )`,
    [userId, paymentMethodId],
  );
  return rows[0]?.id ?? null;
}

/** Drops selection ids that are not this user's (addresses) or not usable
 * (payment method), for writers that bypass setCheckoutSelection. */
export async function ownedSelectionIds(
  pool: pg.Pool,
  userId: string,
  selection: { addressId: string | null; billingAddressId: string | null; paymentMethodId: string | null },
): Promise<{ addressId: string | null; billingAddressId: string | null; paymentMethodId: string | null }> {
  const owned = await ownedAddressIds(pool, userId, [selection.addressId, selection.billingAddressId]);
  return {
    addressId: selection.addressId && owned.has(selection.addressId) ? selection.addressId : null,
    billingAddressId:
      selection.billingAddressId && owned.has(selection.billingAddressId) ? selection.billingAddressId : null,
    paymentMethodId: await eligiblePaymentMethodId(pool, userId, selection.paymentMethodId),
  };
}

export async function setCheckoutSelection(
  pool: pg.Pool,
  userId: string,
  selection: CartCheckoutSelection,
): Promise<CartCheckoutSelection> {
  const cart = await ensureActiveCart(pool, userId);
  const owned = await ownedAddressIds(pool, userId, [selection.addressId, selection.billingAddressId]);
  const addressId = selection.addressId && owned.has(selection.addressId) ? selection.addressId : null;
  const billingAddressId =
    selection.billingAddressId && owned.has(selection.billingAddressId) ? selection.billingAddressId : null;
  const paymentMethodId = await eligiblePaymentMethodId(pool, userId, selection.paymentMethodId);
  const { rows } = await pool.query<CartRow>(
    `update carts set
       address_id = $2, billing_address_id = $3, same_as_billing = $4,
       courier_code = $5, express = $6, payment_method_id = $7, voucher_code = $8,
       apply_loyalty = $9,
       updated_at = now()
     where id = $1
     returning *`,
    [
      cart.id,
      addressId,
      billingAddressId,
      selection.sameAsBilling,
      selection.courierCode,
      selection.express,
      paymentMethodId,
      selection.voucherCode,
      selection.applyLoyalty,
    ],
  );
  return toCheckoutSelection(rows[0]!);
}

/** Apply an explicitly changed account default to the existing active cart
 * without creating a cart or disturbing its other advisory checkout fields.
 * Reset express because it belongs to the previously selected courier. */
export async function setActiveCartCourierSelection(
  pool: pg.Pool,
  userId: string,
  courierCode: string,
): Promise<void> {
  await pool.query(
    `update carts
     set courier_code = $2, express = false, updated_at = now()
     where user_id = $1 and is_active = true`,
    [userId, courierCode],
  );
}

export async function listItemsForCart(
  pool: pg.Pool | pg.PoolClient,
  cartId: string,
): Promise<CartItemRow[]> {
  const { rows } = await pool.query<CartItemRow>(
    `select ${CART_ITEM_COLUMNS}
     from cart_items where cart_id = $1 order by updated_at desc`,
    [cartId],
  );
  return rows;
}

async function assertLineUnlocked(
  client: pg.Pool | pg.PoolClient,
  cartId: string,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  size: string,
): Promise<void> {
  const { rows } = await client.query<{ locked: boolean }>(
    `select locked from cart_items
     where cart_id = $1 and product_id = $2 and shape_key = $3 and length_key = $4 and size = $5`,
    [cartId, productId, shapeKey, lengthKey, size],
  );
  if (rows[0]?.locked) throw new CartLineLockedError();
}

/** Items in the user's active cart (empty if none). Reconciles gift lines
 * so a newly enabled cart_rule appears without requiring a cart mutation. */
export const listForUser = retryOnCartVanish(async (pool: pg.Pool, userId: string) => {
  const cart = await getActiveCart(pool, userId);
  if (!cart) return [];
  await syncGiftLinesForCart(pool, cart.id);
  return listItemsForCart(pool, cart.id);
});

export const addOrIncrement = retryOnCartVanish(async function addOrIncrement(
  pool: pg.Pool,
  userId: string,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  size: string,
  quantity: number,
  packKey = '',
): Promise<void> {
  let cart = await ensureActiveCart(pool, userId);
  if (cart.kind === 'gift') {
    const { rows: mutable } = await pool.query<{ n: string }>(
      `select count(*)::text as n from cart_items
       where cart_id = $1 and origin = 'user' and locked = false`,
      [cart.id],
    );
    if (Number(mutable[0]?.n ?? 0) === 0) {
      const { rows: shop } = await pool.query<CartRow>(
        `select * from carts
         where user_id = $1 and kind <> 'gift'
         order by (kind = 'default') desc, updated_at desc
         limit 1`,
        [userId],
      );
      if (shop[0]) cart = shop[0];
    }
  }
  // A locked (gift) line on this key makes the conflict update a no-op, so
  // zero affected rows is exactly "line locked": no separate check before and
  // re-read after.
  const { rowCount } = await pool.query(
    `insert into cart_items (cart_id, product_id, shape_key, length_key, size, pack_key, quantity, origin, locked, rule_id, comment)
     values ($1, $2, $3, $4, $5, $6, $7, 'user', false, null, ${GROUP_COMMENT_SQL('$1', '$2', '$3', '$4')})
     on conflict (cart_id, product_id, shape_key, length_key, size) do update
       set ${mergedLineQuantitySql()},
           updated_at = now()
     where cart_items.locked = false`,
    [cart.id, productId, shapeKey, lengthKey, size, packKey, quantity],
  );
  if (!rowCount) throw new CartLineLockedError();
  await syncGiftLinesForCart(pool, cart.id);
});

export const updateLine = retryOnCartVanish(async function updateLine(
  pool: pg.Pool,
  userId: string,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  size: string,
  quantity: number,
): Promise<CartItemRow | undefined> {
  const cart = await getActiveCart(pool, userId);
  if (!cart) return undefined;
  await assertLineUnlocked(pool, cart.id, productId, shapeKey, lengthKey, size);
  const { rows } = await pool.query<CartItemRow>(
    `update cart_items
     set quantity = $6, updated_at = now()
     where cart_id = $1 and product_id = $2 and shape_key = $3 and length_key = $4 and size = $5 and locked = false
     returning ${CART_ITEM_COLUMNS}`,
    [cart.id, productId, shapeKey, lengthKey, size, quantity],
  );
  if (!rows[0]) {
    // Distinguish missing vs locked (assert already threw for locked when row exists).
    return undefined;
  }
  await syncGiftLinesForCart(pool, cart.id);
  await discardOneTimeIfActiveCartEmpty(pool, userId);
  return rows[0];
});

export const updateLinePackKey = retryOnCartVanish(async function updateLinePackKey(
  pool: pg.Pool,
  userId: string,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  size: string,
  packKey: string,
): Promise<CartItemRow | undefined> {
  const cart = await getActiveCart(pool, userId);
  if (!cart) return undefined;
  await assertLineUnlocked(pool, cart.id, productId, shapeKey, lengthKey, size);
  const { rows } = await pool.query<CartItemRow>(
    `update cart_items
     set pack_key = $6, updated_at = now()
     where cart_id = $1 and product_id = $2 and shape_key = $3 and length_key = $4 and size = $5 and locked = false
     returning ${CART_ITEM_COLUMNS}`,
    [cart.id, productId, shapeKey, lengthKey, size, packKey],
  );
  return rows[0];
});

export async function changeLineSelection(
  pool: pg.Pool,
  userId: string,
  productId: string,
  fromShapeKey: string,
  fromLengthKey: string,
  fromSize: string,
  toShapeKey: string,
  toLengthKey: string,
  toSize: string,
  /** Overrides the moved line's own quantity (cart's "Replace" picker lets
   * the customer pick a quantity for the new selection instead of just
   * inheriting whatever the old line held). Omit to keep today's behavior. */
  quantity?: number,
): Promise<CartItemRow | undefined> {
  const cart = await getActiveCart(pool, userId);
  if (!cart) return undefined;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await assertLineUnlocked(client, cart.id, productId, fromShapeKey, fromLengthKey, fromSize);
    const { rows } = await client.query<CartItemRow>(
      `delete from cart_items
       where cart_id = $1 and product_id = $2 and shape_key = $3 and length_key = $4 and size = $5 and locked = false
       returning ${CART_ITEM_COLUMNS}`,
      [cart.id, productId, fromShapeKey, fromLengthKey, fromSize],
    );
    const line = rows[0];
    if (!line) {
      await client.query('rollback');
      return undefined;
    }

    const { rows: upserted } = await client.query<CartItemRow>(
      `insert into cart_items (cart_id, product_id, shape_key, length_key, size, quantity, origin, locked, rule_id, comment)
       values ($1, $2, $3, $4, $5, $6, 'user', false, null,
               coalesce(${GROUP_COMMENT_SQL('$1', '$2', '$3', '$4')}, $7::text))
       on conflict (cart_id, product_id, shape_key, length_key, size) do update
         set quantity = cart_items.quantity + excluded.quantity,
             comment = coalesce(cart_items.comment, excluded.comment),
             updated_at = now()
       where cart_items.locked = false
       returning ${CART_ITEM_COLUMNS}`,
      [cart.id, productId, toShapeKey, toLengthKey, toSize, quantity ?? line.quantity, line.comment],
    );
    if (!upserted[0]) {
      await client.query('rollback');
      throw new CartLineLockedError();
    }
    await syncGiftLinesForCart(client, cart.id);
    await client.query('commit');
    return upserted[0];
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function remove(
  pool: pg.Pool,
  userId: string,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  size: string,
): Promise<CartItemRow | undefined> {
  const cart = await getActiveCart(pool, userId);
  if (!cart) return undefined;
  await assertLineUnlocked(pool, cart.id, productId, shapeKey, lengthKey, size);
  const { rows } = await pool.query<CartItemRow>(
    `delete from cart_items
     where cart_id = $1 and product_id = $2 and shape_key = $3 and length_key = $4 and size = $5 and locked = false
     returning ${CART_ITEM_COLUMNS}`,
    [cart.id, productId, shapeKey, lengthKey, size],
  );
  if (rows[0]) {
    await syncGiftLinesForCart(pool, cart.id);
    await discardOneTimeIfActiveCartEmpty(pool, userId);
  }
  return rows[0];
}

/** Sets (or clears, with null) the note on one cart card: every unlocked
 * customer line of this product+shape+length in the active cart. Returns
 * false when the active cart holds no such line. */
export async function setCardComment(
  pool: pg.Pool,
  userId: string,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  comment: string | null,
): Promise<boolean> {
  const cart = await getActiveCart(pool, userId);
  if (!cart) return false;
  const result = await pool.query(
    `update cart_items
     set comment = $5, updated_at = now()
     where cart_id = $1 and product_id = $2 and shape_key = $3 and length_key = $4
       and origin = 'user' and locked = false`,
    [cart.id, productId, shapeKey, lengthKey, comment],
  );
  return (result.rowCount ?? 0) > 0;
}

export interface CartLineIdentity {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
}

/** Atomically move unlocked user lines from the active cart into the
 * account's single lazy Wish List cart. Quantities merge when the same
 * variant was already saved there; the active cart remains active. */
export async function moveToWishlist(
  pool: pg.Pool,
  userId: string,
  identities: CartLineIdentity[],
): Promise<{ wishlist: CartRow; moved: CartItemRow[] }> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: activeRows } = await client.query<CartRow>(
      `select * from carts where user_id = $1 and is_active = true for update`,
      [userId],
    );
    const active = activeRows[0];
    if (!active) throw new CartNotFoundError();
    if (active.kind === 'wishlist') throw new Error('invalid_request');

    await client.query(
      `insert into carts (id, user_id, name, kind, is_active)
       values ($1, $2, $3, 'wishlist', false)
       on conflict (user_id) where kind = 'wishlist' do nothing`,
      [randomUUID(), userId, WISHLIST_CART_NAME],
    );
    const { rows: wishlistRows } = await client.query<CartRow>(
      `select * from carts where user_id = $1 and kind = 'wishlist' for update`,
      [userId],
    );
    const wishlist = wishlistRows[0]!;
    const moved: CartItemRow[] = [];

    for (const identity of identities) {
      await assertLineUnlocked(
        client,
        active.id,
        identity.productId,
        identity.shapeKey,
        identity.lengthKey,
        identity.size,
      );
      const { rows } = await client.query<CartItemRow>(
        `delete from cart_items
         where cart_id = $1 and product_id = $2 and shape_key = $3
           and length_key = $4 and size = $5 and locked = false
         returning ${CART_ITEM_COLUMNS}`,
        [active.id, identity.productId, identity.shapeKey, identity.lengthKey, identity.size],
      );
      const line = rows[0];
      if (!line) continue;
      const { rows: destinationRows } = await client.query<CartItemRow>(
        `insert into cart_items
           (cart_id, product_id, shape_key, length_key, size, pack_key, quantity, origin, locked, rule_id, comment)
         values ($1, $2, $3, $4, $5, $6, $7, 'user', false, null, $8)
         on conflict (cart_id, product_id, shape_key, length_key, size) do update
           set ${mergedLineQuantitySql()},
               comment = coalesce(cart_items.comment, excluded.comment),
               updated_at = now()
         where cart_items.locked = false
         returning ${CART_ITEM_COLUMNS}`,
        [
          wishlist.id,
          line.product_id,
          line.shape_key,
          line.length_key,
          line.size,
          line.pack_key,
          line.quantity,
          line.comment,
        ],
      );
      if (!destinationRows[0]) throw new CartLineLockedError();
      moved.push(line);
    }

    await client.query(`update carts set updated_at = now() where id in ($1, $2)`, [active.id, wishlist.id]);
    await syncGiftLinesForCart(client, active.id);
    await client.query('commit');
    await discardOneTimeIfActiveCartEmpty(pool, userId);
    return { wishlist, moved };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
