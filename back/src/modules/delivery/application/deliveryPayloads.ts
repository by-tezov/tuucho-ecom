import type pg from 'pg';
import * as addresses from '../../customers/addresses/application/addresses.js';
import * as couriers from './couriers.js';
import { localize, type Language } from '../../../utils/language.js';

export const DEFAULT_COURIER_PREFERENCE = 'default_courier_code';

export async function buildCountriesPayload(pool: pg.Pool, language: Language) {
  const countries = await addresses.listCountries(pool);
  return countries.map((country) => ({
    code: country.code,
    label: localize(country.label, language),
  }));
}

export async function buildCouriersPayload(pool: pg.Pool, language: Language) {
  const [rows, countries] = await Promise.all([couriers.listEnabled(pool), addresses.listCountries(pool)]);
  const shippingCountryCount = countries.length;
  return rows.map((courier) => ({
    code: courier.code,
    name: localize(courier.name, language),
    description: localize(courier.description, language),
    sortOrder: courier.sortOrder,
    countries: couriers.enabledCountryCodes(courier, shippingCountryCount),
    catalogCountries: courier.countries,
    deliveryTimes: courier.deliveryTimes,
    networks: courier.networks,
    packets: courier.packets.map((packet) => ({
      packetKey: packet.packetKey,
      maxQuantity: packet.maxQuantity,
      price: packet.price,
      expressPrice: packet.expressPrice,
    })),
  }));
}
