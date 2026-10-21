import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOT_DURATION_MONTHS,
  LOT_DURATION_MONTH_OPTIONS,
  expiresAtFromGrantedAt,
  expiryMonthsForLotDuration,
  isLotDurationMonths,
  nextExpiryDateAfter,
  parisLocalToUtc,
} from '../../../../../../../plugins/commerce/loyalty/tuucho-commerce-loyalty/back/src/domain/expiryCalendar.js';

test('every allowed lot duration divides the year evenly', () => {
  for (const months of LOT_DURATION_MONTH_OPTIONS) {
    assert.equal(12 % months, 0, `${months} does not tile the year`);
    assert.equal(isLotDurationMonths(months), true);
  }
});

test('durations outside the allowed set are rejected', () => {
  for (const value of [0, 5, 7, 8, 9, 10, 11, 13, -6, 1.5]) {
    assert.equal(isLotDurationMonths(value), false, `${value} must not be a lot duration`);
  }
});

test('expiry months are anchored on March and stepped by the duration', () => {
  assert.deepEqual(expiryMonthsForLotDuration(12), [3]);
  assert.deepEqual(expiryMonthsForLotDuration(6), [3, 9]);
  assert.deepEqual(expiryMonthsForLotDuration(4), [3, 7, 11]);
  assert.deepEqual(expiryMonthsForLotDuration(3), [3, 6, 9, 12]);
  assert.deepEqual(expiryMonthsForLotDuration(1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('an invalid duration falls back to the default rather than producing no dates', () => {
  assert.deepEqual(expiryMonthsForLotDuration(7), expiryMonthsForLotDuration(DEFAULT_LOT_DURATION_MONTHS));
  assert.ok(expiryMonthsForLotDuration(7).length > 0);
});

test('Paris midnight maps to the right UTC instant on both sides of DST', () => {
  // Winter: Paris is UTC+1, so local midnight is 23:00 UTC the day before.
  assert.equal(parisLocalToUtc(2026, 3, 1).toISOString(), '2026-02-28T23:00:00.000Z');
  // Summer: Paris is UTC+2, so local midnight is 22:00 UTC the day before.
  assert.equal(parisLocalToUtc(2026, 9, 1).toISOString(), '2026-08-31T22:00:00.000Z');
});

test('credit expires at the first configured date at least a full duration away', () => {
  // Granted January 2026 with a 6-month life: 6 months lands in July, and the
  // next configured month at or after that is September.
  const expiry = expiresAtFromGrantedAt(new Date('2026-01-15T10:00:00Z'), 6);
  assert.equal(expiry.toISOString(), '2026-08-31T22:00:00.000Z');
});

test('credit never expires earlier than its full duration', () => {
  for (const duration of LOT_DURATION_MONTH_OPTIONS) {
    const grantedAt = new Date('2026-02-27T12:00:00Z');
    const earliest = new Date(grantedAt);
    earliest.setUTCMonth(earliest.getUTCMonth() + duration);
    const expiry = expiresAtFromGrantedAt(grantedAt, duration);
    assert.ok(
      expiry.getTime() >= earliest.getTime(),
      `${duration}-month lot expired at ${expiry.toISOString()}, before ${earliest.toISOString()}`,
    );
  }
});

test('a twelve-month lot always lands on a 1 March', () => {
  const expiry = expiresAtFromGrantedAt(new Date('2026-04-01T00:00:00Z'), 12);
  assert.equal(expiry.toISOString(), '2028-02-29T23:00:00.000Z');
});

test('the next expiry date is strictly in the future', () => {
  const now = new Date('2026-09-01T00:00:00Z');
  const next = nextExpiryDateAfter(6, now);
  assert.ok(next.getTime() > now.getTime());
  // 1 September 2026 Paris midnight has already passed at 00:00 UTC that day,
  // so the next one is the following March.
  assert.equal(next.toISOString(), '2027-02-28T23:00:00.000Z');
});

test('an invalid duration still yields a future expiry date', () => {
  const now = new Date('2026-05-01T00:00:00Z');
  assert.ok(nextExpiryDateAfter(7, now).getTime() > now.getTime());
});
