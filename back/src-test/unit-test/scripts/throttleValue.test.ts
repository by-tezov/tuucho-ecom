import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampThrottleMs, MAX_THROTTLE_MS } from '../../../scripts/throttleValue.js';

test('throttle text is a millisecond count, capped, and 0 stays off', () => {
  assert.equal(clampThrottleMs('0'), 0);
  assert.equal(clampThrottleMs(' 400 '), 400);
  assert.equal(clampThrottleMs('00050'), 50);
  assert.equal(clampThrottleMs(String(MAX_THROTTLE_MS + 1)), MAX_THROTTLE_MS);
  assert.equal(clampThrottleMs(''), undefined);
  assert.equal(clampThrottleMs('12ms'), undefined);
  assert.equal(clampThrottleMs('-1'), undefined);
  assert.equal(clampThrottleMs('123456'), undefined);
});
