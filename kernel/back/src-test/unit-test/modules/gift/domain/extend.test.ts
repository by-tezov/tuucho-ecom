import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GIFT_EXTEND_DAYS,
  canExtendOffer,
  extendCeiling,
  extendedOfferExpiry,
} from '../../../../../../../plugins/tuucho/commerce/gift/tuucho-commerce-gift/back/src/domain/extend.js';
import { GIFT_STATUSES } from '../../../../../../../plugins/tuucho/commerce/gift/tuucho-commerce-gift/back/src/domain/statuses.js';

const DAY = 86_400_000;
const NOW = new Date('2026-10-01T12:00:00.000Z');

test('extending adds two weeks to a future expiry', () => {
  const current = new Date(NOW.getTime() + 3 * DAY);
  assert.equal(extendedOfferExpiry(current, NOW).getTime(), current.getTime() + GIFT_EXTEND_DAYS * DAY);
});

test('an already-lapsed or missing expiry extends from now', () => {
  const lapsed = new Date(NOW.getTime() - DAY);
  assert.equal(extendedOfferExpiry(lapsed, NOW).getTime(), NOW.getTime() + GIFT_EXTEND_DAYS * DAY);
  assert.equal(extendedOfferExpiry(null, NOW).getTime(), NOW.getTime() + GIFT_EXTEND_DAYS * DAY);
});

test('the ceiling rolls with the clock', () => {
  assert.equal(extendCeiling(NOW, 60).getTime(), NOW.getTime() + 60 * DAY);
});

test('extension is allowed until it would pass the ceiling', () => {
  const ceilingDays = 60;
  const lastAllowed = new Date(NOW.getTime() + (ceilingDays - GIFT_EXTEND_DAYS) * DAY);
  assert.equal(canExtendOffer('selecting', lastAllowed, ceilingDays, NOW), true, 'landing on the ceiling is fine');
  const oneMsLater = new Date(lastAllowed.getTime() + 1);
  assert.equal(canExtendOffer('selecting', oneMsLater, ceilingDays, NOW), false);
});

test('a burst of clicks cannot park the offer past the ceiling', () => {
  let expiry: Date | null = null;
  let clicks = 0;
  while (canExtendOffer('selecting', expiry, 60, NOW)) {
    expiry = extendedOfferExpiry(expiry, NOW);
    clicks += 1;
  }
  assert.equal(clicks, Math.floor(60 / GIFT_EXTEND_DAYS));
  assert.ok(expiry!.getTime() <= extendCeiling(NOW, 60).getTime());
});

test('only an offer the receiver can still change may be extended', () => {
  for (const status of GIFT_STATUSES) {
    assert.equal(canExtendOffer(status, null, 60, NOW), status === 'selecting', status);
  }
});
