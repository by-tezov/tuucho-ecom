/** Read and update courier display fields and prices. Does not create or
 * delete couriers, countries, networks or packet keys, and does not change
 * enabled flags. */
import type pg from 'pg';
import type { AuthenticatedUser } from '../../../types.js';
import { pool } from '../../../db/pool.js';
import { withTransaction } from '../../../platform/db/transaction.js';
import type {
  CourierCatalogCountry,
  CourierCatalogCourier,
  CourierCatalogDocument,
  CourierCatalogLocaleText,
  CourierCatalogMeasurement,
  CourierCatalogNetwork,
} from '../../../contract/admin/courierCatalog.js';
import { recordAdminActivity } from '../../activity/application/recordAdminActivity.js';
import { activityChangeDetail } from '../../activity/application/changeDetail.js';
import {
  resolveCourierPrice,
  resolveOptionalCourierPrice,
  type CourierPriceValue,
} from '../../commerce/domain/courierPrice.js';
import { listCouriers, listNetworks, type CourierRow } from '../../delivery/application/couriers.js';
import {
  COURIER_LOCALES,
  collapseCountryPrices,
  CourierCatalogError,
  parseCountryLabels,
  parseCourierCatalogWrite,
  parseMeasurementWrite,
  parseNetworkWrite,
  type CourierCatalogWrite,
} from '../domain/courierCatalog.js';

function localeText(raw: unknown): CourierCatalogLocaleText {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as CourierCatalogLocaleText;
  for (const locale of COURIER_LOCALES) {
    const value = source[locale];
    out[locale] = typeof value === 'string' ? value : '';
  }
  return out;
}

function priceAmount(price: CourierPriceValue, country: string): number | null {
  return resolveCourierPrice(price, country);
}

function toCourier(row: CourierRow): CourierCatalogCourier {
  const countries = [...row.countries].sort((a, b) => a.code.localeCompare(b.code));
  return {
    code: row.code,
    sortOrder: row.sortOrder,
    name: localeText(row.name),
    description: localeText(row.description),
    countries: countries.map((country) => {
      const time = row.deliveryTimes[country.code];
      return {
        code: country.code,
        minDays: time?.minDays ?? null,
        maxDays: time?.maxDays ?? null,
        custodyDays: time?.custodyDays ?? null,
      };
    }),
    packets: [...row.packets]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.packetKey.localeCompare(b.packetKey))
      .map((packet) => ({
        key: packet.packetKey,
        sortOrder: packet.sortOrder,
        maxQuantity: packet.maxQuantity,
        prices: countries.map((country) => ({
          country: country.code,
          price: priceAmount(packet.price, country.code),
          expressPrice:
            packet.expressPrice === null
              ? null
              : resolveOptionalCourierPrice(packet.expressPrice, country.code),
        })),
      })),
  };
}

function courierSnapshot(courier: CourierCatalogCourier): Record<string, unknown> {
  return {
    sortOrder: courier.sortOrder,
    name: courier.name,
    description: courier.description,
    countries: Object.fromEntries(
      courier.countries.map((country) => [
        country.code,
        { minDays: country.minDays, maxDays: country.maxDays, custodyDays: country.custodyDays },
      ]),
    ),
    packets: Object.fromEntries(
      courier.packets.map((packet) => [
        packet.key,
        {
          sortOrder: packet.sortOrder,
          maxQuantity: packet.maxQuantity,
          prices: Object.fromEntries(
            packet.prices.map((price) => [price.country, { price: price.price, express: price.expressPrice }]),
          ),
        },
      ]),
    ),
  };
}

function writeSnapshot(write: CourierCatalogWrite): Record<string, unknown> {
  return courierSnapshot({
    code: '',
    sortOrder: write.sortOrder,
    name: write.name,
    description: write.description,
    countries: write.countries,
    packets: write.packets.map((packet) => ({
      key: packet.key,
      sortOrder: packet.sortOrder,
      maxQuantity: packet.maxQuantity,
      prices: packet.prices,
    })),
  });
}

async function loadCountries(): Promise<CourierCatalogCountry[]> {
  const { rows } = await pool.query<{ code: string; label: unknown }>(
    `select code, label from address_countries order by code`,
  );
  return rows.map((row) => ({ code: row.code, label: localeText(row.label) }));
}

async function loadNetworks(): Promise<CourierCatalogNetwork[]> {
  const rows = await listNetworks(pool);
  return rows.map((row) => ({ code: row.code, sortOrder: row.sortOrder, name: localeText(row.name) }));
}

async function loadMeasurements(): Promise<CourierCatalogMeasurement[]> {
  const { rows } = await pool.query<{
    quantity: number;
    weight: number;
    length: number;
    width: number;
    depth: number;
  }>(
    `select quantity, weight, length, width, depth from shipping_packet_measurements order by quantity`,
  );
  return rows;
}

async function loadCourier(code: string): Promise<CourierCatalogCourier> {
  const rows = await listCouriers(pool);
  const found = rows.find((row) => row.code === code);
  if (!found) throw new CourierCatalogError('Courier not found.', 404);
  return toCourier(found);
}

export async function readCourierCatalog(): Promise<CourierCatalogDocument> {
  const [countries, networks, measurements, couriers] = await Promise.all([
    loadCountries(),
    loadNetworks(),
    loadMeasurements(),
    listCouriers(pool).then((rows) =>
      rows
        .map(toCourier)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    ),
  ]);
  return { countries, networks, measurements, couriers };
}

async function journal(
  client: pg.PoolClient,
  user: AuthenticatedUser,
  action: string,
  targetType: string,
  targetId: string,
  summary: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  const { changes, changeSummary, detail } = activityChangeDetail({}, before, after);
  await recordAdminActivity(client, user, {
    category: 'shipping',
    action,
    summary: changes.length === 0 ? `${summary}: aucun changement` : `${summary}: ${changeSummary}`,
    targetType,
    targetId,
    detail,
  });
}

export async function writeCourierCatalogCourier(
  user: AuthenticatedUser,
  code: string,
  body: unknown,
): Promise<void> {
  const current = await loadCourier(code);
  const write = parseCourierCatalogWrite(body, {
    countries: current.countries.map((country) => country.code),
    packets: current.packets.map((packet) => packet.key),
  });
  await withTransaction(pool, async (client) => {
    const updated = await client.query(
      `update couriers
         set name = $2, description = $3, sort_order = $4, updated_at = now()
       where code = $1`,
      [code, write.name, write.description, write.sortOrder],
    );
    if ((updated.rowCount ?? 0) !== 1) throw new CourierCatalogError('Courier not found.', 404);
    const { rows } = await client.query<{ id: string }>(`select id from couriers where code = $1`, [code]);
    const id = rows[0]?.id;
    if (!id) throw new CourierCatalogError('Courier not found.', 404);
    for (const country of write.countries) {
      const result = await client.query(
        `update courier_countries
           set delivery_min_days = $3, delivery_max_days = $4, custody_days = $5
         where courier_id = $1 and country_code = $2`,
        [id, country.code, country.minDays, country.maxDays, country.custodyDays],
      );
      if ((result.rowCount ?? 0) !== 1) throw new CourierCatalogError('Country not found.', 404);
    }
    for (const packet of write.packets) {
      const express = packet.prices.every((price) => price.expressPrice === null)
        ? null
        : collapseCountryPrices(
            packet.prices.map((price) => ({ country: price.country, amount: price.expressPrice! })),
          );
      const result = await client.query(
        `update courier_packets
           set sort_order = $3, max_quantity = $4, price = $5::jsonb, express_price = $6::jsonb
         where courier_id = $1 and packet_key = $2`,
        [
          id,
          packet.key,
          packet.sortOrder,
          packet.maxQuantity,
          JSON.stringify(collapseCountryPrices(packet.prices.map((price) => ({ country: price.country, amount: price.price })))),
          express === null ? null : JSON.stringify(express),
        ],
      );
      if ((result.rowCount ?? 0) !== 1) throw new CourierCatalogError('Packet not found.', 404);
    }
    await journal(
      client,
      user,
      'shipping.courier',
      'courier',
      code,
      `Transporteur ${code}`,
      courierSnapshot(current),
      writeSnapshot(write),
    );
  });
}

export async function writeCourierCatalogCountry(
  user: AuthenticatedUser,
  code: string,
  body: unknown,
): Promise<void> {
  const label = parseCountryLabels(body);
  await withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ label: unknown }>(
      `select label from address_countries where code = $1`,
      [code],
    );
    const current = rows[0];
    if (!current) throw new CourierCatalogError('Country not found.', 404);
    await client.query(`update address_countries set label = $2 where code = $1`, [code, label]);
    await journal(client, user, 'shipping.country', 'address_country', code, `Pays ${code}`, { label: localeText(current.label) }, { label });
  });
}

export async function writeCourierCatalogNetwork(
  user: AuthenticatedUser,
  code: string,
  body: unknown,
): Promise<void> {
  const write = parseNetworkWrite(body);
  await withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ name: unknown; sort_order: number }>(
      `select name, sort_order from delivery_networks where code = $1`,
      [code],
    );
    const current = rows[0];
    if (!current) throw new CourierCatalogError('Network not found.', 404);
    await client.query(`update delivery_networks set name = $2, sort_order = $3 where code = $1`, [
      code,
      write.name,
      write.sortOrder,
    ]);
    await journal(
      client,
      user,
      'shipping.network',
      'delivery_network',
      code,
      `Réseau ${code}`,
      { sortOrder: current.sort_order, name: localeText(current.name) },
      { sortOrder: write.sortOrder, name: write.name },
    );
  });
}

export async function writeCourierCatalogMeasurements(user: AuthenticatedUser, body: unknown): Promise<void> {
  const current = await loadMeasurements();
  const write = parseMeasurementWrite(
    body,
    current.map((row) => row.quantity),
  );
  await withTransaction(pool, async (client) => {
    for (const row of write) {
      const result = await client.query(
        `update shipping_packet_measurements
           set weight = $2, length = $3, width = $4, depth = $5
         where quantity = $1`,
        [row.quantity, row.weight, row.length, row.width, row.depth],
      );
      if ((result.rowCount ?? 0) !== 1) throw new CourierCatalogError('Parcel not found.', 404);
    }
    const before = Object.fromEntries(current.map((row) => [String(row.quantity), row]));
    const after = Object.fromEntries(write.map((row) => [String(row.quantity), row]));
    await journal(client, user, 'shipping.measurements', 'shipping_packet', 'measurements', 'Colis', before, after);
  });
}
