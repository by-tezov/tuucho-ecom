import { randomUUID } from 'node:crypto';
import { scheduleStockReservationMaintenance } from './stockReservationMaintenance.js';
import { withDeadlockRetry } from '../../../commerce/application/deadlockRetry.js';
import type pg from 'pg';
import type { AccessoryType } from '../../../catalog/domain/accessoryPacks.js';
import { dbPacks, stockUnitsForLine } from '../../../catalog/domain/accessoryPacks.js';
import { runCheckoutPrepare, runCheckoutReserve } from '../checkoutOpenings.js';
import {
  type GuestAddressInput,
  type GuestLineInput,
  type StockReservationItem,
  priceGuestCheckout,
} from '../pricing/checkoutPricing.js';
import {
  type CheckoutReservationSnapshot,
  insertReservationItems,
  purgeTemporaryCheckoutReservationSnapshots,
  saveCheckoutReservationSnapshot,
} from './checkoutReservationSnapshot.js';
import type { ReserveCartResult } from './reserveAuthenticatedCart.js';

export async function reserveGuestCart(
  pool: pg.Pool,
  items: GuestLineInput[],
  guestEmail: string,
  address: GuestAddressInput,
  courierCode: string,
  express: boolean,
  reservationTtlMs: number,
  voucherCode?: string,
  billingAddress?: GuestAddressInput,
  guestSaved?: CheckoutReservationSnapshot['guestSaved'],
  guestExtra?: unknown,
): Promise<ReserveCartResult> {
  scheduleStockReservationMaintenance(pool);
  return withDeadlockRetry(() =>
    reserveGuestCartOnce(
      pool,
      items,
      guestEmail,
      address,
      courierCode,
      express,
      reservationTtlMs,
      voucherCode,
      billingAddress,
      guestSaved,
      guestExtra,
    ),
  );
}

async function reserveGuestCartOnce(
  pool: pg.Pool,
  items: GuestLineInput[],
  guestEmail: string,
  address: GuestAddressInput,
  courierCode: string,
  express: boolean,
  reservationTtlMs: number,
  voucherCode?: string,
  billingAddress?: GuestAddressInput,
  guestSaved?: CheckoutReservationSnapshot['guestSaved'],
  guestExtra?: unknown,
): Promise<ReserveCartResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await runCheckoutPrepare({
      client,
      voucherCode,
      guest: true,
      guestEmail,
      phase: 'lock',
      pluginRequest: { voucherCode, applyLoyalty: false },
    });
    await purgeTemporaryCheckoutReservationSnapshots(client);

    const priceResult = await priceGuestCheckout(
      client,
      items,
      address,
      courierCode,
      express,
      voucherCode,
      billingAddress,
      guestEmail,
      guestExtra,
    );
    if (!priceResult.ok) {
      await client.query('rollback');
      return priceResult;
    }

    // Lock the source stock rows for every priced line — same pattern as
    // reserveCartOnce, against priceGuestCheckout's ad-hoc items instead of
    // cart_items/carts. Sourced from priced.items (not the raw `items`
    // request) so a resolved gift line is included too — reserveCartOnce
    // gets this for free by querying cart_items after
    // syncGiftLinesForActiveCart has already written the gift row there;
    // priceGuestCheckout has no persisted cart to sync onto, so its gift
    // line only exists in the priced result, and must be reserved from
    // there or it would oversell a limited-stock gift product.
    const reservationLines = priceResult.priced.items
      .map((item) => item.line)
      .filter((line): line is typeof line & { product_id: string } =>
        line.product_id != null,
      );
    await client.query(
      `select gsa.product_id
       from unnest($1::uuid[], $2::text[], $3::text[], $4::text[])
         as gi(product_id, shape_key, length_key, size)
       join product_availability gsa
         on gsa.product_id = gi.product_id and gsa.shape_key = gi.shape_key
        and gsa.length_key = gi.length_key and gsa.size = gi.size
       order by gsa.product_id, gsa.shape_key, gsa.length_key, gsa.size
       for update of gsa`,
      [
        reservationLines.map((line) => line.product_id),
        reservationLines.map((line) => line.shape_key),
        reservationLines.map((line) => line.length_key),
        reservationLines.map((line) => line.size),
      ],
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
      `select gi.product_id, gi.shape_key, gi.length_key, gi.size, gi.pack_key, gi.quantity,
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
       from unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[])
         as gi(product_id, shape_key, length_key, size, pack_key, quantity)
       join products gs on gs.id = gi.product_id
       join product_availability gsa
         on gsa.product_id = gi.product_id and gsa.shape_key = gi.shape_key
        and gsa.length_key = gi.length_key and gsa.size = gi.size`,
      [
        reservationLines.map((line) => line.product_id),
        reservationLines.map((line) => line.shape_key),
        reservationLines.map((line) => line.length_key),
        reservationLines.map((line) => line.size),
        reservationLines.map((line) => line.pack_key),
        reservationLines.map((line) => line.quantity),
      ],
    );

    const lineKey = (row: { product_id: string; shape_key: string; length_key: string; size: string }) =>
      `${row.product_id}:${row.shape_key}:${row.length_key}:${row.size}`;
    const pricedByKey = new Map(priceResult.priced.items
      .filter((item) => Boolean(item.line.product_id))
      .map(({ line }) => [lineKey(line as { product_id: string; shape_key: string; length_key: string; size: string }), line] as const));
    const rowsToReserve = stockRows
      .filter((row) => pricedByKey.has(lineKey(row)))
      .map((row) => {
        const priced = pricedByKey.get(lineKey(row))!;
        const packs = dbPacks(row.accessory_packs);
        const stockUnits = stockUnitsForLine(row.accessory_type, packs, row.pack_key, priced.quantity);
        return { ...row, quantity: priced.quantity, stockUnits };
      });
    const reservablePricedCount = priceResult.priced.items.filter(
      (item) => Boolean(item.line.product_id),
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
       values ($1, null, 'held', $2)`,
      [reservationId, expiresAt],
    );
    const reserved = await runCheckoutReserve(priceResult.priced, {
      client,
      reservationId,
      expiresAt,
      guest: true,
      guestEmail,
    });
    if (!reserved.ok) {
      await client.query('rollback');
      return { ok: false, reason: (reserved.reason ?? 'size_unavailable') as never };
    }
    priceResult.priced = reserved.priced;
    await insertReservationItems(client, reservationId, reservableRows);
    await saveCheckoutReservationSnapshot(client, reservationId, priceResult.priced, guestSaved, guestEmail);

    await client.query('commit');
    return { ok: true, priced: priceResult.priced, reservationId, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** A Stripe intent is created after the short database transaction, then
 * linked to its hold. A released/expired reservation cannot be linked. */
