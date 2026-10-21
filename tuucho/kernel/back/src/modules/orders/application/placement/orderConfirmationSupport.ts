import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { syncGiftLinesForActiveCart, syncGiftLinesForCart } from '../../../plugins/application/pluginBridges.js';
import { loadCopyVocabulary, resolveTrilingualCopy } from '../../../catalog/application/productCopyResolution.js';
import { type OrderItemRow, type OrderRow } from '../../domain/order.js';
import { attachItems, decryptOrderRow } from '../../infrastructure/orderRows.js';
import { computeOrderContentHash } from '../orderIntegrity.js';
import { saveOrderSnapshot } from '../revisions/orderRevisions.js';
import type { CheckoutFailureReason, PricedCheckout } from '../pricing/checkoutPricing.js';
import type { CheckoutReservationSnapshot } from '../reservation/checkoutReservation.js';
import { applyFilters, doAction } from '../../../plugins/application/hooks.js';

export type ConfirmOrderResult =
  | {
      ok: true;
      order: OrderRow;
      items: OrderItemRow[];
      created: boolean;
      guestSaved?: CheckoutReservationSnapshot['guestSaved'];
    }
  | { ok: false; reason: CheckoutFailureReason };

/** Idempotent webhook/finalize replay path. The order is now the durable
 * settlement record, so it must win over a checkout snapshot that may already
 * have been removed. A later succeeded event only promotes the capture audit;
 * it never re-runs cart, voucher, loyalty, or notification side effects. */
export async function findSettledOrderByPaymentIntent(
  pool: pg.Pool,
  paymentIntentId: string,
  paymentCaptureStatus: PaymentCaptureStatus,
): Promise<ConfirmOrderResult | undefined> {
  const { rows } = await pool.query<OrderRow>(`select * from orders where stripe_payment_intent_id = $1`, [
    paymentIntentId,
  ]);
  let order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
  if (!order) return undefined;
  if (order.payment_capture_status === 'authorized' && paymentCaptureStatus === 'captured') {
    const { rows: updatedRows } = await pool.query<OrderRow>(
      `update orders
          set payment_capture_status = 'captured',
              payment_operation = null,
              payment_operation_started_at = null,
              updated_at = now()
        where id = $1 and payment_capture_status = 'authorized'
        returning *`,
      [order.id],
    );
    if (updatedRows[0]) order = decryptOrderRow(updatedRows[0]);
  }
  const itemsByOrder = await attachItems(pool, [order]);
  return { ok: true, order, items: itemsByOrder.get(order.id) ?? [], created: false };
}

/** Persists all immutable order-item snapshots in one INSERT. Both
 * authenticated and guest confirmation use this exact shape; keeping the
 * builder here removes two copies of a 25-column loop and reduces a checkout
 * with N lines from N database round trips to one. */
export async function insertOrderItems(
  client: pg.PoolClient,
  orderId: string,
  items: PricedCheckout['items'],
): Promise<OrderItemRow[]> {
  if (items.length === 0) return [];
  // The snapshot freezes the copy as the customer saw it: authored `desc`
  // carries shape placeholders that only the line's own shape can resolve.
  const vocabulary = await loadCopyVocabulary(client);
  const values: unknown[] = [];
  const placeholders = items.map(({ line, unitPrice, lineTotal }, index) => {
    const offset = index * 25;
    values.push(
      randomUUID(),
      orderId,
      line.product_id,
      line.product_uid,
      line.product_type,
      line.title,
      resolveTrilingualCopy(line.desc, vocabulary, line.shape_key, line.length_key),
      line.occasion,
      JSON.stringify(line.colors),
      line.shape_key,
      line.length_key,
      line.shape_label,
      line.length_label,
      line.photo_path,
      JSON.stringify(line.photos),
      line.size,
      line.pack_key,
      line.pack_label,
      line.quantity,
      unitPrice,
      lineTotal,
      line.origin,
      line.locked,
      line.rule_code,
      line.comment ?? null,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}::jsonb, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}::jsonb, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20}, $${offset + 21}, $${offset + 22}, $${offset + 23}, $${offset + 24}, $${offset + 25})`;
  });
  const { rows } = await client.query<OrderItemRow>(
    `insert into order_items (
       id, order_id, product_id, product_uid, product_type, title, "desc", occasion, colors,
       shape_key, length_key, shape_label, length_label, photo_path, photos, size, pack_key, pack_label, quantity,
       unit_price, line_total, origin, locked, rule_code, comment
     ) values ${placeholders.join(', ')} returning *`,
    values,
  );
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const ids: string[] = [];
  for (let index = 0; index < values.length; index += 25) ids.push(values[index] as string);
  const inserted = ids.map((id) => rowsById.get(id)!).filter(Boolean);
  return applyFilters('checkout.confirm.items', inserted, { client, items });
}

/** Removes the exact lines captured by an authenticated checkout from the
 * mutable cart, then clears one-time checkout selections. This is shared by
 * the ordinary confirmation and the settled-payment `need_review` fallback: a
 * paid order must not leave its lines available for the customer to submit
 * a second time. `reservationSnapshot === null` is only the compatibility
 * path for reservations created before snapshot storage existed. */
export async function finalizeAuthenticatedCartAfterOrder(
  client: pg.PoolClient,
  userId: string,
  reservationSnapshot: CheckoutReservationSnapshot | null,
): Promise<void> {
  const cartId = reservationSnapshot?.cartId ?? null;
  const cartSql = `c.user_id = $1 and (($7::uuid is null and c.is_active = true) or c.id = $7)`;
  if (reservationSnapshot) {
    const consumed = reservationSnapshot.priced.items
      .map(({ line }) => line)
      .filter((line) => line.product_id != null);
    if (consumed.length > 0) {
      const consumedLinesSql = `
        select unnest($2::uuid[]) as product_id,
               unnest($3::text[]) as shape_key,
               unnest($4::text[]) as length_key,
               unnest($5::text[]) as size,
               unnest($6::integer[]) as quantity`;
      const consumedValues = [
        userId,
        consumed.map((line) => line.product_id),
        consumed.map((line) => line.shape_key),
        consumed.map((line) => line.length_key),
        consumed.map((line) => line.size),
        consumed.map((line) => line.quantity),
        cartId,
      ];
      await client.query(
        `delete from cart_items ci
         using carts c, (${consumedLinesSql}) as consumed
         where c.id = ci.cart_id and ${cartSql}
           and ci.product_id = consumed.product_id
           and ci.shape_key = consumed.shape_key
           and ci.length_key = consumed.length_key
           and ci.size = consumed.size
           and ci.quantity <= consumed.quantity`,
        consumedValues,
      );
      await client.query(
        `update cart_items ci
         set quantity = ci.quantity - consumed.quantity, updated_at = now()
         from carts c, (${consumedLinesSql}) as consumed
         where c.id = ci.cart_id and ${cartSql}
           and ci.product_id = consumed.product_id
           and ci.shape_key = consumed.shape_key
           and ci.length_key = consumed.length_key
           and ci.size = consumed.size
           and ci.quantity > consumed.quantity`,
        consumedValues,
      );
    }
    await doAction('cart.afterOrder', {
      client,
      userId,
      cartId,
      sourceIds: reservationSnapshot.priced.items.map(({ line }) => line.source_id).filter(Boolean),
    });
    if (cartId) await syncGiftLinesForCart(client, cartId);
    else await syncGiftLinesForActiveCart(client, userId);
  } else {
    await client.query(
      `delete from cart_items ci using carts c
       where ci.cart_id = c.id and c.user_id = $1 and c.is_active = true`,
      [userId],
    );
    await doAction('cart.afterOrder', { client, userId, cartId: null, sourceIds: [] });
  }

  await client.query(
    `update carts c
     set address_id = case
           when exists (
             select 1 from addresses a
             where a.id = c.address_id and a.user_id = $1 and not a.saved_for_future
           ) then null else c.address_id end,
         billing_address_id = case
           when exists (
             select 1 from addresses a
             where a.id = c.billing_address_id and a.user_id = $1 and not a.saved_for_future
           ) then null else c.billing_address_id end,
         payment_method_id = case
           when exists (
             select 1 from customer_card_retention r
             where r.user_id = $1
               and r.stripe_payment_method_id = c.payment_method_id
               and r.purpose = 'one_time'
           ) then null else c.payment_method_id end,
         updated_at = now()
     where c.user_id = $1 and (($2::uuid is null and c.is_active) or c.id = $2)`,
    [userId, cartId],
  );

  const { rows: kindRows } = cartId
    ? await client.query<{ kind: string }>(`select kind from carts where id = $1`, [cartId])
    : { rows: [] as { kind: string }[] };
  if (kindRows[0]?.kind === 'gift') return;

  const { rows: emptiedCartRows } = await client.query<{ id: string }>(
    `select c.id from carts c
     where c.user_id = $1 and c.is_active = true
       and not exists (select 1 from cart_items ci where ci.cart_id = c.id)`,
    [userId],
  );
  let emptiedCartId: string | undefined = emptiedCartRows[0]?.id;
  if (emptiedCartId) {
    const stillEmpty = await applyFilters('cart.isEmpty', true, { client, cartId: emptiedCartId });
    if (!stillEmpty) emptiedCartId = undefined;
  }
  if (!emptiedCartId) return;
  await client.query(`delete from carts where id = $1`, [emptiedCartId]);
  const { rows: nextActiveRows } = await client.query<{ id: string }>(
    `select id from carts where user_id = $1 and kind not in ('gift', 'wishlist')
         order by (kind = 'default') desc, updated_at desc limit 1`,
    [userId],
  );
  if (nextActiveRows[0]) {
    await client.query(`update carts set is_active = true, updated_at = now() where id = $1`, [
      nextActiveRows[0].id,
    ]);
  }
}

export type PaymentCaptureStatus = 'authorized' | 'captured' | 'not_required' | 'canceled' | 'expired';
export type OrderPaymentMethodType = 'card' | 'paypal' | 'bancontact' | 'free';
export interface OrderPaymentMethodSnapshot {
  type: OrderPaymentMethodType;
  brand: string | null;
  last4: string | null;
}

/** Stamps the order's integrity hash and writes revision 0 of its snapshot —
 * the last step of both confirmOrder and confirmGuestOrder, identical in each.
 * Mutates `order.content_hash` so the caller's in-memory row matches what was
 * written, which the confirmation email and the integrity token both read. */
export async function sealOrderIntegrity(
  client: pg.PoolClient,
  order: OrderRow,
  insertedItems: OrderItemRow[],
): Promise<void> {
  const contentHash = computeOrderContentHash(order, insertedItems);
  await client.query(`update orders set content_hash = $2 where id = $1`, [order.id, contentHash]);
  order.content_hash = contentHash;
  await saveOrderSnapshot(client, order, insertedItems, 0);
}
