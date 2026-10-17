const PARIS_TZ = 'Europe/Paris';

/** Allowed minimum lot lives — must divide 12 so expiry dates tile the year evenly. */
export const LOT_DURATION_MONTH_OPTIONS = [1, 2, 3, 4, 6, 12] as const;
export type LotDurationMonths = (typeof LOT_DURATION_MONTH_OPTIONS)[number];
export const DEFAULT_LOT_DURATION_MONTHS: LotDurationMonths = 6;

export function isLotDurationMonths(value: number): value is LotDurationMonths {
  return (LOT_DURATION_MONTH_OPTIONS as readonly number[]).includes(value);
}

function parisParts(instant: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: PARIS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function parisLocalKey(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

/** UTC instant for a Paris-local wall clock (handles DST). */
export function parisLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const target = parisLocalKey(year, month, day, hour, minute, second);
  let low = Date.UTC(year - 1, 0, 1);
  let high = Date.UTC(year + 2, 0, 1);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const p = parisParts(new Date(mid));
    const key = parisLocalKey(p.year, p.month, p.day, p.hour, p.minute, p.second);
    if (key < target) low = mid + 1;
    else high = mid;
  }
  return new Date(low);
}

/**
 * Calendar months (1–12) when unused credit may expire (day = 1, Europe/Paris).
 * Anchored on 1 March, then every `lotDurationMonths` months.
 * Example: 6 → 1 March & 1 September; 12 → 1 March only; 4 → 1 Mar / 1 Jul / 1 Nov.
 */
export function expiryMonthsForLotDuration(lotDurationMonths: number): number[] {
  const step = isLotDurationMonths(lotDurationMonths) ? lotDurationMonths : DEFAULT_LOT_DURATION_MONTHS;
  const months: number[] = [];
  for (let offset = 0; offset < 12; offset += step) {
    let month = 3 + offset;
    while (month > 12) month -= 12;
    months.push(month);
  }
  return [...new Set(months)].sort((a, b) => a - b);
}

/** First configured expiry date on or after grantedAt + lotDurationMonths. */
export function expiresAtFromGrantedAt(grantedAt: Date, lotDurationMonths: number): Date {
  const duration = isLotDurationMonths(lotDurationMonths) ? lotDurationMonths : DEFAULT_LOT_DURATION_MONTHS;
  const min = new Date(grantedAt);
  min.setUTCMonth(min.getUTCMonth() + duration);
  const minMs = min.getTime();
  const months = expiryMonthsForLotDuration(duration);
  const startYear = parisParts(min).year - 1;
  for (let year = startYear; year <= startYear + 12; year++) {
    for (const month of months) {
      const expiry = parisLocalToUtc(year, month, 1, 0, 0, 0);
      if (expiry.getTime() >= minMs) return expiry;
    }
  }
  const lastMonth = months[months.length - 1] ?? 3;
  return parisLocalToUtc(startYear + 12, lastMonth, 1, 0, 0, 0);
}

/** Next configured expiry date strictly after now (for admin reporting). */
export function nextExpiryDateAfter(lotDurationMonths: number, now = new Date()): Date {
  const duration = isLotDurationMonths(lotDurationMonths) ? lotDurationMonths : DEFAULT_LOT_DURATION_MONTHS;
  const months = expiryMonthsForLotDuration(duration);
  const year = parisParts(now).year;
  for (let y = year; y <= year + 3; y++) {
    for (const month of months) {
      const expiry = parisLocalToUtc(y, month, 1, 0, 0, 0);
      if (now.getTime() < expiry.getTime()) return expiry;
    }
  }
  const lastMonth = months[months.length - 1] ?? 3;
  return parisLocalToUtc(year + 4, lastMonth, 1, 0, 0, 0);
}
