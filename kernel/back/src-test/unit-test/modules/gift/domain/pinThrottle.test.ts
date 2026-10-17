import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GIFT_PIN_BACKOFF_MAX_SEC,
  GIFT_PIN_FREE_FAILURES_DEFAULT,
  giftPinBackoffSec,
  giftPinRetryAfterSec,
  giftPinRetryAt,
} from '../../../../../../../plugins/tuucho/commerce/gift/tuucho-commerce-gift/back/src/domain/pinThrottle.js';

test('failures inside the free window cost nothing', () => {
  for (let failed = 0; failed < GIFT_PIN_FREE_FAILURES_DEFAULT; failed += 1) {
    assert.equal(giftPinBackoffSec(failed), 0, `failure ${failed} should be free`);
  }
});

test('the wait doubles from the first non-free failure', () => {
  assert.equal(giftPinBackoffSec(5), 2);
  assert.equal(giftPinBackoffSec(6), 4);
  assert.equal(giftPinBackoffSec(7), 8);
  assert.equal(giftPinBackoffSec(8), 16);
});

test('the wait is capped so an attacker cannot lock the receiver out forever', () => {
  assert.equal(giftPinBackoffSec(100), GIFT_PIN_BACKOFF_MAX_SEC);
  assert.equal(giftPinBackoffSec(1000), GIFT_PIN_BACKOFF_MAX_SEC);
});

test('the free window is env-tunable and never below one', () => {
  // `failedCount` is the number of failures already recorded, so with a free
  // window of 1 the first wrong PIN is free and the second one waits.
  assert.equal(giftPinBackoffSec(0, 1), 0);
  assert.equal(giftPinBackoffSec(1, 1), 2);
  // Clamped to at least one free failure, so a misconfigured 0 cannot throttle
  // a receiver who has not yet typed anything wrong.
  assert.equal(giftPinBackoffSec(0, 0), 0);
  assert.equal(giftPinBackoffSec(1, 0), 2);
  assert.equal(giftPinBackoffSec(9, 10), 0);
  assert.equal(giftPinBackoffSec(10, 10), 2);
});

test('no backoff means no retry timestamp at all', () => {
  assert.equal(giftPinRetryAt(new Date('2026-01-01T00:00:00Z'), 0), null);
  assert.equal(giftPinRetryAt(new Date('2026-01-01T00:00:00Z'), -5), null);
});

test('a retry timestamp is the backoff added to the attempt time', () => {
  const at = giftPinRetryAt(new Date('2026-01-01T00:00:00Z'), 8);
  assert.equal(at?.toISOString(), '2026-01-01T00:00:08.000Z');
});

test('retry-after rounds up and never goes negative', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(giftPinRetryAfterSec(new Date('2026-01-01T00:00:07.100Z'), now), 8);
  assert.equal(giftPinRetryAfterSec(new Date('2025-12-31T23:59:00Z'), now), 0);
  assert.equal(giftPinRetryAfterSec(null, now), 0);
  assert.equal(giftPinRetryAfterSec(undefined, now), 0);
});
