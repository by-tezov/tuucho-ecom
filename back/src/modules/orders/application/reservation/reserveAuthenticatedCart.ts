import { randomUUID } from 'node:crypto';
import { scheduleStockReservationMaintenance } from './stockReservationMaintenance.js';
import { withDeadlockRetry } from '../../../commerce/application/deadlockRetry.js';
import type pg from 'pg';
import {
  holdVoucher,
  lockVouchersForCheckout,
  releaseVoucherHoldsForReservations,
} from '../../../vouchers/application/vouchers.js';
import type { AccessoryType } from '../../../catalog/domain/accessoryPacks.js';
import { dbPacks, stockUnitsForLine } from '../../../catalog/domain/accessoryPacks.js';
import { createLoyaltyHold, releaseLoyaltyHoldsForUser } from '../../../loyalty/application/loyalty.js';
import { priceLoyaltyIfEnabled } from '../../../loyalty/application/loyaltyPlugin.js';
import { roundMoney as round2 } from '../../../commerce/domain/checkoutMoney.js';
import {
  type CheckoutFailureReason,
  type PricedCheckout,
  type StockReservationItem,
  priceCheckout,
} from '../pricing/checkoutPricing.js';
import {
  insertReservationItems,
  purgeTemporaryCheckoutReservationSnapshots,
  saveCheckoutReservationSnapshot,
} from './checkoutReservationSnapshot.js';

export type ReserveCartResult =
  | { ok: true; priced: PricedCheckout; reservationId: string; expiresAt: string }
  | { ok: false; reason: CheckoutFailureReason };

/** Atomically allocates the current cart against the manager-imported stock.
 * A row lock on each affected source stock row serializes competing checkout
 * attempts for the same size. Existing holds for this user are released
 * first: the checkout UI may replace its initial card intent with a PayPal
 * intent, and one person must not block themself with two parallel holds. */

export async function reserveCart(
  pool: pg.Pool,
  userId: string,
  addressId: string,
  courierCode: string,
  express: boolean,
  reservationTtlMs: number,
  voucherCode?: string,
  billingAddressId?: string,
  applyLoyalty?: boolean,
  cartId?: string,
  releaseReservationIds?: string[],
): Promise<ReserveCartResult> {
  scheduleStockReservationMaintenance(pool);
  return withDeadlockRetry(() =>
    reserveCartOnce(
      pool,
      userId,
      addressId,
      courierCode,
      express,
      reservationTtlMs,
      voucherCode,
      billingAddressId,
      applyLoyalty,
      cartId,
      releaseReservationIds,
    ),
  );
}

async function reserveCartOnce(
  pool: pg.Pool,
  userId: string,
  addressId: string,
  courierCode: string,
  express: boolean,
  reservationTtlMs: number,
  voucherCode?: string,
  billingAddressId?: string,
  applyLoyalty?: boolean,
  cartId?: string,
  releaseReservationIds?: string[],
): Promise<ReserveCartResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Serialize all checkout reservations for one account before locking
    // voucher/stock rows. This makes replacement of its previous holds
    // atomic even when two tabs submit at the same time.
    await client.query(`select id from users where id = $1 for update`, [userId]);
    // Voucher rows before hold/reservation mutations — see lockVouchersForCheckout.
    await lockVouchersForCheckout(client, userId, voucherCode);
    const { rows: activeReservationRows } = await client.query<{ id: string }>(
      `select id from stock_reservations
       where state = 'held'
         and ((user_id = $1 and purpose = 'checkout') or id = any($2::uuid[]))
       for update`,
      [userId, releaseReservationIds ?? []],
    );
    await client.query(
      `update stock_reservations set state = 'released', updated_at = now()
       where state = 'held'
         and ((user_id = $1 and purpose = 'checkout') or id = any($2::uuid[]))`,
      [userId, releaseReservationIds ?? []],
    );
    await purgeTemporaryCheckoutReservationSnapshots(client);
    await releaseVoucherHoldsForReservations(
      client,
      activeReservationRows.map((row) => row.id),
    );
    await releaseLoyaltyHoldsForUser(client, userId);

    const priceResult = await priceCheckout(client, {
      userId,
      addressId,
      courierCode,
      express,
      voucherCode,
      billingAddressId,
      checkAvailability: false,
      excludeUnavailable: true,
      applyLoyalty,
      cartId,
    });
    if (!priceResult.ok) {
      await client.query('rollback');
      return priceResult;
    }

    // If pricing resolved a voucher that was not in the pre-lock set (should be
    // rare), take it now before stock so order stays voucher → availability.
    if (priceResult.priced.voucher) {
      await client.query(`select code from vouchers where lower(code) = lower($1) for update`, [
        priceResult.priced.voucher.code,
      ]);
    }

    // Take the source-row locks in their own statement. The availability
    // calculation below therefore starts with a fresh Read Committed snapshot
    // *after* a transaction we waited on has committed its reservation.
    // A missing row is unavailable (the manager's "missing means zero" rule).
    // Lock every cart line that has a stock row — including out-of-stock ones —
    // then reserve only the purchasable subset from priceCheckout.
    // ORDER BY keeps multi-line carts locking availability in a stable order.
    await client.query(
      `select gsa.product_id
       from cart_items ci
       join carts c on c.id = ci.cart_id
       join product_availability gsa
         on gsa.product_id = ci.product_id and gsa.shape_key = ci.shape_key
        and gsa.length_key = ci.length_key and gsa.size = ci.size
       where c.user_id = $1 and (($2::uuid is null and c.is_active = true) or c.id = $2)
       order by gsa.product_id, gsa.shape_key, gsa.length_key, gsa.size
       for update of gsa`,
      [userId, cartId ?? null],
    );

    const { rows: stockRows } = await client.query<
      StockReservationItem & {
        source_quantity: number;
        allocated_quantity: number;
        pack_key: string;
        accessory_type: AccessoryType;
        accessory_packs: unknown;
      }
    >(
      `select ci.product_id, ci.shape_key, ci.length_key, ci.size, ci.quantity, ci.pack_key,
              gs.accessory_type, gs.accessory_packs,
              gsa.quantity as source_quantity,
              coalesce((
                select sum(sri.quantity)
                from stock_reservation_items sri
                join stock_reservations sr on sr.id = sri.reservation_id
                where sri.product_id = gsa.product_id
                  and sri.shape_key = gsa.shape_key
                  and sri.length_key = gsa.length_key
                  and sri.size = gsa.size
                  and (sr.state = 'consumed' or (sr.state = 'held' and sr.expires_at > now()))
              ), 0)::integer as allocated_quantity
       from cart_items ci
       join carts c on c.id = ci.cart_id
       join products gs on gs.id = ci.product_id
       join product_availability gsa
         on gsa.product_id = ci.product_id and gsa.shape_key = ci.shape_key
        and gsa.length_key = ci.length_key and gsa.size = ci.size
       where c.user_id = $1 and (($2::uuid is null and c.is_active = true) or c.id = $2)`,
      [userId, cartId ?? null],
    );

    const lineKey = (row: { product_id: string; shape_key: string; length_key: string; size: string }) =>
      `${row.product_id}:${row.shape_key}:${row.length_key}:${row.size}`;
    const pricedByKey = new Map(
      priceResult.priced.items
        .filter((item) => item.line.product_type !== 'composition' && item.line.product_id)
        .map(({ line }) => [lineKey(line as { product_id: string; shape_key: string; length_key: string; size: string }), line] as const),
    );
    const rowsToReserve = stockRows
      .filter((row) => pricedByKey.has(lineKey(row)))
      .map((row) => {
        const priced = pricedByKey.get(lineKey(row))!;
        const packs = dbPacks(row.accessory_packs);
        const stockUnits = stockUnitsForLine(row.accessory_type, packs, row.pack_key, priced.quantity);
        return { ...row, quantity: priced.quantity, stockUnits };
      });
    const reservablePricedCount = priceResult.priced.items.filter(
      (item) => item.line.product_type !== 'composition',
    ).length;
    if (rowsToReserve.length !== reservablePricedCount) {
      await client.query('rollback');
      return { ok: false, reason: 'size_unavailable' };
    }
    // Filtered rather than tested with .some() so `stockUnits` is narrowed to
    // number for insertReservationItems below; the accept/reject condition is
    // unchanged (any undefined unit count still fails the whole reservation).
    const reservableRows = rowsToReserve.filter(
      (row): row is typeof row & { stockUnits: number } => row.stockUnits !== undefined,
    );
    if (
      reservableRows.length !== rowsToReserve.length ||
      reservableRows.some((row) => row.stockUnits > row.source_quantity - row.allocated_quantity)
    ) {
      await client.query('rollback');
      return { ok: false, reason: 'size_unavailable' };
    }

    const reservationId = randomUUID();
    const expiresAt = new Date(Date.now() + reservationTtlMs);
    await client.query(
      `insert into stock_reservations (id, user_id, state, expires_at)
       values ($1, $2, 'held', $3)`,
      [reservationId, userId, expiresAt],
    );
    if (priceResult.priced.voucher) {
      const paidItems = priceResult.priced.items.filter((item) => item.line.origin !== 'rule');
      const totalQuantity = paidItems.reduce((sum, item) => sum + item.line.quantity, 0);
      const held = await holdVoucher(
        client,
        userId,
        reservationId,
        priceResult.priced.voucher.code,
        {
          subtotal: round2(priceResult.priced.subtotal - priceResult.priced.rulesItemDiscount),
          shippingFee: priceResult.priced.shippingFee,
          totalQuantity,
          itemUnitPrices: paidItems.map((item) => ({
            unitPrice: item.unitPrice,
            quantity: item.line.quantity,
            productType: item.line.product_type,
          })),
        },
        expiresAt,
      );
      if (!held.ok) {
        await client.query('rollback');
        return held;
      }
      priceResult.priced.voucher = held.voucher;
      const preLoyaltyTotal = round2(
        priceResult.priced.subtotal +
          priceResult.priced.shippingFee -
          priceResult.priced.rulesItemDiscount -
          held.voucher.discount,
      );
      const loyaltyRefresh = await priceLoyaltyIfEnabled(client, {
        userId,
        applyLoyalty: applyLoyalty ?? priceResult.priced.loyaltyCredit > 0,
        items: priceResult.priced.items,
        merchandiseSubtotal: priceResult.priced.subtotal,
        rulesItemDiscount: priceResult.priced.rulesItemDiscount,
        voucherItemDiscount: held.voucher.itemDiscount,
        voucherShippingDiscount: held.voucher.shippingDiscount,
        shippingFee: priceResult.priced.shippingFee,
        voucherOfferType: held.voucher.offer.type,
      });
      priceResult.priced.loyaltyCredit = loyaltyRefresh.loyaltyCredit;
      priceResult.priced.loyaltyEarn = loyaltyRefresh.loyaltyEarn;
      priceResult.priced.loyaltyEarnStatus = loyaltyRefresh.earnStatus;
      priceResult.priced.total = round2(preLoyaltyTotal - loyaltyRefresh.loyaltyCredit);
    }
    if (priceResult.priced.loyaltyCredit > 0) {
      try {
        await createLoyaltyHold(client, userId, reservationId, priceResult.priced.loyaltyCredit, expiresAt);
      } catch {
        await client.query('rollback');
        return { ok: false, reason: 'loyalty_insufficient' };
      }
    }
    await insertReservationItems(client, reservationId, reservableRows);
    // Freeze the whole server-derived commercial state *before* a payment
    // method can be confirmed. confirmOrder must never go back to the mutable
    // cart to decide what a successful authorization bought.
    await saveCheckoutReservationSnapshot(
      client,
      reservationId,
      priceResult.priced,
      undefined,
      undefined,
      cartId,
    );

    await client.query('commit');
    return { ok: true, priced: priceResult.priced, reservationId, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Guest-checkout sibling of reserveCart — same lock/allocate/hold pattern,
 * against priceGuestCheckout's ad-hoc items instead of a persisted cart.
 * The reservation row itself has user_id = null: a guest reservation is
 * authorized purely by possessing its own id (an unguessable UUID handed
 * back to the caller the moment it's created), not by a user_id match —
 * see confirmGuestOrder. No prior-hold release step (no stable identity to
 * key it on): an abandoned guest attempt just expires via expires_at like
 * any other hold — same for a voucher hold, keyed by this reservation's own
 * id (see holdVoucherForGuest). */
