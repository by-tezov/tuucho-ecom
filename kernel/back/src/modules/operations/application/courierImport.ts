import { pool } from '../../../db/pool.js';
import {
  courierStateDiffers,
  createCourier,
  findByCode,
  findCourierIdByCode,
  updateCourier,
} from '../../delivery/application/couriers.js';
import type {
  CourierCountryEntry,
  CourierDeliveryTime,
  CourierDesiredState,
  CourierPacketInput,
} from '../../delivery/application/couriers.js';
import { parseCourierPriceValue, type CourierPriceValue } from '../../commerce/domain/courierPrice.js';
import { expandCountries } from './courierFieldExpand.js';
import type { CountryVocabEntry } from '../../customers/addresses/application/addresses.js';
import type { PartialTrilingual } from '../../../types.js';

export class InvalidCourier extends Error {}

export function packetMeasurements(
  value: unknown,
): { quantity: number; weight: number; length: number; width: number; depth: number }[] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).map(([quantity, raw]) => {
    const packet = raw as { weight?: unknown; size?: { length?: unknown; width?: unknown; depth?: unknown } };
    return {
      quantity: Number(quantity),
      weight: packet?.weight,
      length: packet?.size?.length,
      width: packet?.size?.width,
      depth: packet?.size?.depth,
    };
  });
  if (
    !entries.length ||
    !entries.every((entry) =>
      [entry.quantity, entry.weight, entry.length, entry.width, entry.depth].every(isPositiveInteger),
    )
  )
    return undefined;
  return entries as { quantity: number; weight: number; length: number; width: number; depth: number }[];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function isPartialTrilingual(value: unknown): value is PartialTrilingual {
  return !!value && typeof value === 'object' && typeof (value as PartialTrilingual).fr === 'string';
}

/** Filters an incoming `{code: name, ...}` object down to only the entries
 * whose value is actually a valid trilingual label — same object-keyed-by-
 * code shape as catalog source's data-networks.json, not an array. */
export function networkMap(value: unknown): Record<string, PartialTrilingual> {
  if (!value || typeof value !== 'object') return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(([, name]) =>
    isPartialTrilingual(name),
  );
  return Object.fromEntries(entries) as Record<string, PartialTrilingual>;
}

function isPacketInput(value: unknown): value is CourierPacketInput {
  if (!value || typeof value !== 'object') return false;
  const packet = value as Record<string, unknown>;
  if (
    typeof packet.packetKey !== 'string' ||
    typeof packet.maxQuantity !== 'number' ||
    packet.maxQuantity <= 0
  ) {
    return false;
  }
  const price = parseCourierPriceValue(packet.price);
  if (price === undefined) return false;
  if (packet.expressPrice === null || packet.expressPrice === undefined) return true;
  return parseCourierPriceValue(packet.expressPrice) !== undefined;
}

/** `{ FR: { minDays, maxDays, custodyDays? }, … }` — the CLI merges
 * catalog source's separate `deliveryTime` / `custodyTime` objects into
 * this one map. Incomplete or malformed entries fail the import. */
function deliveryTimeMap(value: unknown, countries: string[]): Record<string, CourierDeliveryTime> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidCourier('deliveryTimes must be an object keyed by country code.');
  }
  const times: Record<string, CourierDeliveryTime> = {};
  for (const [countryCode, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') {
      throw new InvalidCourier(`deliveryTimes.${countryCode} is invalid.`);
    }
    const { minDays, maxDays, custodyDays } = raw as Record<string, unknown>;
    if (!isPositiveInteger(minDays) || !isPositiveInteger(maxDays) || maxDays < minDays) {
      throw new InvalidCourier(
        `deliveryTimes.${countryCode} must be { minDays, maxDays } with maxDays ≥ minDays.`,
      );
    }
    if (custodyDays !== null && custodyDays !== undefined && !isPositiveInteger(custodyDays)) {
      throw new InvalidCourier(
        `deliveryTimes.${countryCode}.custodyDays must be a positive integer or null.`,
      );
    }
    times[countryCode] = {
      minDays,
      maxDays,
      custodyDays: isPositiveInteger(custodyDays) ? custodyDays : null,
    };
  }
  for (const code of countries) {
    if (!times[code]) {
      throw new InvalidCourier(`deliveryTimes.${code} is required for every country.`);
    }
  }
  return times;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function packetArray(value: unknown): CourierPacketInput[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isPacketInput)) return undefined;
  const packets: CourierPacketInput[] = [];
  for (const packet of value as CourierPacketInput[]) {
    const price = parseCourierPriceValue(packet.price)!;
    let expressPrice: CourierPriceValue | null = null;
    if (packet.expressPrice !== null && packet.expressPrice !== undefined) {
      expressPrice = parseCourierPriceValue(packet.expressPrice)!;
    }
    packets.push({
      packetKey: packet.packetKey,
      maxQuantity: packet.maxQuantity,
      price,
      expressPrice,
    });
  }
  return packets;
}

/** Accepts manager boolean map (+ optional default), legacy `{ enabled }`,
 * legacy `["FR"]`, or `[{ code, enabled }]`. When `default` is present the
 * caller should already have expanded; this still expands if vocabCodes given. */
function parseCountriesInput(value: unknown, vocabCodes?: string[]): CourierCountryEntry[] {
  if (vocabCodes && vocabCodes.length > 0) {
    try {
      const expanded = expandCountries(value, vocabCodes, 'countries');
      return Object.entries(expanded).map(([code, enabled]) => ({ code, enabled }));
    } catch {
      // fall through to legacy shapes below
    }
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    if (value.every((entry) => typeof entry === 'string')) {
      return (value as string[]).map((code) => ({ code, enabled: true }));
    }
    const entries: CourierCountryEntry[] = [];
    for (const raw of value) {
      if (!raw || typeof raw !== 'object') return [];
      const entry = raw as { code?: unknown; enabled?: unknown };
      if (typeof entry.code !== 'string' || !/^[A-Z]{2}$/.test(entry.code)) return [];
      entries.push({ code: entry.code, enabled: entry.enabled !== false });
    }
    return entries;
  }
  if (!value || typeof value !== 'object') return [];
  const entries: CourierCountryEntry[] = [];
  for (const [code, raw] of Object.entries(value as Record<string, unknown>)) {
    if (code === 'default') continue;
    if (!/^[A-Z]{2}$/.test(code)) return [];
    if (raw === true || raw === false) {
      entries.push({ code, enabled: raw });
      continue;
    }
    if (!raw || typeof raw !== 'object') return [];
    const enabled = (raw as { enabled?: unknown }).enabled !== false;
    entries.push({ code, enabled });
  }
  return entries;
}

/** Filters an incoming `{code: {label, enabled}, ...}` object down to the
 * entries that actually carry a valid label — same object-keyed-by-code
 * shape as catalog source's data-countries.json. `enabled` defaults to
 * true: a country listed without saying otherwise is one the shop ships to. */
export function countryMap(value: unknown): Record<string, CountryVocabEntry> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([code, entry]) => {
      if (!/^[A-Z]{2}$/.test(code)) return false;
      const label = (entry as { label?: unknown })?.label;
      return isPartialTrilingual(label);
    })
    .map(([code, entry]) => {
      const raw = entry as { label: PartialTrilingual; enabled?: unknown };
      return [code, { label: raw.label, enabled: raw.enabled !== false }] as const;
    });
  return Object.fromEntries(entries);
}

export interface CourierImportResult {
  success: true;
  created: boolean;
  updated: boolean;
  id: string;
}

/** Shared by the single-courier and batch endpoints. */
export async function importCourier(body: Record<string, unknown>): Promise<CourierImportResult> {
  const code = typeof body.code === 'string' ? body.code : '';
  const name = isPartialTrilingual(body.name) ? body.name : undefined;
  const description = isPartialTrilingual(body.description) ? body.description : { fr: '' };
  const countries = parseCountriesInput(body.countries);
  const countryCodes = countries.map((c) => c.code);
  const networks = stringArray(body.networks);
  let packets: CourierPacketInput[] | undefined;
  try {
    packets = packetArray(body.packets);
  } catch (error) {
    if (error instanceof InvalidCourier) throw error;
    packets = undefined;
  }

  if (!code || !name || countries.length === 0 || networks.length === 0 || !packets) {
    throw new InvalidCourier(
      'code, name, at least one country, at least one network, and at least one valid packet are required.',
    );
  }

  const maxQuantities = packets.map((p) => p.maxQuantity);
  const isStrictlyIncreasing = maxQuantities.every((value, i) => i === 0 || value > maxQuantities[i - 1]!);
  if (!isStrictlyIncreasing) {
    throw new InvalidCourier('packets[].maxQuantity must be strictly increasing.');
  }

  const deliveryTimes = deliveryTimeMap(body.deliveryTimes, countryCodes);
  const requiresCustody = Object.values(deliveryTimes).some((t) => t.custodyDays !== null);
  if (requiresCustody) {
    for (const countryCode of countryCodes) {
      if (deliveryTimes[countryCode]?.custodyDays == null) {
        throw new InvalidCourier(
          `deliveryTimes.${countryCode}.custodyDays is required when any country has custody.`,
        );
      }
    }
  }

  const desired: CourierDesiredState = {
    name,
    description,
    enabled: body.enabled !== false,
    sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
    trackingAvailable: body.trackingAvailable === true,
    countries,
    deliveryTimes,
    networks,
    packets,
  };

  const existingId = await findCourierIdByCode(pool, code);
  if (!existingId) {
    const id = await createCourier(pool, code, desired);
    return { success: true, created: true, updated: false, id };
  }

  if (body.update !== true) {
    return { success: true, created: false, updated: false, id: existingId };
  }

  const current = await findByCode(pool, code);
  const differs = !!current && courierStateDiffers(desired, current);
  if (!differs) return { success: true, created: false, updated: false, id: existingId };

  await updateCourier(pool, existingId, desired);
  return { success: true, created: false, updated: true, id: existingId };
}
