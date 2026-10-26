/** OPS_TOKEN-gated CLI driving this backend's /operation/courier-import/*
 * API to keep the DB in sync with catalog source's courier/<code>.json
 * files — same pattern as scripts/library.ts (HTTP only, never a direct
 * DB/filesystem connection, since preprod/prod have no SSH on this LWS
 * plan).
 *
 * Usage:
 *   npm run courier -- seed [<code>] [--update] [--delete] [--direction local|remote] [--confirm] [--json] --dev|--preprod|--prod [--source <path>]
 *   npm run courier -- delete <code> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run courier -- delete-network <code> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run courier -- delete-all [--confirm] [--json] --dev|--preprod|--prod
 *   npm run courier -- check [--json] --dev|--preprod|--prod [--source <path>]
 *
 *   --confirm       required on seed (unless --direction local, which only
 *                    reads the target DB)/delete/delete-network/delete-all,
 *                    only when targeting --prod — never for --dev/--preprod.
 *                    `check` is read-only and never needs it.
 *   --json          (all commands) prints one JSON object to stdout instead
 *                    of the human-readable lines, moving every other line to
 *                    stderr — safe to pipe into `jq`, a file, or another
 *                    script.
 *
 *   <code>          a courier's natural key (the "code" field inside its
 *                    JSON file, not the filename) — matches product-uid's role
 *                    in scripts/library.ts.
 *   --update        (seed only) an existing code is normally a no-op;
 *                    with this flag, a difference from the local file
 *                    updates the courier in place (same id — orders.
 *                    courier_id references it for traceability).
 *   --delete        (seed only, requires --update and no <code>) makes
 *                    the destination match the complete source. With
 *                    `--direction remote`, DB-only couriers/networks are
 *                    deleted; with `--direction local`, manager-only
 *                    courier files/network entries are deleted. A country
 *                    dropped from data-countries.json is closed
 *                    (`enabled = false`), never deleted — orders reference
 *                    it.
 *   --direction     `remote` (default) pushes manager courier files to the
 *                    DB. `local` pulls DB couriers into manager JSON files
 *                    (creating `<code>.json` when absent) and the DB
 *                    vocabulary into data-networks.json; differences are
 *                    only written with --update.
 *   --dev|--preprod|--prod  required, no default.
 *   --source        defaults to catalog import tree/courier relative to
 *                    this repo (sibling-repo assumption).
 *
 * `seed` with no <code>: every courier *.json file in --source (excluding
 * the shared data-*.json files), each checked against what's already there
 * (safe to re-run). A `seed` always pushes the shared vocabularies first,
 * same as `library.ts` pushes shapes/colors before sets: the shipping
 * countries (courier/data-countries.json) before anything else, since
 * courier_countries has a foreign key onto them, then the delivery-network
 * vocabulary (courier/data-networks.json). `check`: read-only, and also
 * reports country/network drift. `delete-all`: wipes every courier **and**
 * the delivery-network vocabulary (countries are left alone — orders
 * reference them) — requires `--confirm`, same safety bar as `library --
 * delete-all` / `order -- delete-all`.
 */
import { Command as Program, Option } from 'commander';
import { existsSync, writeFileSync } from 'node:fs';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { loadApiBaseUrl, loadOpsToken } from './envFile.js';
import type { Mode } from './envFile.js';
import { log, logTable, printJson } from './cliOutput.js';
import {
  compactBooleanMap,
  compactValueMap,
  expandCountries,
  expandCustodyTime,
  expandDeliveryTime,
  expandPriceOverCountries,
} from '../src/modules/operations/application/courierFieldExpand.js';
import { courierPricesEqual, type CourierPriceValue } from '../src/modules/commerce/domain/courierPrice.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');
const COURIER_FILENAME_CODE_RE = /^[a-z0-9][a-z0-9_-]*$/i;

type Command = 'seed' | 'delete' | 'delete-network' | 'delete-all' | 'check';
type Direction = 'local' | 'remote';

interface Args {
  command: Command;
  target: string | undefined;
  update: boolean;
  deleteMissing: boolean;
  direction: Direction;
  mode: string;
  source: string | undefined;
  confirm: boolean;
  json: boolean;
}

const program = new Program();
program
  .name('courier')
  .description(
    'OPS_TOKEN-gated CLI driving /operation/courier-import/* to keep the DB in sync with courier/<code>.json files.',
  );
const fail: (message: string) => never = makeFail(program, 'courier');

async function apiFetch(
  apiBaseUrl: string,
  opsToken: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { ...opsRequestHeaders(opsToken), ...init?.headers },
  });
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : res.statusText;
    throw new Error(`${path} -> ${res.status} ${message}`);
  }
  return body;
}

function apiJson(apiBaseUrl: string, opsToken: string, path: string, payload: unknown): Promise<unknown> {
  return apiFetch(apiBaseUrl, opsToken, path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

interface RawPartial {
  fr?: string;
  en?: string;
  th?: string;
  es?: string;
  it?: string;
  nl?: string;
  pt?: string;
}

const TRILINGUAL_LANGS = ['en', 'fr'] as const;

/** The shared vocabulary/measurement files in the courier folder — every
 * other *.json there is one courier, keyed by the `code` inside it. */
const DATA_FILES = new Set(['data-networks.json', 'data-packet.json', 'data-countries.json']);

function trilingualDiffers(a: RawPartial, b: RawPartial): boolean {
  return TRILINGUAL_LANGS.some((lang) => (a[lang] ?? '') !== (b[lang] ?? ''));
}

/** courier/data-networks.json — the delivery-network vocabulary, same
 * shape as library/data-common.json's shape/color tables: an object keyed
 * by code (the code *is* the key, not a separate field), each value the
 * trilingual label. Display order is this object's own key order (JS
 * preserves string-key insertion order, same assumption data-common.json
 * already relies on). Pure local read, no API call, so `check` can
 * validate $-references without writing anything. */
async function loadNetworkVocab(sourceDir: string): Promise<Record<string, RawPartial>> {
  const path = join(sourceDir, 'data-networks.json');
  if (!existsSync(path)) return {};
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, RawPartial>;
}

interface CountryVocabEntry {
  label: RawPartial;
  enabled: boolean;
}

/** courier/data-countries.json — the shipping-country vocabulary, same
 * object-keyed-by-code shape and same "key order is sort_order" convention
 * as data-networks.json, except the value carries `enabled` alongside the
 * label. `enabled` is what puts a country in the home-address country
 * select; a country left `false` is still storable (a parcel-shop address
 * brings its own country), it just cannot be typed by hand.
 *
 * It lives beside the couriers because a courier's `countries` list can only
 * name a country this file has declared. Absent file = empty vocabulary, so
 * `seed` leaves the table alone rather than closing every country. */
async function loadCountryVocab(sourceDir: string): Promise<Record<string, CountryVocabEntry>> {
  const path = join(sourceDir, 'data-countries.json');
  if (!existsSync(path)) return {};
  const raw = JSON.parse(await readFile(path, 'utf8')) as Record<
    string,
    { label: RawPartial; enabled?: boolean }
  >;
  return Object.fromEntries(
    Object.entries(raw).map(([code, entry]) => [
      code,
      { label: entry.label, enabled: entry.enabled !== false },
    ]),
  );
}

async function pushCountries(
  apiBaseUrl: string,
  opsToken: string,
  countries: Record<string, CountryVocabEntry>,
  disableMissing = false,
  json = false,
): Promise<{ pushed: number; disabledCountries: string[] }> {
  if (Object.keys(countries).length === 0) return { pushed: 0, disabledCountries: [] };
  const result = (await apiJson(apiBaseUrl, opsToken, '/operation/courier-import/countries', {
    countries,
    disableMissing,
  })) as { countries: number; disabledCountries: string[] };
  log(json, `[courier] countries: ${result.countries} pushed.`);
  for (const code of result.disabledCountries) log(json, `[courier] closed country ${code}.`);
  return { pushed: result.countries, disabledCountries: result.disabledCountries };
}

async function pushPacketMeasurements(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
): Promise<void> {
  const measurements = JSON.parse(await readFile(join(sourceDir, 'data-packet.json'), 'utf8')) as unknown;
  await apiJson(apiBaseUrl, opsToken, '/operation/courier-import/packet-measurements', { measurements });
}

async function pushNetworks(
  apiBaseUrl: string,
  opsToken: string,
  networks: Record<string, RawPartial>,
  deleteMissing = false,
  json = false,
): Promise<{ pushed: number; deletedNetworks: string[] }> {
  const result = (await apiJson(apiBaseUrl, opsToken, '/operation/courier-import/networks', {
    networks,
    deleteMissing,
  })) as {
    networks: number;
    deletedNetworks: string[];
  };
  log(json, `[courier] networks: ${result.networks} pushed.`);
  for (const code of result.deletedNetworks) log(json, `[courier] deleted stale network ${code}.`);
  return { pushed: result.networks, deletedNetworks: result.deletedNetworks };
}

interface DesiredPacket {
  key: string;
  maxQuantity: number;
  price: CourierPriceValue;
  expressPrice?: CourierPriceValue;
}

interface DeliveryTime {
  minDays: number;
  maxDays: number;
  custodyDays: number | null;
}

/** Per-courier served country with an enable flag — manager JSON uses a
 * boolean map (+ optional default); GET returns `{code,enabled}[]`. */
type CourierCountriesMap = Record<string, { enabled: boolean }>;

interface DesiredCourier {
  sourcePath: string;
  code: string;
  name: RawPartial;
  description?: RawPartial;
  enabled?: boolean;
  sortOrder?: number;
  trackingAvailable?: boolean;
  countries: CourierCountriesMap;
  /** Merged wire shape, keyed by country code — the source file authors the
   * two halves separately (see CourierFile). */
  deliveryTimes: Record<string, DeliveryTime>;
  networks: string[];
  packets: DesiredPacket[];
}

/** courier/<code>.json as authored. `countries` is a boolean map with
 * optional `default`, legacy `{ enabled }` objects, or a string array.
 * `deliveryTime` / `custodyTime` / packet prices accept scalar, country map,
 * or `{ default, …overrides }`. */
interface CourierFile {
  code: string;
  name: RawPartial;
  description?: RawPartial;
  enabled?: boolean;
  sortOrder?: number;
  trackingAvailable?: boolean;
  countries: unknown;
  deliveryTime?: unknown;
  custodyTime?: unknown;
  networks: string[];
  packets: DesiredPacket[];
}

/** Reads+validates every courier/<file>.json in sourceDir (except
 * data-*.json). Countries, delivery/custody times, and packet prices
 * hard-fail (throw) so incomplete files abort seed/check. */
async function loadLocalCouriers(
  sourceDir: string,
  networkVocab: Map<string, RawPartial>,
  countryVocabCodes: string[],
): Promise<DesiredCourier[]> {
  const files = (await readdir(sourceDir)).filter((name) => name.endsWith('.json') && !DATA_FILES.has(name));
  const couriers: DesiredCourier[] = [];
  const vocabSet = new Set(countryVocabCodes);

  for (const file of files) {
    const raw = JSON.parse(await readFile(join(sourceDir, file), 'utf8')) as Partial<CourierFile> &
      Record<string, unknown>;
    if (!raw.code || !raw.name?.fr) {
      console.warn(`[courier] ${file}: missing code/name.fr — skipped.`);
      continue;
    }
    const enabledByCountry = expandCountries(
      raw.countries,
      countryVocabCodes,
      `[courier] ${file}: countries`,
    );
    const countries: CourierCountriesMap = Object.fromEntries(
      Object.entries(enabledByCountry).map(([code, enabled]) => [code, { enabled }]),
    );
    const countryCodes = Object.keys(countries);
    if (!Array.isArray(raw.networks) || raw.networks.length === 0) {
      console.warn(`[courier] ${file}: missing networks — skipped.`);
      continue;
    }
    const networkRefs = raw.networks.map((ref) => ref.replace(/^\$/, ''));
    const networks = networkRefs.filter((code) => {
      const known = networkVocab.has(code);
      if (!known) console.warn(`[courier] ${file}: unknown network reference "$${code}" — dropped.`);
      return known;
    });
    if (networks.length === 0) {
      console.warn(`[courier] ${file}: no usable network after resolving references — skipped.`);
      continue;
    }
    if (!Array.isArray(raw.packets) || raw.packets.length === 0) {
      console.warn(`[courier] ${file}: no packets — skipped.`);
      continue;
    }
    const maxQuantities = raw.packets.map((p) => p.maxQuantity);
    const increasing = maxQuantities.every((value, i) => i === 0 || value > maxQuantities[i - 1]!);
    if (!increasing) {
      console.warn(`[courier] ${file}: packets[].maxQuantity must be strictly increasing — skipped.`);
      continue;
    }

    if (raw.deliveryTime === undefined) {
      throw new Error(`[courier] ${file}: deliveryTime is required.`);
    }
    const deliveryRanges = expandDeliveryTime(
      raw.deliveryTime,
      countryCodes,
      `[courier] ${file}: deliveryTime`,
      vocabSet,
    );
    const hasCustodyTimeKey = Object.prototype.hasOwnProperty.call(raw, 'custodyTime');
    const custodyByCountry = hasCustodyTimeKey
      ? expandCustodyTime(raw.custodyTime, countryCodes, `[courier] ${file}: custodyTime`, vocabSet)
      : {};
    const deliveryTimes: Record<string, DeliveryTime> = {};
    for (const code of countryCodes) {
      const range = deliveryRanges[code]!;
      deliveryTimes[code] = {
        minDays: range.min,
        maxDays: range.max,
        custodyDays: hasCustodyTimeKey ? (custodyByCountry[code] ?? null) : null,
      };
    }

    const packets: DesiredPacket[] = raw.packets.map((packet, index) => {
      const label = `packets[${index}]`;
      if (typeof packet.key !== 'string' || packet.key.length === 0) {
        throw new Error(`[courier] ${file}: ${label}.key is required.`);
      }
      if (typeof packet.maxQuantity !== 'number' || !(packet.maxQuantity > 0)) {
        throw new Error(`[courier] ${file}: ${label}.maxQuantity must be a positive number.`);
      }
      const price = expandPriceOverCountries(
        packet.price,
        countryCodes,
        `[courier] ${file}: ${label}.price`,
        vocabSet,
      );
      const expressRaw = (packet as DesiredPacket & { expressPrice?: unknown }).expressPrice;
      const expressPrice =
        expressRaw === undefined || expressRaw === null
          ? undefined
          : expandPriceOverCountries(
              expressRaw,
              countryCodes,
              `[courier] ${file}: ${label}.expressPrice`,
              vocabSet,
            );
      return {
        key: packet.key,
        maxQuantity: packet.maxQuantity,
        price,
        ...(expressPrice === undefined ? {} : { expressPrice }),
      };
    });
    couriers.push({
      sourcePath: join(sourceDir, file),
      code: raw.code,
      name: raw.name,
      description: raw.description,
      enabled: raw.enabled ?? true,
      sortOrder: raw.sortOrder ?? 0,
      trackingAvailable: raw.trackingAvailable ?? false,
      countries,
      deliveryTimes,
      networks,
      packets,
    });
  }

  return couriers;
}

interface CreateSummary {
  created: number;
  updated: number;
  unchanged: number;
  networks: { pushed: number; deletedNetworks: string[] };
  countries: { pushed: number; disabledCountries: string[] };
  deleteSync?: { deletedCouriers: number };
}

async function runCreate(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
  target: string | undefined,
  update: boolean,
  deleteMissing: boolean,
  json: boolean,
): Promise<CreateSummary> {
  // Countries go first: courier_countries has a foreign key onto them, so a
  // courier naming a country this push has not created yet would be rejected.
  const countryVocab = await loadCountryVocab(sourceDir);
  const countries = await pushCountries(apiBaseUrl, opsToken, countryVocab, false, json);
  const networkVocab = await loadNetworkVocab(sourceDir);
  const networks = await pushNetworks(apiBaseUrl, opsToken, networkVocab, false, json);
  await pushPacketMeasurements(sourceDir, apiBaseUrl, opsToken);
  const vocabMap = new Map(Object.entries(networkVocab));

  const allCouriers = await loadLocalCouriers(sourceDir, vocabMap, Object.keys(countryVocab));
  const couriers = target === undefined ? allCouriers : allCouriers.filter((c) => c.code === target);
  if (target !== undefined && couriers.length === 0) {
    fail(`No courier with code "${target}" found under ${sourceDir}.`);
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const rows: { code: string; id: string; result: string }[] = [];

  type ImportResponse = { created: boolean; updated: boolean; id: string };
  const batch =
    couriers.length === 0
      ? { results: [] as ImportResponse[] }
      : ((await apiJson(apiBaseUrl, opsToken, '/operation/courier-import/couriers/batch', {
          couriers: couriers.map((courier) => {
            const { sourcePath: _sourcePath, ...desired } = courier;
            return {
              ...desired,
              // The JSON's own "key" field becomes "packetKey" over the wire.
              packets: courier.packets.map((p) => ({
                packetKey: p.key,
                maxQuantity: p.maxQuantity,
                price: p.price,
                expressPrice: p.expressPrice ?? null,
              })),
              update,
            };
          }),
        })) as { results: ImportResponse[] });

  for (const [index, courier] of couriers.entries()) {
    const response = batch.results[index];
    if (!response) throw new Error(`Batch response is missing result ${index} (${courier.code}).`);

    if (response.created) {
      created++;
      rows.push({ code: courier.code, id: response.id, result: 'created' });
    } else if (response.updated) {
      updated++;
      rows.push({ code: courier.code, id: response.id, result: 'updated' });
    } else {
      unchanged++;
      rows.push({ code: courier.code, id: response.id, result: 'unchanged' });
    }
  }

  log(json, `[courier] seed done: ${created} created, ${updated} updated, ${unchanged} unchanged.`);
  logTable(json, rows);

  let deleteSync: CreateSummary['deleteSync'];
  if (deleteMissing) {
    const deletedCouriers = await deleteMissingCouriers(sourceDir, apiBaseUrl, opsToken, json);
    await pushNetworks(apiBaseUrl, opsToken, networkVocab, true, json);
    // Closes, never deletes — see syncCountries in addresses.service.ts.
    await pushCountries(apiBaseUrl, opsToken, countryVocab, true, json);
    deleteSync = { deletedCouriers };
  }

  return { created, updated, unchanged, networks, countries, deleteSync };
}

async function runDelete(
  apiBaseUrl: string,
  opsToken: string,
  code: string,
  json: boolean,
): Promise<{ deleted: true; code: string }> {
  await apiFetch(apiBaseUrl, opsToken, `/operation/courier-import/couriers/${code}`, { method: 'DELETE' });
  log(json, `[courier] deleted code ${code}.`);
  return { deleted: true, code };
}

async function runDeleteAll(
  apiBaseUrl: string,
  opsToken: string,
  json: boolean,
): Promise<{ couriers: number; networks: number }> {
  const result = (await apiJson(apiBaseUrl, opsToken, '/operation/courier-import/clear', {})) as {
    couriers: number;
    networks: number;
  };
  log(json, `[courier] delete-all: deleted ${result.couriers} courier(s), ${result.networks} network(s).`);
  return result;
}

async function runDeleteNetwork(
  apiBaseUrl: string,
  opsToken: string,
  code: string,
  json: boolean,
): Promise<{ deleted: true; code: string }> {
  await apiFetch(apiBaseUrl, opsToken, `/operation/courier-import/networks/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  });
  log(json, `[courier] deleted network ${code}.`);
  return { deleted: true, code };
}

interface DbCourier {
  code: string;
  id: string;
  name: RawPartial;
  description: RawPartial;
  enabled: boolean;
  sortOrder: number;
  trackingAvailable: boolean;
  countries: { code: string; enabled: boolean }[];
  deliveryTimes: Record<string, DeliveryTime>;
  networks: string[];
  packets: {
    packetKey: string;
    maxQuantity: number;
    price: CourierPriceValue;
    expressPrice: CourierPriceValue | null;
  }[];
}

/** Codes that still have a source file are protected from --delete even if
 * their file has validation errors; an invalid source must never be treated
 * as permission to delete an existing courier. */
async function loadSourceCourierCodes(sourceDir: string): Promise<Set<string>> {
  return new Set((await loadSourceCourierFiles(sourceDir)).map((courier) => courier.code));
}

/** A raw source-file inventory for delete synchronization. A file with a
 * usable code remains protected even if its other fields are invalid. */
async function loadSourceCourierFiles(sourceDir: string): Promise<{ code: string; path: string }[]> {
  const files = (await readdir(sourceDir)).filter((name) => name.endsWith('.json') && !DATA_FILES.has(name));
  const couriers: { code: string; path: string }[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(join(sourceDir, file), 'utf8')) as { code?: unknown };
    if (typeof raw.code === 'string' && raw.code.length > 0)
      couriers.push({ code: raw.code, path: join(sourceDir, file) });
  }
  return couriers;
}

async function deleteMissingCouriers(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
  json: boolean,
): Promise<number> {
  const sourceCodes = await loadSourceCourierCodes(sourceDir);
  const { couriers } = (await apiFetch(apiBaseUrl, opsToken, '/operation/courier-import/couriers')) as {
    couriers: DbCourier[];
  };
  const missing = couriers.filter((courier) => !sourceCodes.has(courier.code));
  for (const courier of missing) {
    await runDelete(apiBaseUrl, opsToken, courier.code, json);
  }
  log(
    json,
    `[courier] delete sync: ${missing.length} DB-only courier${missing.length === 1 ? '' : 's'} deleted.`,
  );
  return missing.length;
}

async function deleteMissingLocalCouriers(
  sourceDir: string,
  dbByCode: Map<string, DbCourier>,
  json: boolean,
): Promise<number> {
  const sourceCouriers = await loadSourceCourierFiles(sourceDir);
  const missing = sourceCouriers.filter((courier) => !dbByCode.has(courier.code));
  for (const courier of missing) {
    await unlink(courier.path);
    log(json, `[courier] deleted local courier file for ${courier.code}.`);
  }
  log(
    json,
    `[courier] local delete sync: ${missing.length} manager-only courier file${missing.length === 1 ? '' : 's'} deleted.`,
  );
  return missing.length;
}

function stringSetDiffers(a: string[], b: string[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length !== sb.length || sa.some((value, i) => value !== sb[i]);
}

function countriesDiffer(local: CourierCountriesMap, db: DbCourier['countries']): boolean {
  const dbMap = Object.fromEntries(db.map((entry) => [entry.code, entry.enabled]));
  const localCodes = Object.keys(local);
  const dbCodes = Object.keys(dbMap);
  if (stringSetDiffers(localCodes, dbCodes)) return true;
  return localCodes.some((code) => local[code]!.enabled !== dbMap[code]);
}

function packetsDiffer(a: DesiredPacket[], b: DbCourier['packets']): boolean {
  if (a.length !== b.length) return true;
  return a.some((packet, i) => {
    const other = b[i];
    if (!other) return true;
    if (packet.key !== other.packetKey || packet.maxQuantity !== other.maxQuantity) return true;
    if (!courierPricesEqual(packet.price, other.price)) return true;
    const localExpress = packet.expressPrice ?? null;
    if (localExpress === null || other.expressPrice === null) {
      return localExpress !== other.expressPrice;
    }
    return !courierPricesEqual(localExpress, other.expressPrice);
  });
}

function deliveryTimesDiffer(
  a: Record<string, DeliveryTime>,
  b: Record<string, DeliveryTime> | undefined,
): boolean {
  const remote = b ?? {};
  const codes = new Set([...Object.keys(a), ...Object.keys(remote)]);
  for (const code of codes) {
    const local = a[code];
    const db = remote[code];
    if (!local || !db) return true;
    if (
      local.minDays !== db.minDays ||
      local.maxDays !== db.maxDays ||
      local.custodyDays !== db.custodyDays
    ) {
      return true;
    }
  }
  return false;
}

function courierDifferences(local: DesiredCourier, db: DbCourier): string[] {
  const differences: string[] = [];
  if (trilingualDiffers(local.name, db.name)) differences.push('name');
  if (trilingualDiffers(local.description ?? {}, db.description)) differences.push('description');
  if ((local.enabled ?? true) !== db.enabled) differences.push('enabled');
  if ((local.sortOrder ?? 0) !== db.sortOrder) differences.push('sortOrder');
  if ((local.trackingAvailable ?? false) !== db.trackingAvailable) differences.push('trackingAvailable');
  if (countriesDiffer(local.countries, db.countries)) differences.push('countries');
  if (deliveryTimesDiffer(local.deliveryTimes, db.deliveryTimes)) differences.push('deliveryTime');
  if (stringSetDiffers(local.networks, db.networks)) differences.push('networks');
  if (packetsDiffer(local.packets, db.packets)) differences.push('packets');
  return differences;
}

/** Splits the wire's merged map back into the file's own two objects, and
 * omits either when the DB has nothing to write — a home-delivery courier
 * shouldn't gain an empty `custodyTime: {}` just by being pulled.
 * Writes compact boolean countries (+ optional default) and compact times. */
function courierFileFromDb(
  courier: DbCourier,
  vocabCodes: string[] = courier.countries.map((c) => c.code),
): Record<string, unknown> {
  const deliveryExpanded: Record<string, { min: number; max: number }> = {};
  const custodyExpanded: Record<string, number> = {};
  for (const [country, time] of Object.entries(courier.deliveryTimes ?? {})) {
    deliveryExpanded[country] = { min: time.minDays, max: time.maxDays };
    if (time.custodyDays !== null) custodyExpanded[country] = time.custodyDays;
  }
  const enabledMap = Object.fromEntries(courier.countries.map((entry) => [entry.code, entry.enabled]));
  const countries = compactBooleanMap(enabledMap, vocabCodes);
  const deliveryTime =
    Object.keys(deliveryExpanded).length > 0
      ? compactValueMap(deliveryExpanded, (a, b) => a.min === b.min && a.max === b.max)
      : undefined;
  const custodyTime =
    Object.keys(custodyExpanded).length > 0 ? compactValueMap(custodyExpanded, (a, b) => a === b) : undefined;
  return {
    code: courier.code,
    name: courier.name,
    ...(Object.keys(courier.description).length > 0 ? { description: courier.description } : {}),
    enabled: courier.enabled,
    sortOrder: courier.sortOrder,
    trackingAvailable: courier.trackingAvailable,
    countries,
    ...(deliveryTime !== undefined ? { deliveryTime } : {}),
    ...(custodyTime !== undefined ? { custodyTime } : {}),
    networks: courier.networks.map((code) => `$${code}`),
    packets: courier.packets.map((packet) => ({
      key: packet.packetKey,
      maxQuantity: packet.maxQuantity,
      price: packet.price,
      ...(packet.expressPrice === null ? {} : { expressPrice: packet.expressPrice }),
    })),
  };
}

function vocabDiffers(
  local: Record<string, RawPartial>,
  remote: { code: string; name: RawPartial; sortOrder: number }[],
): boolean {
  const entries = Object.entries(local);
  return (
    entries.length !== remote.length ||
    entries.some(([code, name], index) => {
      const db = remote[index];
      return !db || db.code !== code || db.sortOrder !== index || trilingualDiffers(name, db.name);
    })
  );
}

function networkVocabFromDb(
  networks: { code: string; name: RawPartial; sortOrder: number }[],
): Record<string, RawPartial> {
  return Object.fromEntries(
    [...networks].sort((a, b) => a.sortOrder - b.sortOrder).map((network) => [network.code, network.name]),
  );
}

/** `--direction local`: pulls DB state into manager courier files. Courier
 * code is its natural filename, so a DB-only courier can safely be restored
 * as `<code>.json` (unlike a library set, whose numeric folder id is
 * manager-owned). */
interface PullSummary {
  created: number;
  pulled: number;
  pending: number;
  unchanged: number;
  notInDb: number;
  localDeleteSync?: { deletedLocalCouriers: number };
  networksDiffer: boolean;
  networksPulled: boolean;
}

async function runPullFromRemote(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
  target: string | undefined,
  update: boolean,
  deleteMissing: boolean,
  json: boolean,
): Promise<PullSummary> {
  const localVocab = await loadNetworkVocab(sourceDir);
  const countryVocab = await loadCountryVocab(sourceDir);
  const allCouriers = await loadLocalCouriers(
    sourceDir,
    new Map(Object.entries(localVocab)),
    Object.keys(countryVocab),
  );
  const couriers =
    target === undefined ? allCouriers : allCouriers.filter((courier) => courier.code === target);

  const { couriers: dbCouriers } = (await apiFetch(
    apiBaseUrl,
    opsToken,
    '/operation/courier-import/couriers',
  )) as {
    couriers: DbCourier[];
  };
  const dbByCode = new Map(dbCouriers.map((courier) => [courier.code, courier]));
  if (target !== undefined && couriers.length === 0 && !dbByCode.has(target)) {
    fail(`No courier with code "${target}" found locally or in the DB.`);
  }
  const { networks: dbNetworks } = (await apiFetch(
    apiBaseUrl,
    opsToken,
    '/operation/courier-import/networks',
  )) as {
    networks: { code: string; name: RawPartial; sortOrder: number }[];
  };

  let localDeleteSync: PullSummary['localDeleteSync'];
  if (deleteMissing) {
    const deletedLocalCouriers = await deleteMissingLocalCouriers(sourceDir, dbByCode, json);
    localDeleteSync = { deletedLocalCouriers };
  }

  let pulled = 0;
  let pending = 0;
  let unchanged = 0;
  let notInDb = 0;
  let created = 0;
  const rows: { code: string; result: string; differences: string }[] = [];
  for (const courier of couriers) {
    const dbCourier = dbByCode.get(courier.code);
    if (!dbCourier) {
      console.warn(`[courier] ${courier.code}: not found in the DB — nothing to pull, skipped.`);
      notInDb++;
      continue;
    }
    const differences = courierDifferences(courier, dbCourier);
    if (differences.length === 0) {
      unchanged++;
      rows.push({ code: courier.code, result: 'unchanged', differences: '' });
      continue;
    }
    if (!update) {
      pending++;
      rows.push({
        code: courier.code,
        result: 'differs (rerun with --update)',
        differences: differences.join(', '),
      });
      continue;
    }
    writeFileSync(
      courier.sourcePath,
      `${JSON.stringify(courierFileFromDb(dbCourier, Object.keys(countryVocab)), null, 2)}\n`,
    );
    pulled++;
    rows.push({ code: courier.code, result: 'pulled', differences: differences.join(', ') });
  }

  const sourceCodes = new Set((await loadSourceCourierFiles(sourceDir)).map((courier) => courier.code));
  const dbOnly = dbCouriers.filter(
    (courier) => !sourceCodes.has(courier.code) && (target === undefined || courier.code === target),
  );
  for (const courier of dbOnly) {
    if (!COURIER_FILENAME_CODE_RE.test(courier.code)) {
      console.warn(`[courier] ${courier.code}: cannot safely derive a local filename — skipped.`);
      continue;
    }
    if (!update) {
      pending++;
      rows.push({
        code: courier.code,
        result: 'DB-only (rerun with --update to create locally)',
        differences: '',
      });
      continue;
    }
    writeFileSync(
      join(sourceDir, `${courier.code}.json`),
      `${JSON.stringify(courierFileFromDb(courier, Object.keys(countryVocab)), null, 2)}\n`,
    );
    created++;
    rows.push({ code: courier.code, result: 'created locally from DB', differences: '' });
  }

  const networksDiffer = vocabDiffers(localVocab, dbNetworks);
  let networksPulled = false;
  if (networksDiffer && update) {
    writeFileSync(
      join(sourceDir, 'data-networks.json'),
      `${JSON.stringify(networkVocabFromDb(dbNetworks), null, 2)}\n`,
    );
    networksPulled = true;
    log(json, '[courier] data-networks.json: pulled from the DB.');
  } else if (networksDiffer) {
    log(json, '[courier] data-networks.json: differs from the DB — rerun with --update to pull.');
  }

  log(
    json,
    `[courier] pull done: ${created} created, ${pulled} pulled, ${pending} differ (rerun with --update to pull), ${unchanged} unchanged, ${notInDb} not in DB, vocabulary ${networksDiffer ? (update ? 'pulled' : 'differs') : 'unchanged'}.`,
  );
  logTable(json, rows);

  return { created, pulled, pending, unchanged, notInDb, localDeleteSync, networksDiffer, networksPulled };
}

interface CheckSummary {
  localCount: number;
  dbCount: number;
  matched: number;
  mismatched: { code: string; differences: string[] }[];
  notImported: string[];
  orphaned: string[];
  networks: {
    notImported: string[];
    mismatched: string[];
    orphaned: string[];
  };
  countries: {
    notImported: string[];
    mismatched: string[];
    orphaned: string[];
  };
}

async function runCheck(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
  json: boolean,
): Promise<CheckSummary> {
  const networkVocab = await loadNetworkVocab(sourceDir);
  const vocabMap = new Map(Object.entries(networkVocab));
  const countryVocab = await loadCountryVocab(sourceDir);
  const localCouriers = await loadLocalCouriers(sourceDir, vocabMap, Object.keys(countryVocab));
  const localByCode = new Map(localCouriers.map((c) => [c.code, c]));

  const { couriers: dbCouriers } = (await apiFetch(
    apiBaseUrl,
    opsToken,
    '/operation/courier-import/couriers',
  )) as {
    couriers: DbCourier[];
  };
  const dbByCode = new Map(dbCouriers.map((c) => [c.code, c]));

  const { countries: dbCountries } = (await apiFetch(
    apiBaseUrl,
    opsToken,
    '/operation/courier-import/countries',
  )) as {
    countries: Record<string, { label: RawPartial; enabled: boolean }>;
  };

  const { networks: dbNetworks } = (await apiFetch(
    apiBaseUrl,
    opsToken,
    '/operation/courier-import/networks',
  )) as {
    networks: { code: string; name: RawPartial; sortOrder: number }[];
  };
  const dbNetworksByCode = new Map(dbNetworks.map((network) => [network.code, network]));

  log(json, `[courier] check: ${localByCode.size} local, ${dbByCode.size} in DB.`);

  let matched = 0;
  const mismatched: CheckSummary['mismatched'] = [];
  const notImported: string[] = [];
  const orphaned: string[] = [];
  const rows: { status: string; code: string; differences: string }[] = [];

  for (const [code, local] of localByCode) {
    const db = dbByCode.get(code);
    if (!db) {
      notImported.push(code);
      rows.push({ status: 'NOT IMPORTED', code, differences: '' });
      continue;
    }
    const differences = courierDifferences(local, db);

    if (differences.length > 0) {
      mismatched.push({ code, differences });
      rows.push({ status: 'DIFFERS', code, differences: differences.join(', ') });
    } else {
      matched++;
    }
  }

  for (const code of dbByCode.keys()) {
    if (!localByCode.has(code)) {
      orphaned.push(code);
      rows.push({ status: 'ORPHANED', code, differences: '' });
    }
  }

  const networkNotImported: string[] = [];
  const networkMismatched: string[] = [];
  const networkOrphaned: string[] = [];
  const networkRows: { status: string; code: string }[] = [];
  for (const [index, [code, name]] of Object.entries(networkVocab).entries()) {
    const db = dbNetworksByCode.get(code);
    if (!db) {
      networkNotImported.push(code);
      networkRows.push({ status: 'NOT IMPORTED', code });
    } else if (trilingualDiffers(name, db.name) || index !== db.sortOrder) {
      networkMismatched.push(code);
      networkRows.push({ status: 'DIFFERS', code });
    }
  }
  for (const code of dbNetworksByCode.keys()) {
    if (!(code in networkVocab)) {
      networkOrphaned.push(code);
      networkRows.push({ status: 'ORPHANED', code });
    }
  }

  log(
    json,
    `[courier] check done: ${matched} match, ${mismatched.length} differ, ${notImported.length} not imported, ${orphaned.length} orphaned in DB.`,
  );
  logTable(json, rows);
  const countryNotImported: string[] = [];
  const countryMismatched: string[] = [];
  const countryOrphaned: string[] = [];
  const countryRows: { status: string; code: string }[] = [];
  for (const [code, entry] of Object.entries(countryVocab)) {
    const db = dbCountries[code];
    if (!db) {
      countryNotImported.push(code);
      countryRows.push({ status: 'NOT IMPORTED', code });
    } else if (trilingualDiffers(entry.label, db.label) || entry.enabled !== db.enabled) {
      countryMismatched.push(code);
      countryRows.push({ status: 'DIFFERS', code });
    }
  }
  // Only an *open* country missing from the file counts as drift: the rows
  // are never deleted (orders reference them), so a closed one left behind
  // in the DB is the expected resting state.
  for (const [code, db] of Object.entries(dbCountries)) {
    if (db.enabled && !(code in countryVocab)) {
      countryOrphaned.push(code);
      countryRows.push({ status: 'ORPHANED', code });
    }
  }

  log(
    json,
    `[courier] network check: ${networkNotImported.length} not imported, ${networkMismatched.length} differ, ${networkOrphaned.length} orphaned in DB.`,
  );
  logTable(json, networkRows);
  log(
    json,
    `[courier] country check: ${countryNotImported.length} not imported, ${countryMismatched.length} differ, ${countryOrphaned.length} open in DB but absent from the file.`,
  );
  logTable(json, countryRows);

  return {
    localCount: localByCode.size,
    dbCount: dbByCode.size,
    matched,
    mismatched,
    notImported,
    orphaned,
    networks: { notImported: networkNotImported, mismatched: networkMismatched, orphaned: networkOrphaned },
    countries: {
      notImported: countryNotImported,
      mismatched: countryMismatched,
      orphaned: countryOrphaned,
    },
  };
}

async function runMain(args: Args): Promise<void> {
  const { command, target, update, deleteMissing, direction, mode, source, json } = args;
  const sourceDir = source ?? join(root, '..', '..', '..', 'sample', 'courier');
  if ((command === 'seed' || command === 'check') && !existsSync(sourceDir)) {
    throw new Error(`Source courier directory not found: ${sourceDir} (pass --source <path> to override).`);
  }

  const apiBaseUrl = loadApiBaseUrl(root, mode);
  if (!apiBaseUrl) fail(`URL_API_BASE not found in kernel JSON for ${mode} (http.apiBaseUrl).`);
  const opsToken = loadOpsToken(root, mode);
  if (!opsToken) fail(`OPS_TOKEN not found in kernel private JSON for ${mode} (ops.token).`);

  log(
    json,
    `[courier] command=${command} direction=${direction} deleteMissing=${deleteMissing} mode=${mode} api=${apiBaseUrl}`,
  );

  const { postOperatorActivity } = await import('./postOperatorActivity.js');

  if (command === 'seed' && direction === 'local') {
    const summary = await runPullFromRemote(
      sourceDir,
      apiBaseUrl,
      opsToken,
      target,
      update,
      deleteMissing,
      json,
    );
    if (json) printJson({ command, direction, ...summary });
  } else if (command === 'seed') {
    const summary = await runCreate(sourceDir, apiBaseUrl, opsToken, target, update, deleteMissing, json);
    if (json) printJson({ command, direction, ...summary });
    const changed = summary.created + summary.updated + (summary.deleteSync?.deletedCouriers ?? 0);
    await postOperatorActivity(root, mode, {
      category: 'shipping',
      action: 'courier.seed',
      summary:
        changed === 0
          ? 'Import livreurs: aucun changement'
          : `Import livreurs: ${summary.created} crees, ${summary.updated} mis a jour, ${summary.unchanged} inchanges`,
      detail: {
        direction: 'remote',
        update,
        deleteMissing,
        target: target ?? null,
        created: summary.created,
        updated: summary.updated,
        unchanged: summary.unchanged,
        networksPushed: summary.networks.pushed,
        countriesPushed: summary.countries.pushed,
        deletedCouriers: summary.deleteSync?.deletedCouriers ?? 0,
      },
    });
  } else if (command === 'delete') {
    const summary = await runDelete(apiBaseUrl, opsToken, target!, json);
    if (json) printJson({ command, ...summary });
    await postOperatorActivity(root, mode, {
      category: 'shipping',
      action: 'courier.delete',
      summary: `Suppression livreur: ${target}`,
      targetType: 'courier',
      targetId: target!,
      detail: summary,
    });
  } else if (command === 'delete-network') {
    const summary = await runDeleteNetwork(apiBaseUrl, opsToken, target!, json);
    if (json) printJson({ command, ...summary });
    await postOperatorActivity(root, mode, {
      category: 'shipping',
      action: 'courier.delete_network',
      summary: `Suppression reseau: ${target}`,
      targetType: 'network',
      targetId: target!,
      detail: summary,
    });
  } else if (command === 'delete-all') {
    const summary = await runDeleteAll(apiBaseUrl, opsToken, json);
    if (json) printJson({ command, ...summary });
    await postOperatorActivity(root, mode, {
      category: 'shipping',
      action: 'courier.delete_all',
      summary: 'Suppression complete des livreurs',
      detail: summary,
    });
  } else {
    const summary = await runCheck(sourceDir, apiBaseUrl, opsToken, json);
    if (json) printJson({ command, ...summary });
  }
}

async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error('[courier] failed', error);
    process.exitCode = 1;
  }
}

type SeedOpts = {
  mode: Mode;
  json?: boolean;
  update?: boolean;
  delete?: boolean;
  direction: Direction;
  source?: string;
  confirm?: boolean;
};
type TargetOpts = { mode: Mode; json?: boolean; confirm?: boolean };
type DeleteAllOpts = { mode: Mode; json?: boolean; confirm?: boolean };
type CheckOpts = { mode: Mode; json?: boolean; source?: string };

addConfirmOption(addCommonOptions(program.command('seed')))
  .description(
    'Push manager courier files to the DB (or pull DB state into manager JSON files with --direction local).',
  )
  .argument('[code]', "a courier's natural key (the code field inside its JSON file, not the filename)")
  .option(
    '--update',
    'update the courier in place when a code already exists and differs from the local file',
  )
  .option(
    '--delete',
    'with a full seed --update, make the destination match the complete source (deletes DB-only or manager-only entries depending on --direction)',
  )
  .addOption(
    new Option(
      '--direction <direction>',
      'remote pushes manager files to the DB; local pulls DB state into manager JSON files',
    )
      .choices(['local', 'remote'])
      .default('remote'),
  )
  .option('--source <path>', 'defaults to catalog import tree/courier')
  .action((target: string | undefined, opts: SeedOpts) =>
    runAction(async () => {
      // --direction local only reads the target DB (writes local manager
      // files) — same "reading prod is fine" treatment as order/log's own
      // read commands. Only the DB-mutating remote direction needs --confirm.
      if (opts.direction !== 'local') requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'seed');
      const deleteMissing = Boolean(opts.delete);
      const update = Boolean(opts.update);
      if (deleteMissing && !update) fail('--delete requires --update.');
      if (deleteMissing && target !== undefined) fail('--delete requires a full seed with no <code>.');
      await runMain({
        command: 'seed',
        target,
        update,
        deleteMissing,
        direction: opts.direction,
        mode: opts.mode,
        source: opts.source,
        confirm: false,
        json: Boolean(opts.json),
      });
    }),
  );

addConfirmOption(addCommonOptions(program.command('delete')))
  .description('Delete a courier from the DB.')
  .argument('<code>', "the courier's natural key")
  .action((target: string, opts: TargetOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete');
      await runMain({
        command: 'delete',
        target,
        update: false,
        deleteMissing: false,
        direction: 'remote',
        mode: opts.mode,
        source: undefined,
        confirm: false,
        json: Boolean(opts.json),
      });
    }),
  );

addConfirmOption(addCommonOptions(program.command('delete-network')))
  .description('Delete a delivery-network vocabulary entry from the DB.')
  .argument('<code>', 'the network code')
  .action((target: string, opts: TargetOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete-network');
      await runMain({
        command: 'delete-network',
        target,
        update: false,
        deleteMissing: false,
        direction: 'remote',
        mode: opts.mode,
        source: undefined,
        confirm: false,
        json: Boolean(opts.json),
      });
    }),
  );

addConfirmOption(
  addCommonOptions(program.command('delete-all')),
  'required when targeting --prod — destroys every courier and network in the target database',
)
  .description('Wipe every courier and the delivery-network vocabulary. Destructive.')
  .action((opts: DeleteAllOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete-all');
      await runMain({
        command: 'delete-all',
        target: undefined,
        update: false,
        deleteMissing: false,
        direction: 'remote',
        mode: opts.mode,
        source: undefined,
        confirm: true,
        json: Boolean(opts.json),
      });
    }),
  );

addCommonOptions(program.command('check'))
  .description('Compare manager courier files against the DB without changing anything.')
  .option('--source <path>', 'defaults to catalog import tree/courier')
  .action((opts: CheckOpts) =>
    runAction(async () => {
      await runMain({
        command: 'check',
        target: undefined,
        update: false,
        deleteMissing: false,
        direction: 'remote',
        mode: opts.mode,
        source: opts.source,
        confirm: false,
        json: Boolean(opts.json),
      });
    }),
  );

program.parse();
