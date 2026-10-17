/** Soft PIN brute-force brake: N free fails (env `GIFT_PIN_FAILURES`'s first half), then exponential wait. */

export const GIFT_PIN_FREE_FAILURES_DEFAULT = 5;
/** Delay before the next try after the free window (seconds). */
const GIFT_PIN_BACKOFF_BASE_SEC = 2;
/** Cap so a long session does not lock forever (5 minutes). */
export const GIFT_PIN_BACKOFF_MAX_SEC = 300;

/**
 * Wait required *before the next attempt* after `failedCount` wrong PINs.
 * Failures before `freeFailures`: 0. From that failure onward: 2, 4, 8, … capped.
 */
export function giftPinBackoffSec(
  failedCount: number,
  freeFailures: number = GIFT_PIN_FREE_FAILURES_DEFAULT,
): number {
  const free = Math.max(1, Math.floor(freeFailures));
  if (failedCount < free) return 0;
  const exp = failedCount - free;
  const sec = GIFT_PIN_BACKOFF_BASE_SEC * 2 ** exp;
  return Math.min(GIFT_PIN_BACKOFF_MAX_SEC, sec);
}

export function giftPinRetryAt(from: Date, backoffSec: number): Date | null {
  if (backoffSec <= 0) return null;
  return new Date(from.getTime() + backoffSec * 1000);
}

export function giftPinRetryAfterSec(nextAllowedAt: Date | null | undefined, now = new Date()): number {
  if (!nextAllowedAt) return 0;
  const ms = nextAllowedAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 1000);
}
