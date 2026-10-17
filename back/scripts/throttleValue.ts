/** Largest pause the title bar will apply after an API-triggering click. */
export const MAX_THROTTLE_MS = 60_000;

/** A typed throttle. Values above the cap become the cap. Anything else is ignored. */
export function clampThrottleMs(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return undefined;
  return Math.min(MAX_THROTTLE_MS, Number(trimmed));
}
