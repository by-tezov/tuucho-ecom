/** Shared between scripts/build.mjs (maintenance-prepare) and scripts/dev.mjs
 * (dev-server preview of the same banner) so the DD/MM/YY-HH:mm parsing and
 * default message can't drift between the two. */

// Appended after the banner's own "Maintenance prévue du ... au ..." sentence
// (see MaintenanceBanner.tsx) — phrased as a supplement, not a restatement,
// since the from/to sentence already says a window is coming.
export const DEFAULT_MAINTENANCE_MESSAGE =
  'Certaines fonctionnalités peuvent être temporairement indisponibles pendant cette période.';

/** Parses "DD/MM/YY-HH:mm" (or "DD/MM/YYYY-HH:mm" — a 4-digit year typed out
 * of habit is a near-miss worth accepting rather than a rejection, so both
 * widths are valid) as a local date/time on this machine and returns the
 * epoch ms it represents. `fail` is called (and must throw/exit) on any
 * parse error — callers each have their own CLI error reporting. */
export function parseFrenchDateTime(value, flag, fail) {
  const match = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})-(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) fail(`--${flag} must be in DD/MM/YY-HH:mm format (got "${value}")`);
  const [, day, month, year, hour, minute] = match;
  const fullYear = year.length === 4 ? Number(year) : 2000 + Number(year);
  const date = new Date(fullYear, Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (Number.isNaN(date.getTime())) fail(`--${flag} is not a valid date/time ("${value}")`);
  return date.getTime();
}

/** Inverse of parseFrenchDateTime, for display — DD/MM/YYYY HH:mm, local
 * time on whichever machine renders it. build.mjs's maintenance lockdown
 * page has no JS at all, so this runs at build time (the operator's local
 * time zone, same assumption --from/--to parsing already makes); the React
 * MaintenanceBanner keeps its own copy of this exact shape since it instead
 * runs per-visitor, in the browser, and can't import a Node-only module. */
export function formatLocalDateTime(epochMs) {
  const date = new Date(epochMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
