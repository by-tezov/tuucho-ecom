import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getAvailableQuantities } from '@kernel/back/modules/catalog/application/availability';
import { dbPacks, parseAccessoryType, stockUnitsForLine } from '@kernel/back/modules/catalog/domain/accessoryPacks';
import type { GiftItemRow } from './giftItemRepo.js';

async function unitsNeededBatch(client: pg.PoolClient, items: GiftItemRow[]): Promise<Map<string, number>> {
  const needed = new Map<string, number>();
  const accessoryIds = [
    ...new Set(items.filter((item) => item.productType === 'accessory').map((item) => item.productId)),
  ];
  const accessoryMeta = new Map<string, { accessory_type: string | null; accessory_packs: unknown }>();
  if (accessoryIds.length > 0) {
    const { rows } = await client.query<{
      id: string;
      accessory_type: string | null;
      accessory_packs: unknown;
    }>(`select id, accessory_type, accessory_packs from products where id = any($1::uuid[])`, [accessoryIds]);
    for (const row of rows) accessoryMeta.set(row.id, row);
  }
  for (const item of items) {
    const key = `${item.productId}|${item.shapeKey}|${item.lengthKey}|${item.size}`;
    if (item.productType !== 'accessory') {
      needed.set(key, (needed.get(key) ?? 0) + item.quantity);
      continue;
    }
    const row = accessoryMeta.get(item.productId);
    if (!row) throw new Error('gift_stock_unavailable');
    const units = stockUnitsForLine(
      parseAccessoryType(row.accessory_type),
      dbPacks(row.accessory_packs),
      item.packKey,
      item.quantity,
    );
    if (units === undefined) throw new Error('gift_stock_unavailable');
    needed.set(key, (needed.get(key) ?? 0) + units);
  }
  return needed;
}

export async function allocateGiftHold(
  client: pg.PoolClient,
  userId: string | null,
  items: GiftItemRow[],
  expiresAt: Date,
): Promise<string> {
  await client.query(
    `select gsa.product_id
     from product_availability gsa
     where (gsa.product_id, gsa.shape_key, gsa.length_key, gsa.size) in (
       select x.product_id, x.shape_key, x.length_key, x.size
       from unnest($1::uuid[], $2::text[], $3::text[], $4::text[]) as x(product_id, shape_key, length_key, size)
     )
     order by gsa.product_id, gsa.shape_key, gsa.length_key, gsa.size
     for update of gsa`,
    [
      items.map((item) => item.productId),
      items.map((item) => item.shapeKey),
      items.map((item) => item.lengthKey),
      items.map((item) => item.size),
    ],
  );
  const available = await getAvailableQuantities(
    client,
    items.map((item) => ({
      productId: item.productId,
      shapeKey: item.shapeKey,
      lengthKey: item.lengthKey,
      size: item.size,
    })),
  );
  const needed = await unitsNeededBatch(client, items);
  for (const [key, units] of needed) {
    if ((available.get(key) ?? 0) < units) {
      throw new Error('gift_stock_unavailable');
    }
  }
  const reservationId = randomUUID();
  await client.query(
    `insert into stock_reservations (id, user_id, state, expires_at, purpose)
     values ($1, $2, 'held', $3, 'gift')`,
    [reservationId, userId, expiresAt],
  );
  // Hold stock units, one row per variant, exactly what was checked above
  // and what the checkout reservation writes (insertReservationItems): a
  // byQuantity pack holds quantity x multiplier, not its pack count, and two
  // gift items on one variant cannot collide on the item key.
  const heldKeys = [...needed.keys()].map((key) => key.split('|'));
  if (heldKeys.length > 0) {
    await client.query(
      `insert into stock_reservation_items (reservation_id, product_id, shape_key, length_key, size, quantity)
       select $1, unnest($2::uuid[]), unnest($3::text[]), unnest($4::text[]), unnest($5::text[]), unnest($6::integer[])`,
      [
        reservationId,
        heldKeys.map((parts) => parts[0]),
        heldKeys.map((parts) => parts[1]),
        heldKeys.map((parts) => parts[2]),
        heldKeys.map((parts) => parts[3]),
        [...needed.values()],
      ],
    );
  }
  return reservationId;
}

export async function releaseGiftHold(
  client: pg.Pool | pg.PoolClient,
  reservationId: string | null,
): Promise<void> {
  if (!reservationId) return;
  await client.query(
    `update stock_reservations set state = 'released', updated_at = now()
     where id = $1 and state = 'held' and purpose = 'gift'`,
    [reservationId],
  );
}

export async function reservationHasPaymentIntent(
  db: pg.Pool | pg.PoolClient,
  reservationId: string | null,
): Promise<boolean> {
  if (!reservationId) return false;
  const { rows } = await db.query<{ stripe_payment_intent_id: string | null }>(
    `select stripe_payment_intent_id from stock_reservations where id = $1`,
    [reservationId],
  );
  return Boolean(rows[0]?.stripe_payment_intent_id);
}
