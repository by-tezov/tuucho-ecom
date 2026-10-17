/** Postal-code shapes for countries the shop may ship to. Used for
 * format validation only (e.g. Mondial Relay search auto-submit). An
 * unknown country falls back to free text rather than to a guessed pattern. */
const POSTAL_CODE_PATTERN: Record<string, RegExp> = {
  FR: /^\d{5}$/,
  BE: /^\d{4}$/,
  LU: /^\d{4}$/,
  ES: /^\d{5}$/,
  IT: /^\d{5}$/,
  // Portugal writes 1000-001; the -NNN half is optional in a search.
  PT: /^\d{4}(-\d{3})?$/,
  // The Netherlands writes 1012 AB; the two letters are optional in a
  // search, where the four digits already identify the area.
  NL: /^\d{4} ?[A-Za-z]{2}$|^\d{4}$/,
};

/** Countries whose postal code is digits only, mapped to that digit count —
 * what an input needs to strip non-digits, cap its length, and ask for a
 * numeric keyboard. Countries with letters in the code (NL, PT) are
 * deliberately absent: they must stay free text. */
export const POSTAL_CODE_DIGIT_LENGTH: Record<string, number> = {
  FR: 5,
  BE: 4,
  LU: 4,
  ES: 5,
  IT: 5,
};

/** Whether `value` is a complete postal code for `countryCode` — used to
 * search as soon as the customer has typed one, instead of waiting for
 * them to press the button. Unknown countries return false: without a
 * known shape there is no way to tell "complete" from "half typed". */
export function isCompletePostalCode(value: string, countryCode: string): boolean {
  const pattern = POSTAL_CODE_PATTERN[countryCode.toUpperCase()];
  return pattern ? pattern.test(value.trim()) : false;
}
