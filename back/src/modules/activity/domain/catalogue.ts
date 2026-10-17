/** Stable codes for the administration journal. Their labels live in the
 * front's admin dictionary (`activity` section), in every site language. */

export const ACTIVITY_CATEGORIES = [
  'catalogue',
  'orders',
  'accounts',
  'loyalty',
  'gift',
  'promotions',
  'shipping',
  'messaging',
  'settings',
  'operations',
  'deploy',
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_ORIGINS = ['admin', 'operator', 'system'] as const;
export type ActivityOrigin = (typeof ACTIVITY_ORIGINS)[number];

export const ACTIVITY_OUTCOMES = ['success', 'failure'] as const;
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];

export const TARGETS_CAP = 200;
export const DETAIL_MAX_BYTES = 8 * 1024;

export const REDACTED_KEY_PATTERN =
  /password|token|secret|authorization|card|cvc|pan|cvv|stripe|cookie|session/i;

export function isActivityCategory(value: unknown): value is ActivityCategory {
  return typeof value === 'string' && (ACTIVITY_CATEGORIES as readonly string[]).includes(value);
}

export function isActivityOrigin(value: unknown): value is ActivityOrigin {
  return typeof value === 'string' && (ACTIVITY_ORIGINS as readonly string[]).includes(value);
}

export function isActivityOutcome(value: unknown): value is ActivityOutcome {
  return typeof value === 'string' && (ACTIVITY_OUTCOMES as readonly string[]).includes(value);
}
