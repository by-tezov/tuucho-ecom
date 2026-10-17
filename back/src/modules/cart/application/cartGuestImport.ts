import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { syncGiftLinesForCart } from '../../commerce/application/cartGiftLines.js';
import type { CartKind } from './cartTypes.js';
import { copyCompositionIntoCart } from './compositionWrite.js';
import {
  assertUnderLimit,
  CartNotFoundError,
  DEFAULT_CART_NAME,
  getCartForUser,
  mergedLineQuantitySql,
  normalizeUserCartName,
  UNCONNECTED_CART_NAME,
  type CartRow,
} from './cart.js';

export interface GuestImportLine {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
  packKey?: string;
  quantity: number;
  comment?: string | null;
}

export interface GuestImportSelection {
  addressId?: string | null;
  billingAddressId?: string | null;
  sameAsBilling?: boolean;
  courierCode?: string | null;
  express?: boolean;
  paymentMethodId?: string | null;
  voucherCode?: string | null;
}

export type GuestImportMode = 'new' | 'merge' | 'unconnected';

/** Import guest lines into a new cart, merge them into an existing one, or park
 * them in the account's single Unconnected cart (`unconnected` — used when the
 * customer closes the create-vs-merge dialog instead of choosing). Parking
 * never steals the active cart: the customer keeps the cart they logged into,
 * and finds the guest lines in the switcher. */
export async function importGuestCart(
  pool: pg.Pool,
  userId: string,
  mode: GuestImportMode,
  targetCartId: string | undefined,
  lines: GuestImportLine[],
  selection: GuestImportSelection,
  newCartName: string = DEFAULT_CART_NAME,
  compositions: Array<{
    size: string;
    quantity: number;
    nails: Array<{ productId: string; shapeKey: string; lengthKey: string; finger: string }>;
  }> = [],
): Promise<CartRow> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    let cartId: string;

    if (mode === 'unconnected') {
      // One Unconnected cart per user (carts_user_unconnected_uidx): a second
      // close lands in the same row. `do nothing` + `for update` mirrors the
      // lazy Wish List so two parallel logins can't collide, and `is_active`
      // stays false — parking must not steal the cart the customer logged into.
      await client.query(
        `insert into carts (
           id, user_id, name, kind, is_active,
           address_id, billing_address_id, same_as_billing,
           courier_code, express, payment_method_id, voucher_code
         ) values ($1,$2,$3,'unconnected',false,$4,$5,$6,$7,$8,$9,$10)
         on conflict (user_id) where kind = 'unconnected' do nothing`,
        [
          randomUUID(),
          userId,
          UNCONNECTED_CART_NAME,
          selection.addressId ?? null,
          selection.billingAddressId ?? null,
          selection.sameAsBilling !== false,
          selection.courierCode ?? null,
          selection.express === true,
          selection.paymentMethodId ?? null,
          selection.voucherCode ?? null,
        ],
      );
      const { rows: parkedRows } = await client.query<CartRow>(
        `select * from carts where user_id = $1 and kind = 'unconnected' for update`,
        [userId],
      );
      cartId = parkedRows[0]!.id;
      // Fill the blanks only — a selection parked by an earlier close wins.
      await client.query(
        `update carts set
           address_id = coalesce(address_id, $2),
           billing_address_id = coalesce(billing_address_id, $3),
           courier_code = coalesce(courier_code, $4),
           payment_method_id = coalesce(payment_method_id, $5),
           voucher_code = coalesce(voucher_code, $6),
           updated_at = now()
         where id = $1`,
        [
          cartId,
          selection.addressId ?? null,
          selection.billingAddressId ?? null,
          selection.courierCode ?? null,
          selection.paymentMethodId ?? null,
          selection.voucherCode ?? null,
        ],
      );
    } else if (mode === 'new') {
      const { rows: defaultRows } = await client.query<{ exists: boolean }>(
        `select exists(select 1 from carts where user_id = $1 and kind = 'default') as exists`,
        [userId],
      );
      const kind: CartKind = defaultRows[0]?.exists ? 'custom' : 'default';
      if (kind === 'custom') await assertUnderLimit(client, userId);
      cartId = randomUUID();
      await client.query(
        `update carts set is_active = false, updated_at = now() where user_id = $1 and is_active`,
        [userId],
      );
      await client.query(
        `insert into carts (
           id, user_id, name, kind, is_active,
           address_id, billing_address_id, same_as_billing,
           courier_code, express, payment_method_id, voucher_code
         ) values ($1,$2,$3,$11,true,$4,$5,$6,$7,$8,$9,$10)`,
        [
          cartId,
          userId,
          normalizeUserCartName(newCartName),
          selection.addressId ?? null,
          selection.billingAddressId ?? null,
          selection.sameAsBilling !== false,
          selection.courierCode ?? null,
          selection.express === true,
          selection.paymentMethodId ?? null,
          selection.voucherCode ?? null,
          kind,
        ],
      );
    } else {
      if (!targetCartId) throw new Error('invalid_request');
      const target = await getCartForUser(client, userId, targetCartId);
      if (!target) {
        await client.query('rollback');
        throw new CartNotFoundError();
      }
      cartId = target.id;
      await client.query(
        `update carts set is_active = false, updated_at = now() where user_id = $1 and is_active`,
        [userId],
      );
      await client.query(
        `update carts set
           is_active = true,
           address_id = coalesce($2, address_id),
           billing_address_id = coalesce($3, billing_address_id),
           same_as_billing = coalesce($4, same_as_billing),
           courier_code = coalesce($5, courier_code),
           express = coalesce($6, express),
           payment_method_id = coalesce($7, payment_method_id),
           voucher_code = coalesce($8, voucher_code),
           updated_at = now()
         where id = $1`,
        [
          cartId,
          selection.addressId ?? null,
          selection.billingAddressId ?? null,
          selection.sameAsBilling,
          selection.courierCode ?? null,
          selection.express,
          selection.paymentMethodId ?? null,
          selection.voucherCode ?? null,
        ],
      );
    }

    // One row per line key: a single INSERT ... ON CONFLICT cannot touch the
    // same row twice, and a guest cart can carry two lines of one accessory
    // with different packs (the line key has no pack). Same rule as
    // mergedLineQuantitySql: same pack adds up, another pack replaces.
    const merged = new Map<string, GuestImportLine>();
    for (const line of lines) {
      const key = `${line.productId}|${line.shapeKey}|${line.lengthKey}|${line.size}`;
      const previous = merged.get(key);
      if (!previous) {
        merged.set(key, { ...line });
        continue;
      }
      const samePack = (previous.packKey ?? '') === (line.packKey ?? '');
      merged.set(key, {
        ...line,
        quantity: Math.min(
          samePack ? previous.quantity + line.quantity : line.quantity,
          config.fieldLimits.cartQuantityMax,
        ),
        comment: previous.comment ?? line.comment ?? null,
      });
    }
    const importLines = [...merged.values()];

    if (importLines.length > 0) {
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
          importLines.map((line) => line.productId),
          importLines.map((line) => line.shapeKey),
          importLines.map((line) => line.lengthKey),
          importLines.map((line) => line.size),
          importLines.map((line) => line.packKey ?? ''),
          importLines.map((line) => line.quantity),
          importLines.map((line) => line.comment ?? null),
        ],
      );
    }
    for (const composition of compositions) {
      // Stale guest composition (unavailable nail, invalid finger): dropped
      // rather than refusing the whole merge over one line.
      await copyCompositionIntoCart(client, cartId, composition);
    }

    await syncGiftLinesForCart(client, cartId);
    const { rows } = await client.query<CartRow>(`select * from carts where id = $1`, [cartId]);
    await client.query('commit');
    return rows[0]!;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
