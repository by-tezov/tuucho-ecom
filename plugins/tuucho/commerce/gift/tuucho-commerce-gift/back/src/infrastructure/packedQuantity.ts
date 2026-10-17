import type pg from 'pg';

/** Highest nail-set count that can be packed. Source is the imported
 * `shipping_packet_measurements` rows from manager `data-packet.json`. */
export async function maxPackedNailQuantity(db: pg.Pool | pg.PoolClient): Promise<number> {
  const { rows } = await db.query<{ max: number | string | null }>(
    'select max(quantity)::int as max from shipping_packet_measurements',
  );
  const value = Number(rows[0]?.max);
  if (!Number.isInteger(value) || value < 1) return 0;
  return value;
}
