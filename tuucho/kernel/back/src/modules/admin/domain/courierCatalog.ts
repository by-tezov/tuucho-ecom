/** Editable courier display and prices. A write is a grouped JSON document
 * (texts, times, packet prices). Codes, countries, networks and packet keys
 * already exist: unknown keys such as enabled are ignored, and a missing or
 * extra country or packet is rejected. Product languages are en and fr. */

export const COURIER_LOCALES = ['en', 'fr'] as const;
export type CourierLocale = (typeof COURIER_LOCALES)[number];
export type CourierLocaleText = Record<CourierLocale, string>;

export class CourierCatalogError extends Error {
  readonly status: 400 | 404;

  constructor(message: string, status: 400 | 404 = 400) {
    super(message);
    this.name = 'CourierCatalogError';
    this.status = status;
  }
}

export interface CourierCountryWrite {
  code: string;
  minDays: number;
  maxDays: number;
  custodyDays: number | null;
}

export interface CourierPacketPriceWrite {
  country: string;
  price: number;
  expressPrice: number | null;
}

export interface CourierPacketWrite {
  key: string;
  sortOrder: number;
  maxQuantity: number;
  prices: CourierPacketPriceWrite[];
}

export interface CourierCatalogWrite {
  sortOrder: number;
  name: CourierLocaleText;
  description: CourierLocaleText;
  countries: CourierCountryWrite[];
  packets: CourierPacketWrite[];
}

export interface PacketMeasurementWrite {
  quantity: number;
  weight: number;
  length: number;
  width: number;
  depth: number;
}

function fail(message: string): never {
  throw new CourierCatalogError(message);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Body must be an object.');
  return value as Record<string, unknown>;
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const want = new Set(right);
  return left.every((item) => want.has(item));
}

function parseIntIn(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(`${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function parseMoney(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be a price.`);
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-6) fail(`${label} must have at most 2 decimals.`);
  if (cents <= 0 || cents > 999999) fail(`${label} must be greater than 0 and at most 9999.99.`);
  return cents / 100;
}

export function parseLocaleText(value: unknown, label: string, allowEmpty: boolean): CourierLocaleText {
  const source = record(value);
  const out = {} as CourierLocaleText;
  for (const locale of COURIER_LOCALES) {
    const raw = source[locale];
    if (typeof raw !== 'string') fail(`${label} needs a ${locale} text.`);
    const text = raw.trim();
    if (!allowEmpty && text.length === 0) fail(`${label} needs a ${locale} text.`);
    if (text.length > (allowEmpty ? 400 : 80)) fail(`${label} ${locale} is too long.`);
    out[locale] = text;
  }
  return out;
}

/** One amount when every country matches, otherwise a country map. */
export function collapseCountryPrices(entries: ReadonlyArray<{ country: string; amount: number }>): number | Record<string, number> {
  const first = entries[0]?.amount;
  if (first !== undefined && entries.every((entry) => entry.amount === first)) return first;
  const map: Record<string, number> = {};
  for (const entry of entries) map[entry.country] = entry.amount;
  return map;
}

export function parseCourierCatalogWrite(
  body: unknown,
  existing: { countries: readonly string[]; packets: readonly string[] },
): CourierCatalogWrite {
  const source = record(body);
  const name = parseLocaleText(source.name, 'Name', false);
  const description = parseLocaleText(source.description, 'Description', true);
  const sortOrder = parseIntIn(source.sortOrder, 0, 999, 'Sort order');
  const ranges = expandRange(source.deliveryTime, existing.countries);
  const custody = expandCustody(source.custodyTime, existing.countries);
  const countries = existing.countries.map((code, index) => ({
    code,
    minDays: ranges[index]!.minDays,
    maxDays: ranges[index]!.maxDays,
    custodyDays: custody[index] ?? null,
  }));
  if (!Array.isArray(source.packets)) fail('Packets must be a list.');
  const packets = source.packets.map((entry, index) => parsePacket(entry, index, existing.countries));
  if (!sameMembers(packets.map((entry) => entry.key), existing.packets)) {
    fail('Packets cannot be added or removed.');
  }
  for (let i = 1; i < packets.length; i += 1) {
    if (packets[i]!.maxQuantity <= packets[i - 1]!.maxQuantity) {
      fail('Packet quantity must increase with the packet order.');
    }
  }
  return { sortOrder, name, description, countries, packets };
}

function expandRange(
  raw: unknown,
  countries: readonly string[],
): { minDays: number; maxDays: number }[] {
  const source = record(raw);
  if ('min' in source || 'max' in source) {
    const range = readRange(source);
    return countries.map(() => range);
  }
  rejectUnknownCountry(source, countries);
  const fallback = 'default' in source ? readRange(record(source.default)) : null;
  return countries.map((code) => {
    if (code in source) return readRange(record(source[code]));
    if (fallback) return fallback;
    fail(`Delivery time for ${code} is missing.`);
  });
}

function readRange(source: Record<string, unknown>): { minDays: number; maxDays: number } {
  const minDays = parseIntIn(source.min, 1, 60, 'Minimum days');
  const maxDays = parseIntIn(source.max, 1, 60, 'Maximum days');
  if (minDays > maxDays) fail('Minimum days cannot exceed maximum days.');
  return { minDays, maxDays };
}

function expandCustody(raw: unknown, countries: readonly string[]): (number | null)[] {
  if (raw === undefined || raw === null) return countries.map(() => null);
  if (typeof raw === 'number') {
    const days = parseIntIn(raw, 1, 60, 'Hold days');
    return countries.map(() => days);
  }
  const source = record(raw);
  rejectUnknownCountry(source, countries);
  const fallback = 'default' in source ? parseIntIn(source.default, 1, 60, 'Hold days') : null;
  const days = countries.map((code) =>
    code in source ? parseIntIn(source[code], 1, 60, 'Hold days') : fallback,
  );
  const any = days.some((value) => value !== null);
  const all = days.every((value) => value !== null);
  if (any && !all) fail('Hold days must be set for every country, or for none.');
  return days;
}

function parsePacket(value: unknown, sortOrder: number, countries: readonly string[]): CourierPacketWrite {
  const source = record(value);
  if (typeof source.key !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.key)) {
    fail('Packet key is invalid.');
  }
  const price = expandMoney(source.price, countries, `Price ${source.key}`);
  const express = expandOptionalMoney(source.expressPrice, countries, `Express ${source.key}`);
  return {
    key: source.key,
    sortOrder,
    maxQuantity: parseIntIn(source.maxQuantity, 1, 99, 'Packet quantity'),
    prices: countries.map((country) => ({
      country,
      price: price.get(country)!,
      expressPrice: express.get(country) ?? null,
    })),
  };
}

function expandMoney(raw: unknown, countries: readonly string[], label: string): Map<string, number> {
  if (typeof raw === 'number') {
    const amount = parseMoney(raw, label);
    return new Map(countries.map((code) => [code, amount]));
  }
  const source = record(raw);
  rejectUnknownCountry(source, countries);
  const fallback = 'default' in source ? parseMoney(source.default, label) : null;
  return new Map(
    countries.map((code) => {
      if (code in source) return [code, parseMoney(source[code], label)];
      if (fallback !== null) return [code, fallback];
      fail(`${label} for ${code} is missing.`);
    }),
  );
}

function expandOptionalMoney(
  raw: unknown,
  countries: readonly string[],
  label: string,
): Map<string, number | null> {
  if (raw === undefined || raw === null) return new Map(countries.map((code) => [code, null]));
  const amounts = expandMoney(raw, countries, label);
  return new Map(countries.map((code) => [code, amounts.get(code) ?? null]));
}

function rejectUnknownCountry(source: Record<string, unknown>, countries: readonly string[]): void {
  for (const key of Object.keys(source)) {
    if (key !== 'default' && !countries.includes(key)) fail('Countries cannot be added or removed.');
  }
}

export function parseCountryLabels(body: unknown): CourierLocaleText {
  return parseLocaleText(body, 'Label', false);
}

export function parseNetworkWrite(body: unknown): { sortOrder: number; name: CourierLocaleText } {
  const source = record(body);
  return {
    sortOrder: parseIntIn(source.sortOrder, 0, 999, 'Sort order'),
    name: parseLocaleText(source.name, 'Name', false),
  };
}

export function parseMeasurementWrite(body: unknown, quantities: readonly number[]): PacketMeasurementWrite[] {
  const source = record(body);
  const packets = Object.entries(source).map(([key, value]) => {
    if (!/^\d+$/.test(key)) fail('Quantity is invalid.');
    const row = record(value);
    const size = record(row.size);
    return {
      quantity: parseIntIn(Number(key), 1, 99, 'Quantity'),
      weight: parseIntIn(row.weight, 1, 20000, 'Weight'),
      length: parseIntIn(size.length, 1, 200, 'Length'),
      width: parseIntIn(size.width, 1, 200, 'Width'),
      depth: parseIntIn(size.depth, 1, 200, 'Depth'),
    };
  });
  if (!sameMembers(Object.keys(source), quantities.map(String))) {
    fail('Parcel quantities cannot be added or removed.');
  }
  return packets.sort((a, b) => a.quantity - b.quantity);
}
