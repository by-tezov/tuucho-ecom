/** ISO 3166-1 alpha-2 codes used for checkout personalization. */
export type CountryCode = string;

export type ClientCountryContext = {
  deliveryCountry: CountryCode | null;
  geoCountry: CountryCode | null;
  effectiveCountries: CountryCode[];
};

const ISO2 = /^[A-Z]{2}$/;

/** Sentinel in allowlists meaning “every country” (empty list is not worldwide). */
export const COUNTRY_LIST_ALL = 'ALL';

export function normalizeCountryCode(value: string | null | undefined): CountryCode | null {
  if (!value || typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return ISO2.test(code) ? code : null;
}

/** Union of delivery address country and best-effort client geo country. */
export function buildEffectiveCountries(
  deliveryCountry: CountryCode | null,
  geoCountry: CountryCode | null,
): CountryCode[] {
  const out = new Set<CountryCode>();
  if (deliveryCountry) out.add(deliveryCountry);
  if (geoCountry) out.add(geoCountry);
  return [...out];
}

export function buildClientCountryContext(
  deliveryCountry: CountryCode | null | undefined,
  geoCountry: CountryCode | null | undefined,
): ClientCountryContext {
  const delivery = normalizeCountryCode(deliveryCountry ?? null);
  const geo = normalizeCountryCode(geoCountry ?? null);
  return {
    deliveryCountry: delivery,
    geoCountry: geo,
    effectiveCountries: buildEffectiveCountries(delivery, geo),
  };
}
