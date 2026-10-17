const UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: 'year', seconds: 365 * 86_400 },
  { unit: 'month', seconds: 30 * 86_400 },
  { unit: 'week', seconds: 7 * 86_400 },
  { unit: 'day', seconds: 86_400 },
  { unit: 'hour', seconds: 3_600 },
  { unit: 'minute', seconds: 60 },
];

/** "il y a 2 semaines" / "2 weeks ago", the way Vinted dates a review: the
 * largest whole unit, always as a number ("il y a 1 semaine", not "la
 * semaine dernière"). Under a minute counts as one minute. */
export function relativeTimeAgo(iso: string, lang: string, now: number = Date.now()): string {
  const elapsed = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'always' });
  for (const { unit, seconds } of UNITS) {
    if (elapsed >= seconds) return format.format(-Math.floor(elapsed / seconds), unit);
  }
  return format.format(-1, 'minute');
}
