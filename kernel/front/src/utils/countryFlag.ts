/** Converts an ISO 3166-1 alpha-2 country code to a regional-indicator
 * flag emoji (e.g. "FR" → 🇫🇷). Returns null for empty or invalid codes
 * so callers can fall back to the plain country label. */
export function toFlagEmoji(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null;
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const A = 0x1f1e6; // regional indicator symbol letter A
  const base = 'A'.charCodeAt(0);
  return String.fromCodePoint(A + (code.charCodeAt(0) - base), A + (code.charCodeAt(1) - base));
}
