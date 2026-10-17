/** Single-line display name for wherever only one line is available (a
 * carrier's shipping-label recipient field, a plain-text email line) — the
 * recipient's own name when set, otherwise the company name. At least one
 * of the two is always set (DB check constraint on addresses/orders), so
 * this is never actually empty in practice. */
export function identityName(recipientName: string | null, companyName: string | null): string {
  return recipientName ?? companyName ?? '';
}
