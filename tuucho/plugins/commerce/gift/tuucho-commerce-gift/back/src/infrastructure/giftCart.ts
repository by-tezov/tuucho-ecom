import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import * as addresses from '@kernel/back/modules/customers/addresses/application/addresses';
import { peekPluginService } from '@tuucho/plugin-sdk';
import type { GiftDestinationInput } from './giftOfferRepo.js';
import type { GiftItemRow } from './giftItemRepo.js';

export async function ensureGiftCart(
  client: pg.PoolClient,
  userId: string,
  offerId: string,
  receiverName: string,
): Promise<string> {
  const { rows: existing } = await client.query<{ id: string }>(
    `select id from carts where user_id = $1 and gift_offer_id = $2`,
    [userId, offerId],
  );
  if (existing[0]) return existing[0].id;
  const id = randomUUID();
  await client.query(
    `insert into carts (id, user_id, name, kind, is_active, gift_offer_id, same_as_billing)
     values ($1, $2, $3, 'gift', false, $4, false)`,
    [id, userId, `Cadeau pour ${receiverName}`.slice(0, 50), offerId],
  );
  return id;
}

/** Claim / open-pay lands Marc on this gift cart, including an empty
 * `selecting` cart the receiver has not filled yet. */
export async function activateGiftCart(client: pg.PoolClient, userId: string, cartId: string): Promise<void> {
  await client.query(
    `update carts set is_active = false, updated_at = now() where user_id = $1 and is_active`,
    [userId],
  );
  await client.query(`update carts set is_active = true, updated_at = now() where id = $1`, [cartId]);
}

export async function replaceGiftCartLines(
  client: pg.PoolClient,
  cartId: string,
  items: GiftItemRow[],
): Promise<void> {
  await client.query(`delete from cart_items where cart_id = $1 and origin = 'user'`, [cartId]);
  if (items.length > 0) {
    await client.query(
      `insert into cart_items (cart_id, product_id, shape_key, length_key, size, pack_key, quantity, origin, locked)
       select $1, unnest($2::uuid[]), unnest($3::text[]), unnest($4::text[]), unnest($5::text[]),
              unnest($6::text[]), unnest($7::integer[]), 'user', true`,
      [
        cartId,
        items.map((item) => item.productId),
        items.map((item) => item.shapeKey),
        items.map((item) => item.lengthKey),
        items.map((item) => item.size),
        items.map((item) => item.packKey ?? ''),
        items.map((item) => item.quantity),
      ],
    );
  }
  await peekPluginService<{
    syncGiftLinesForCart: (client: pg.PoolClient, cartId: string) => Promise<void>;
  }>('tuucho-commerce-cart-rules')?.syncGiftLinesForCart(client, cartId);
}

export async function setGiftCartCheckout(
  client: pg.Pool | pg.PoolClient,
  cartId: string,
  patch: {
    addressId?: string | null;
    billingAddressId?: string | null;
    courierCode?: string | null;
    voucherCode?: string | null;
    applyLoyalty?: boolean;
    express?: boolean;
  },
): Promise<void> {
  const assignments = ['updated_at = now()'];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };
  if (patch.addressId !== undefined) add('address_id', patch.addressId);
  if (patch.billingAddressId !== undefined) add('billing_address_id', patch.billingAddressId);
  if (patch.courierCode !== undefined) add('courier_code', patch.courierCode);
  if (patch.voucherCode !== undefined) add('voucher_code', patch.voucherCode);
  if (patch.applyLoyalty !== undefined) add('apply_loyalty', patch.applyLoyalty);
  if (patch.express !== undefined) add('express', patch.express);
  values.push(cartId);
  await client.query(`update carts set ${assignments.join(', ')} where id = $${values.length}`, values);
}

export async function deleteGiftCart(client: pg.Pool | pg.PoolClient, cartId: string | null): Promise<void> {
  if (!cartId) return;
  const { rows } = await client.query<{ user_id: string; is_active: boolean }>(
    `select user_id, is_active from carts where id = $1 and kind = 'gift'`,
    [cartId],
  );
  const row = rows[0];
  await client.query(`delete from carts where id = $1 and kind = 'gift'`, [cartId]);
  if (!row?.is_active) return;
  const { rows: next } = await client.query<{ id: string }>(
    `select id from carts
     where user_id = $1 and kind not in ('gift', 'wishlist')
     order by (kind = 'default') desc, updated_at desc
     limit 1`,
    [row.user_id],
  );
  if (next[0]) {
    await client.query(`update carts set is_active = true, updated_at = now() where id = $1`, [next[0].id]);
  }
}

export async function setGiftCartUserLinesLocked(
  client: pg.Pool | pg.PoolClient,
  cartId: string,
  locked: boolean,
): Promise<void> {
  await client.query(
    `update cart_items set locked = $2, updated_at = now() where cart_id = $1 and origin = 'user'`,
    [cartId, locked],
  );
}

export async function attachGiftDestinationAddress(
  pool: pg.Pool,
  userId: string,
  cartId: string,
  destination: GiftDestinationInput,
): Promise<void> {
  const { rows } = await pool.query<{ address_id: string | null }>(
    `select address_id from carts where id = $1`,
    [cartId],
  );
  const existingId = rows[0]?.address_id ?? null;
  const patch = {
    recipientName: destination.recipientName ?? undefined,
    companyName: destination.companyName ?? undefined,
    line1: destination.line1,
    line2: destination.line2 ?? undefined,
    deliveryNotes: destination.deliveryNotes ?? undefined,
    postalCode: destination.postalCode,
    city: destination.city,
    countryCode: destination.countryCode,
    phone: destination.phone ?? undefined,
    networkCodes: destination.networkCodes.length > 0 ? destination.networkCodes : ['home'],
    pickupPoints: destination.pickupPoints,
  };
  if (existingId) {
    await addresses.update(pool, userId, existingId, patch);
    await setGiftCartCheckout(pool, cartId, { courierCode: destination.courierCode });
    return;
  }
  const created = await addresses.create(pool, userId, {
    kind: 'livraison',
    ...patch,
    savedForFuture: false,
  });
  await setGiftCartCheckout(pool, cartId, {
    addressId: created.id,
    courierCode: destination.courierCode,
  });
}
