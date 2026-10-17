import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDurationMs } from '../../../src/utils/duration.js';

test('shorthand durations parse to milliseconds', () => {
  assert.equal(parseDurationMs('250ms'), 250);
  assert.equal(parseDurationMs('1.5s'), 1500);
  assert.equal(parseDurationMs('15m'), 900_000);
  assert.equal(parseDurationMs(' 1h '), 3_600_000);
  assert.equal(parseDurationMs('30d'), 2_592_000_000);
  assert.equal(parseDurationMs('1y'), 365 * 86_400_000);
});

test('invalid, zero and fractional-ms durations are refused', () => {
  for (const value of ['', '15', 'm', '1w', '-1s', '0s', '1.5ms', '1 h', '1H']) {
    assert.equal(parseDurationMs(value), undefined, value);
  }
});
