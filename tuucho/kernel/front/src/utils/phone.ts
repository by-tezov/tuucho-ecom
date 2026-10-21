import { getCountries, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

export type { CountryCode as PhoneCountryCode };

const PHONE_COUNTRIES = new Set<string>(getCountries());

/** Whether libphonenumber knows this country, i.e. whether it can be used as
 * a phone-number country at all. Address countries come from the database
 * (`address_countries`), so a newly imported one is not guaranteed to be a
 * country the phone field can key off — this is what keeps the phone input
 * from being locked to a code it cannot format. */
export function isPhoneCountrySupported(countryCode: string): boolean {
  return PHONE_COUNTRIES.has(countryCode);
}

/** Valid AND actually belongs to `countryCode` — a national-format number
 * (no `+`) is parsed as belonging to `countryCode`, but a fully
 * international number (`+49...`) is rejected unless its own calling code
 * matches, even though it may be a perfectly valid German number. Mirrors
 * Mondial Relay's requirement of a number valid for the delivery country,
 * not just any well-formed one. */
export function isValidPhoneNumberForCountry(value: string, countryCode: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const phoneNumber = parsePhoneNumberFromString(trimmed, countryCode as CountryCode);
  return !!phoneNumber && phoneNumber.isValid() && phoneNumber.country === countryCode;
}

/**
 * Narrow delivery/courier country codes to ones libphonenumber can format.
 *
 * IMPORTANT: never pass the result to `react-phone-number-input`'s `countries`
 * prop when it is empty (or pass `undefined`). That library treats both
 * `undefined` and `[]` as “every ISO country” (`getSupportedCountries([])`
 * returns undefined, then falls back to the full metadata list). Callers must
 * wait until this returns a non-empty list before mounting `<PhoneInput>`, or
 * render a plain tel field instead.
 */
export function toPhoneCountries(countryCodes: string[]): CountryCode[] {
  const supported = countryCodes
    .map((code) => code.trim().toUpperCase())
    .filter(isPhoneCountrySupported) as CountryCode[];
  return [...new Set(supported)];
}

/** Valid for at least one of `countryCodes` — the profile phone number is
 * not tied to a single address, but it is still carried into orders as the
 * recipient number, and Mondial Relay rejects a number that isn't valid for
 * the delivery country. With no known country (the list hasn't loaded yet)
 * it falls back to "valid somewhere": the field stores E.164, so the number
 * carries its own country and can still be checked. */
export function isValidPhoneNumberForAnyCountry(value: string, countryCodes: string[]): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const countries = toPhoneCountries(countryCodes);
  if (countries.length === 0) return parsePhoneNumberFromString(trimmed)?.isValid() === true;
  return countries.some((country) => isValidPhoneNumberForCountry(trimmed, country));
}
