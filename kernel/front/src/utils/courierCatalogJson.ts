import type {
  CourierCatalogCourier,
  CourierCatalogDocument,
  CourierCatalogLocaleText,
  CourierCatalogMeasurement,
} from '../api/contract/admin/courierCatalog';

export class CourierJsonFormatError extends Error {
  constructor() {
    super('Invalid JSON');
    this.name = 'CourierJsonFormatError';
  }
}

function locales(text: CourierCatalogLocaleText): CourierCatalogLocaleText {
  return {
    en: text.en,
    fr: text.fr,
  };
}

function money(
  rows: CourierCatalogCourier['packets'][number]['prices'],
  pick: (row: CourierCatalogCourier['packets'][number]['prices'][number]) => number | null,
): number | Record<string, number | null> | null {
  const values = rows.map(pick);
  if (values.every((value) => value === null)) return null;
  const first = values[0];
  if (typeof first === 'number' && values.every((value) => value === first)) return first;
  const map: Record<string, number | null> = {};
  rows.forEach((row, index) => {
    map[row.country] = values[index] ?? null;
  });
  return map;
}

/** Courier JSON document: texts, times, prices. Enable flags stay out. */
export function courierDocument(courier: CourierCatalogCourier): Record<string, unknown> {
  const document: Record<string, unknown> = {
    sortOrder: courier.sortOrder,
    name: locales(courier.name),
    description: locales(courier.description),
    deliveryTime: Object.fromEntries(
      courier.countries.map((country) => [country.code, { min: country.minDays, max: country.maxDays }]),
    ),
  };
  const custody = courier.countries.map((country) => country.custodyDays);
  if (custody.some((days) => days !== null)) {
    const first = custody[0];
    document.custodyTime = custody.every((days) => days === first)
      ? first
      : Object.fromEntries(courier.countries.map((country) => [country.code, country.custodyDays]));
  }
  document.packets = courier.packets.map((packet) => {
    const row: Record<string, unknown> = {
      key: packet.key,
      maxQuantity: packet.maxQuantity,
      price: money(packet.prices, (price) => price.price),
    };
    const express = money(packet.prices, (price) => price.expressPrice);
    if (express !== null) row.expressPrice = express;
    return row;
  });
  return document;
}

export function countryDocument(label: CourierCatalogLocaleText): Record<string, unknown> {
  return { ...locales(label) };
}

export function networkDocument(network: {
  sortOrder: number;
  name: CourierCatalogLocaleText;
}): Record<string, unknown> {
  return { sortOrder: network.sortOrder, name: locales(network.name) };
}

/** Parcel file shape. Quantity keys stay as they are. */
export function measurementDocument(rows: readonly CourierCatalogMeasurement[]): Record<string, unknown> {
  const document: Record<string, unknown> = {};
  for (const row of [...rows].sort((left, right) => left.quantity - right.quantity)) {
    document[String(row.quantity)] = {
      weight: row.weight,
      size: { length: row.length, width: row.width, depth: row.depth },
    };
  }
  return document;
}

export type CourierEditor =
  | { kind: 'courier'; code: string }
  | { kind: 'country'; code: string }
  | { kind: 'network'; code: string }
  | { kind: 'measurements' };

export function courierEditorDocument(
  editor: CourierEditor,
  catalog: CourierCatalogDocument,
): Record<string, unknown> {
  if (editor.kind === 'courier') {
    const courier = catalog.couriers.find((item) => item.code === editor.code);
    return courier ? courierDocument(courier) : {};
  }
  if (editor.kind === 'country') {
    const country = catalog.countries.find((item) => item.code === editor.code);
    return country ? countryDocument(country.label) : {};
  }
  if (editor.kind === 'network') {
    const network = catalog.networks.find((item) => item.code === editor.code);
    return network ? networkDocument(network) : {};
  }
  return measurementDocument(catalog.measurements);
}

export function formatCourierJson(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CourierJsonFormatError();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new CourierJsonFormatError();
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function parseCourierJson(text: string): Record<string, unknown> {
  return JSON.parse(formatCourierJson(text)) as Record<string, unknown>;
}
