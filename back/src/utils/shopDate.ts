/** Today's calendar date in the shop's time zone, `YYYY-MM-DD` (en-CA
 * formats it that way). Voucher `starts_at` / `ends_at` are shop dates: the
 * UTC date kept a voucher ending on the 31st valid until 01:00 or 02:00
 * Paris time on the 1st, and opened one starting on day X an hour or two
 * late. */
export function shopToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
