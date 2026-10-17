/** Admin courier page: texts, times, prices and parcel sizes of rows that
 * already exist. Enabling a courier or a country stays on preferences. */

export interface CourierCatalogLocaleText {
  en: string;
  fr: string;
}

export interface CourierCatalogCountry {
  code: string;
  label: CourierCatalogLocaleText;
}

export interface CourierCatalogNetwork {
  code: string;
  sortOrder: number;
  name: CourierCatalogLocaleText;
}

export interface CourierCatalogMeasurement {
  quantity: number;
  weight: number;
  length: number;
  width: number;
  depth: number;
}

export interface CourierCatalogCountryTime {
  code: string;
  minDays: number | null;
  maxDays: number | null;
  custodyDays: number | null;
}

export interface CourierCatalogPacketPrice {
  country: string;
  price: number | null;
  expressPrice: number | null;
}

export interface CourierCatalogPacket {
  key: string;
  sortOrder: number;
  maxQuantity: number;
  prices: CourierCatalogPacketPrice[];
}

export interface CourierCatalogCourier {
  code: string;
  sortOrder: number;
  name: CourierCatalogLocaleText;
  description: CourierCatalogLocaleText;
  countries: CourierCatalogCountryTime[];
  packets: CourierCatalogPacket[];
}

export interface CourierCatalogDocument {
  countries: CourierCatalogCountry[];
  networks: CourierCatalogNetwork[];
  measurements: CourierCatalogMeasurement[];
  couriers: CourierCatalogCourier[];
}
