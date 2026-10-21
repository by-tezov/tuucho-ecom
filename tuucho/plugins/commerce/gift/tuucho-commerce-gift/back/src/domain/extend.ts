import { receiverCanMutate } from './statuses.js';
import type { GiftStatus } from './statuses.js';

const DAY_MS = 86_400_000;

/** Days the gift cart's "prolonger" button adds to `offer_expires_at`. */
export const GIFT_EXTEND_DAYS = 14;

/** The expiry one click of "prolonger" would produce: two weeks after the
 * current expiry, or after now when that date has already slipped past
 * (the expiry cron has not run yet). */
export function extendedOfferExpiry(current: Date | null, now: Date): Date {
  const from = current && current > now ? current : now;
  return new Date(from.getTime() + GIFT_EXTEND_DAYS * DAY_MS);
}

/** How far out a live promise may ever be parked (`GIFT_EXTEND_CEILING_DAYS`,
 * 60 days). The ceiling rolls with the clock, so the giver can top the offer
 * up again later; it only stops a burst of clicks from keeping the offer, and
 * the PII on it, alive indefinitely. */
export function extendCeiling(now: Date, ceilingDays: number): Date {
  return new Date(now.getTime() + ceilingDays * DAY_MS);
}

/** Published as `canExtend` on the giver payload and re-checked under the
 * row lock before the write, so the button and the route cannot disagree. */
export function canExtendOffer(
  status: GiftStatus,
  offerExpiresAt: Date | null,
  ceilingDays: number,
  now: Date,
): boolean {
  if (!receiverCanMutate(status)) return false;
  return extendedOfferExpiry(offerExpiresAt, now) <= extendCeiling(now, ceilingDays);
}
