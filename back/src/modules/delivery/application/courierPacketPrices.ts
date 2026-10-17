import type pg from 'pg';
import { parseCourierPriceValue, readCourierPriceJson, type CourierPriceValue } from '../../commerce/domain/courierPrice.js';
import type { PartialTrilingual } from '../../../types.js';

export interface CourierRatePacket {
  key: string;
  maxQuantity: number;
  price: CourierPriceValue;
}

export interface CourierRateRow {
  code: string;
  name: PartialTrilingual;
  packets: CourierRatePacket[];
}

export async function listCourierPacketPrices(
  pool: pg.Pool,
  codes: string[],
): Promise<CourierRateRow[]> {
  if (codes.length === 0) return [];
  const { rows } = await pool.query<{
    code: string;
    name: PartialTrilingual;
    packet_key: string;
    max_quantity: number;
    price: unknown;
  }>(
    `select c.code, c.name, p.packet_key, p.max_quantity, p.price
       from couriers c
       join courier_packets p on p.courier_id = c.id
      where c.code = any($1::text[])
      order by c.sort_order, p.sort_order`,
    [codes],
  );
  const byCode = new Map<string, CourierRateRow>();
  for (const row of rows) {
    const current = byCode.get(row.code) ?? { code: row.code, name: row.name, packets: [] };
    current.packets.push({
      key: row.packet_key,
      maxQuantity: row.max_quantity,
      price: readCourierPriceJson(row.price),
    });
    byCode.set(row.code, current);
  }
  return codes.map((code) => byCode.get(code)).filter((row): row is CourierRateRow => Boolean(row));
}

export async function setCourierPacketPrice(
  pool: pg.Pool,
  code: string,
  packetKey: string,
  price: CourierPriceValue,
): Promise<boolean> {
  const parsed = parseCourierPriceValue(price);
  if (parsed === undefined) return false;
  const result = await pool.query(
    `update courier_packets as p
        set price = $3::jsonb
       from couriers c
      where p.courier_id = c.id
        and c.code = $1
        and p.packet_key = $2`,
    [code, packetKey, JSON.stringify(parsed)],
  );
  return result.rowCount === 1;
}
