type CourierPriceValue = number | Record<string, number>;

function priceForCountry(price: CourierPriceValue, countryCode: string): number | null {
  if (typeof price === 'number') {
    return Number.isFinite(price) && price > 0 ? price : null;
  }
  const value = price[countryCode];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export type CourierCountryCatalogBlockReason =
  'delivery_time_missing' | 'custody_time_missing' | 'packet_price_missing' | 'express_price_incomplete';

export type CourierCountryCatalogShape = {
  countries: Array<{ code: string }>;
  deliveryTimes: Record<string, { custodyDays: number | null } | undefined>;
  packets: Array<{ price: CourierPriceValue; expressPrice: CourierPriceValue | null }>;
};

export function courierCountryCatalogBlockReason(
  courier: CourierCountryCatalogShape,
  countryCode: string,
): CourierCountryCatalogBlockReason | null {
  const entry = courier.countries.find((c) => c.code === countryCode);
  if (!entry) return 'packet_price_missing';
  const time = courier.deliveryTimes[countryCode];
  if (!time) return 'delivery_time_missing';
  const requiresCustody = courier.countries.some((c) => {
    const t = courier.deliveryTimes[c.code];
    return t != null && t.custodyDays !== null;
  });
  if (requiresCustody && time.custodyDays === null) return 'custody_time_missing';
  for (const packet of courier.packets) {
    if (priceForCountry(packet.price, countryCode) === null) return 'packet_price_missing';
    if (packet.expressPrice !== null && priceForCountry(packet.expressPrice, countryCode) === null) {
      return 'express_price_incomplete';
    }
  }
  return null;
}

export function courierCountryCatalogReady(
  courier: CourierCountryCatalogShape,
  countryCode: string,
): boolean {
  return courierCountryCatalogBlockReason(courier, countryCode) === null;
}
