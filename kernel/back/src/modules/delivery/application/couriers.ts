import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { PartialTrilingual } from '../../../types.js';
import {
  courierCountryCatalogBlockReason,
  courierCountryCatalogReady,
} from '../domain/courierCountryCatalog.js';
import {
  courierPricesEqual,
  readCourierPriceJson,
  readOptionalCourierPriceJson,
  type CourierPriceValue,
} from '../../commerce/domain/courierPrice.js';

export type { CourierPriceValue };
export { courierCountryCatalogReady };

export interface CourierPacket {
  packetKey: string;
  sortOrder: number;
  maxQuantity: number;
  price: CourierPriceValue;
  expressPrice: CourierPriceValue | null;
}

/** What one served country is quoted, from courier_countries. `custodyDays`
 * is how long a pickup point holds the parcel before returning it — null on
 * a home delivery, which is handed over rather than stored. */
export interface CourierDeliveryTime {
  minDays: number;
  maxDays: number;
  custodyDays: number | null;
}

export interface CourierCountryEntry {
  code: string;
  enabled: boolean;
}

export interface CourierRow {
  id: string;
  code: string;
  name: PartialTrilingual;
  description: PartialTrilingual;
  enabled: boolean;
  sortOrder: number;
  trackingAvailable: boolean;
  /** All catalogued countries (enabled and disabled). */
  countries: CourierCountryEntry[];
  /** Keyed by country code for every catalogued country that has a range. */
  deliveryTimes: Record<string, CourierDeliveryTime>;
  networks: string[];
  packets: CourierPacket[];
}

/** Country codes currently open for shipping on this courier. Emits `ALL`
 * when every shop shipping country is catalogued and enabled. */
export function enabledCountryCodes(
  courier: Pick<CourierRow, 'countries'>,
  shippingCountryCount?: number,
): string[] {
  const enabled = courier.countries.filter((c) => c.enabled);
  if (enabled.length === 0) return [];
  if (
    shippingCountryCount != null &&
    shippingCountryCount > 0 &&
    courier.countries.length === shippingCountryCount &&
    enabled.length === shippingCountryCount
  ) {
    return ['ALL'];
  }
  return enabled.map((c) => c.code);
}

async function attachDetails(
  client: pg.Pool,
  couriers: {
    id: string;
    code: string;
    name: PartialTrilingual;
    description: PartialTrilingual;
    enabled: boolean;
    sort_order: number;
    tracking_available: boolean;
  }[],
): Promise<CourierRow[]> {
  if (couriers.length === 0) return [];
  const ids = couriers.map((c) => c.id);

  const { rows: countryRows } = await client.query<{
    courier_id: string;
    country_code: string;
    enabled: boolean;
    delivery_min_days: number | null;
    delivery_max_days: number | null;
    custody_days: number | null;
  }>(
    `select courier_id, country_code, enabled, delivery_min_days, delivery_max_days, custody_days
     from courier_countries where courier_id = any($1::uuid[])`,
    [ids],
  );
  const { rows: networkRows } = await client.query<{ courier_id: string; network_code: string }>(
    `select courier_id, network_code from courier_networks where courier_id = any($1::uuid[])`,
    [ids],
  );
  const { rows: packetRows } = await client.query<{
    courier_id: string;
    packet_key: string;
    sort_order: number;
    max_quantity: number;
    price: unknown;
    express_price: unknown;
  }>(
    `select courier_id, packet_key, sort_order, max_quantity, price, express_price
     from courier_packets where courier_id = any($1::uuid[]) order by courier_id, sort_order`,
    [ids],
  );

  const countriesById = new Map<string, CourierCountryEntry[]>();
  const deliveryTimesById = new Map<string, Record<string, CourierDeliveryTime>>();
  for (const row of countryRows) {
    const list = countriesById.get(row.courier_id) ?? [];
    list.push({ code: row.country_code, enabled: row.enabled });
    countriesById.set(row.courier_id, list);
    // The range columns are set together or not at all (see the migration's
    // courier_countries_delivery_range_ck), so one null check covers both.
    if (row.delivery_min_days !== null && row.delivery_max_days !== null) {
      const times = deliveryTimesById.get(row.courier_id) ?? {};
      times[row.country_code] = {
        minDays: row.delivery_min_days,
        maxDays: row.delivery_max_days,
        custodyDays: row.custody_days,
      };
      deliveryTimesById.set(row.courier_id, times);
    }
  }
  const networksById = new Map<string, string[]>();
  for (const row of networkRows) {
    const list = networksById.get(row.courier_id) ?? [];
    list.push(row.network_code);
    networksById.set(row.courier_id, list);
  }
  const packetsById = new Map<string, CourierPacket[]>();
  for (const row of packetRows) {
    const list = packetsById.get(row.courier_id) ?? [];
    list.push({
      packetKey: row.packet_key,
      sortOrder: row.sort_order,
      maxQuantity: row.max_quantity,
      price: readCourierPriceJson(row.price),
      expressPrice: readOptionalCourierPriceJson(row.express_price),
    });
    packetsById.set(row.courier_id, list);
  }

  return couriers.map((courier) => ({
    id: courier.id,
    code: courier.code,
    name: courier.name,
    description: courier.description,
    enabled: courier.enabled,
    sortOrder: courier.sort_order,
    trackingAvailable: courier.tracking_available,
    countries: countriesById.get(courier.id) ?? [],
    deliveryTimes: deliveryTimesById.get(courier.id) ?? {},
    networks: networksById.get(courier.id) ?? [],
    packets: packetsById.get(courier.id) ?? [],
  }));
}

/** Backs the public `GET /account/couriers` — deliberately unfiltered by
 * any address (the front needs the *complete* enabled set to render
 * gray-out states against whichever address/courier the customer has
 * currently picked, see CartPage). */
export async function listEnabled(pool: pg.Pool): Promise<CourierRow[]> {
  const { rows } = await pool.query<{
    id: string;
    code: string;
    name: PartialTrilingual;
    description: PartialTrilingual;
    enabled: boolean;
    sort_order: number;
    tracking_available: boolean;
  }>(
    `select id, code, name, description, enabled, sort_order, tracking_available from couriers where enabled order by sort_order`,
  );
  return attachDetails(pool, rows);
}

/** Union of enabled courier_countries across all shop-enabled couriers —
 * backs account profile phone country options. */
export async function listEnabledShippingCountryCodes(pool: pg.Pool): Promise<string[]> {
  const { rows } = await pool.query<{ country_code: string }>(
    `select distinct cc.country_code
     from courier_countries cc
     join couriers c on c.id = cc.courier_id
     where c.enabled and cc.enabled
     order by cc.country_code`,
  );
  return rows.map((row) => row.country_code);
}

/** Used by confirmOrder for authoritative validation — intentionally not
 * filtered by `enabled` here, the caller decides what "not usable" means
 * (courier_not_found covers both "doesn't exist" and "disabled"). */
export async function findByCode(pool: pg.Pool, code: string): Promise<CourierRow | undefined> {
  const { rows } = await pool.query<{
    id: string;
    code: string;
    name: PartialTrilingual;
    description: PartialTrilingual;
    enabled: boolean;
    sort_order: number;
    tracking_available: boolean;
  }>(
    `select id, code, name, description, enabled, sort_order, tracking_available from couriers where code = $1`,
    [code],
  );
  if (!rows[0]) return undefined;
  return (await attachDetails(pool, rows))[0];
}

/** Batched `tracking_available` lookup by courier code, used when rendering
 * customer-facing order lists — orders denormalize courier_code/courier_name
 * onto their own row (see orders.service.ts's OrderRow) rather than joining
 * couriers at read time, so this mirrors that with a small separate query
 * instead of adding a join. A missing/unknown code (courier since deleted)
 * maps to false. */
export async function trackingAvailableByCode(pool: pg.Pool, codes: string[]): Promise<Map<string, boolean>> {
  const distinct = [...new Set(codes.filter((code): code is string => !!code))];
  if (distinct.length === 0) return new Map();
  const { rows } = await pool.query<{ code: string; tracking_available: boolean }>(
    `select code, tracking_available from couriers where code = any($1::text[])`,
    [distinct],
  );
  return new Map(rows.map((row) => [row.code, row.tracking_available]));
}


export interface DeliveryNetworkRow {
  code: string;
  name: PartialTrilingual;
  sortOrder: number;
}

/** Backs the public `GET /account/delivery-networks` — an open vocabulary,
 * same idea as gallery shapes/colors: authored in catalog source and
 * pushed here via upsertNetworks below. */
export async function listNetworks(pool: pg.Pool): Promise<DeliveryNetworkRow[]> {
  const { rows } = await pool.query<DeliveryNetworkRow>(
    `select code, name, sort_order as "sortOrder" from delivery_networks order by sort_order`,
  );
  return rows;
}

// --- Admin (OPS_TOKEN) / courier-import ---

/** Upserts the delivery-network vocabulary from catalog source's
 * courier/data-networks.json — same "insert or update the label"
 * semantics as libraryImport.service.ts's upsertVocabulary for
 * shapes/colors, and the same shape: an object keyed by code (the code
 * *is* the key), not an array of `{code, name}` records. `sort_order` is
 * this object's own key order (JS preserves string-key insertion order,
 * same assumption data-common.json's shape/color tables already rely on).
 * Safe to re-run. */
async function upsertNetworksWithClient(
  client: pg.PoolClient,
  networks: Record<string, PartialTrilingual>,
): Promise<number> {
  const entries = Object.entries(networks);
  for (const [index, [code, name]] of entries.entries()) {
    await client.query(
      `insert into delivery_networks (code, name, sort_order) values ($1, $2, $3)
       on conflict (code) do update set name = excluded.name, sort_order = excluded.sort_order`,
      [code, name, index],
    );
  }
  return entries.length;
}

/** Upserts the delivery-network vocabulary. When deleteMissing is true,
 * this is a full vocabulary sync: anything absent from the source is
 * removed after all source entries have been upserted. The delivery-network
 * foreign keys deliberately cascade/remove only mutable address links and
 * null the historical order snapshot (see 1738000009000_courier.js). */
export async function syncNetworks(
  pool: pg.Pool,
  networks: Record<string, PartialTrilingual>,
  deleteMissing: boolean,
): Promise<{ networks: number; deletedNetworks: string[] }> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const count = await upsertNetworksWithClient(client, networks);
    const deletedNetworks = deleteMissing
      ? (
          await client.query<{ code: string }>(
            `delete from delivery_networks
             where code <> all($1::text[])
             returning code`,
            [Object.keys(networks)],
          )
        ).rows.map((row) => row.code)
      : [];
    await client.query('commit');
    return { networks: count, deletedNetworks };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Deletes one delivery-network vocabulary entry. Its database foreign keys
 * remove mutable courier/address links and null the optional historical
 * order snapshot (see 1738000009000_courier.js). */
export async function deleteNetwork(pool: pg.Pool, code: string): Promise<boolean> {
  const result = await pool.query(`delete from delivery_networks where code = $1`, [code]);
  return result.rowCount === 1;
}

export async function findCourierIdByCode(pool: pg.Pool, code: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ id: string }>('select id from couriers where code = $1', [code]);
  return rows[0]?.id;
}

export interface CourierPacketInput {
  packetKey: string;
  maxQuantity: number;
  price: CourierPriceValue;
  expressPrice: CourierPriceValue | null;
}

/** The full desired state of a courier as catalog source's courier/*.json
 * describes it — shared shape between creating a brand-new courier and
 * updating an existing one back onto it. `packets` order is significant
 * (ascending capacity, see the migration's courier_packets comment). */
export interface CourierDesiredState {
  name: PartialTrilingual;
  description: PartialTrilingual;
  enabled: boolean;
  sortOrder: number;
  trackingAvailable: boolean;
  countries: CourierCountryEntry[];
  /** Keyed by country code. Must cover every country in `countries`. */
  deliveryTimes: Record<string, CourierDeliveryTime>;
  networks: string[];
  packets: CourierPacketInput[];
}

function stringSetDiffers(a: string[], b: string[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length !== sb.length || sa.some((value, i) => value !== sb[i]);
}

function countriesDiffer(a: CourierCountryEntry[], b: CourierCountryEntry[]): boolean {
  const byCode = (list: CourierCountryEntry[]) =>
    Object.fromEntries(
      [...list].sort((x, y) => x.code.localeCompare(y.code)).map((c) => [c.code, c.enabled]),
    );
  const aa = byCode(a);
  const bb = byCode(b);
  const keys = new Set([...Object.keys(aa), ...Object.keys(bb)]);
  for (const code of keys) {
    if (aa[code] !== bb[code]) return true;
  }
  return false;
}

const TRILINGUAL_LANGS = ['en', 'fr'] as const;

function trilingualDiffers(a: PartialTrilingual, b: PartialTrilingual): boolean {
  return TRILINGUAL_LANGS.some((lang) => (a[lang] ?? '') !== (b[lang] ?? ''));
}

function packetsDiffer(a: CourierPacketInput[], b: CourierPacket[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((packet, i) => {
    const other = b[i];
    if (!other) return true;
    if (packet.packetKey !== other.packetKey || packet.maxQuantity !== other.maxQuantity) return true;
    if (!courierPricesEqual(packet.price, other.price)) return true;
    if (packet.expressPrice === null || other.expressPrice === null) {
      return packet.expressPrice !== other.expressPrice;
    }
    return !courierPricesEqual(packet.expressPrice, other.expressPrice);
  });
}

/** Whether `desired` (catalog source's current courier/<code>.json)
 * differs from what's currently in the DB — used by the courier-import
 * route to decide whether an `update: true` request is actually a no-op. */
/** Only the countries the courier actually serves count — a stale entry for
 * a dropped country is never written, so it must not read as a difference
 * forever either. */
export function deliveryTimesDiffer(
  desiredTimes: Record<string, CourierDeliveryTime>,
  countries: string[],
  current: Record<string, CourierDeliveryTime>,
): boolean {
  const desired = Object.fromEntries(
    countries.filter((code) => desiredTimes[code]).map((code) => [code, desiredTimes[code]!]),
  );
  const codes = new Set([...Object.keys(desired), ...Object.keys(current)]);
  for (const code of codes) {
    const a = desired[code];
    const b = current[code];
    if (!a || !b) return true;
    if (a.minDays !== b.minDays || a.maxDays !== b.maxDays || a.custodyDays !== b.custodyDays) {
      return true;
    }
  }
  return false;
}

export function courierStateDiffers(desired: CourierDesiredState, current: CourierRow): boolean {
  const desiredCodes = desired.countries.map((c) => c.code);
  return (
    trilingualDiffers(desired.name, current.name) ||
    trilingualDiffers(desired.description, current.description) ||
    desired.enabled !== current.enabled ||
    desired.sortOrder !== current.sortOrder ||
    desired.trackingAvailable !== current.trackingAvailable ||
    countriesDiffer(desired.countries, current.countries) ||
    deliveryTimesDiffer(desired.deliveryTimes, desiredCodes, current.deliveryTimes) ||
    stringSetDiffers(desired.networks, current.networks) ||
    packetsDiffer(desired.packets, current.packets)
  );
}

async function replaceCourierDetails(
  client: pg.PoolClient,
  courierId: string,
  desired: CourierDesiredState,
): Promise<void> {
  await client.query(`delete from courier_countries where courier_id = $1`, [courierId]);
  for (const country of desired.countries) {
    const time = desired.deliveryTimes[country.code];
    await client.query(
      `insert into courier_countries
         (courier_id, country_code, enabled, delivery_min_days, delivery_max_days, custody_days)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        courierId,
        country.code,
        country.enabled,
        time?.minDays ?? null,
        time?.maxDays ?? null,
        time?.custodyDays ?? null,
      ],
    );
  }

  await client.query(`delete from courier_networks where courier_id = $1`, [courierId]);
  for (const networkCode of desired.networks) {
    await client.query(`insert into courier_networks (courier_id, network_code) values ($1, $2)`, [
      courierId,
      networkCode,
    ]);
  }

  await client.query(`delete from courier_packets where courier_id = $1`, [courierId]);
  for (const [index, packet] of desired.packets.entries()) {
    await client.query(
      `insert into courier_packets (courier_id, packet_key, sort_order, max_quantity, price, express_price)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
      [
        courierId,
        packet.packetKey,
        index,
        packet.maxQuantity,
        JSON.stringify(packet.price),
        packet.expressPrice === null ? null : JSON.stringify(packet.expressPrice),
      ],
    );
  }
}

export async function createCourier(
  pool: pg.Pool,
  code: string,
  desired: CourierDesiredState,
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const id = randomUUID();
    await client.query(
      `insert into couriers (id, code, name, description, enabled, sort_order, tracking_available) values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        code,
        desired.name,
        desired.description,
        desired.enabled,
        desired.sortOrder,
        desired.trackingAvailable,
      ],
    );
    await replaceCourierDetails(client, id, desired);
    await client.query('commit');
    return id;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Updates an *existing* courier (by id) back onto the desired state — same
 * id preserved throughout (orders.courier_id references it for
 * traceability). Countries/networks/packets have no independent identity
 * worth preserving across an update, so they're fully replaced rather than
 * diffed row by row. */
export async function updateCourier(pool: pg.Pool, id: string, desired: CourierDesiredState): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `update couriers set name = $2, description = $3, enabled = $4, sort_order = $5, tracking_available = $6, updated_at = now() where id = $1`,
      [id, desired.name, desired.description, desired.enabled, desired.sortOrder, desired.trackingAvailable],
    );
    await replaceCourierDetails(client, id, desired);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Backs `GET /operation/courier-import/couriers` (the `courier -- check`
 * command's source of truth) — includes disabled couriers too, unlike
 * listEnabled. */
export async function listCouriers(pool: pg.Pool): Promise<CourierRow[]> {
  const { rows } = await pool.query<{
    id: string;
    code: string;
    name: PartialTrilingual;
    description: PartialTrilingual;
    enabled: boolean;
    sort_order: number;
    tracking_available: boolean;
  }>(
    `select id, code, name, description, enabled, sort_order, tracking_available from couriers order by code`,
  );
  return attachDetails(pool, rows);
}

export async function deleteCourier(pool: pg.Pool, id: string): Promise<void> {
  await pool.query(`delete from couriers where id = $1`, [id]);
}

/** Full reset: every courier (cascading its countries/networks/packets
 * rows) **and** the delivery-network vocabulary — same "wipe everything"
 * shape as libraryImport.service.ts's clearLibraryData. Historical orders
 * are unaffected: courier_id/network_code are `on delete set null`, so a
 * placed order keeps its frozen courier_code/name/network snapshot. */
export async function clearCourierData(pool: pg.Pool): Promise<{ couriers: number; networks: number }> {
  const { rowCount: couriers } = await pool.query('delete from couriers');
  const { rowCount: networks } = await pool.query('delete from delivery_networks');
  return { couriers: couriers ?? 0, networks: networks ?? 0 };
}

export async function setCourierEnabled(pool: pg.Pool, code: string, enabled: boolean): Promise<boolean> {
  const result = await pool.query(`update couriers set enabled = $2, updated_at = now() where code = $1`, [
    code,
    enabled,
  ]);
  return (result.rowCount ?? 0) === 1;
}

/** Reasons a courier-country cannot be enabled (missing catalog data). */
export type CourierCountryEnableBlockReason =
  | 'courier_not_found'
  | 'country_not_catalogued'
  | 'delivery_time_missing'
  | 'custody_time_missing'
  | 'packet_price_missing'
  | 'express_price_incomplete';

async function assertCourierCountryCanEnable(
  pool: pg.Pool,
  courierCode: string,
  countryCode: string,
): Promise<{ ok: true } | { ok: false; reason: CourierCountryEnableBlockReason }> {
  const courier = await findByCode(pool, courierCode);
  if (!courier) return { ok: false, reason: 'courier_not_found' };
  const entry = courier.countries.find((c) => c.code === countryCode);
  if (!entry) return { ok: false, reason: 'country_not_catalogued' };
  const block = courierCountryCatalogBlockReason(courier, countryCode);
  if (block) return { ok: false, reason: block };
  return { ok: true };
}

export async function setCourierCountryEnabled(
  pool: pg.Pool,
  courierCode: string,
  countryCode: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; reason: CourierCountryEnableBlockReason | 'not_found' }> {
  if (enabled) {
    const check = await assertCourierCountryCanEnable(pool, courierCode, countryCode);
    if (!check.ok) return check;
  }
  const courierId = await findCourierIdByCode(pool, courierCode);
  if (!courierId) return { ok: false, reason: 'courier_not_found' };
  const result = await pool.query(
    `update courier_countries set enabled = $3 where courier_id = $1 and country_code = $2`,
    [courierId, countryCode, enabled],
  );
  if ((result.rowCount ?? 0) !== 1) return { ok: false, reason: 'not_found' };
  return { ok: true };
}
