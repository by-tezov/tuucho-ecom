const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  // 365 days, not a calendar year, so a leap day does not change the length.
  y: 365 * 86_400_000,
};

/** Parses shorthand durations like "1.5s"/"15m"/"1h"/"30d" into milliseconds.
 * Shared by config/env.ts (which throws on an invalid/missing value at
 * startup) and token.service.ts (which needs the same parsing to compute an
 * access token's expiresAt for the API response, separately from
 * jsonwebtoken's own internal parsing of the same string). `y` is 365 days. */
export function parseDurationMs(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|y)$/.exec(value.trim());
  if (!match) return undefined;
  const milliseconds = Number(match[1]) * UNIT_MS[match[2]]!;
  return Number.isSafeInteger(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
}
