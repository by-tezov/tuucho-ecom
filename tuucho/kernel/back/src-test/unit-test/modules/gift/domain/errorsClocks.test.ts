import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GiftFailure, failGift, giftHttpStatus } from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/domain/errors.js';
import { addDays, addHours, utcDayKey } from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/application/clocks.js';

test('giftHttpStatus maps known codes', () => {
  assert.equal(giftHttpStatus('gift_gone'), 410);
  assert.equal(giftHttpStatus('gift_pin_throttled'), 429);
  assert.equal(giftHttpStatus('not_found'), 404);
  assert.equal(giftHttpStatus('invalid_request'), 400);
});

test('failGift throws GiftFailure with status', () => {
  assert.throws(
    () => failGift('gift_frozen', { x: 1 }),
    (error: unknown) =>
      error instanceof GiftFailure && error.code === 'gift_frozen' && error.httpStatus === 409,
  );
});

test('gift clocks advance by hours and days', () => {
  const from = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(addHours(from, 2).toISOString(), '2026-01-01T02:00:00.000Z');
  assert.equal(addDays(from, 1).toISOString(), '2026-01-02T00:00:00.000Z');
  assert.equal(utcDayKey(from), '2026-01-01');
});
