/** Single-line display name for wherever only one line fits (sort keys,
 * compact list rows) — the recipient's own name when set, otherwise the
 * company name. At least one of the two is always set (backend check
 * constraint on addresses/orders). */
export function identityName(recipientName: string | null, companyName: string | null): string {
  return recipientName ?? companyName ?? '';
}
