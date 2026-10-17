import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLockReason } from '../../../../../src/modules/identity/domain/accountLock.js';

test('a reason is trimmed and kept', () => {
  assert.equal(normalizeLockReason('  Fraude suspectée  '), 'Fraude suspectée');
});

test('a reason shorter than three characters is rejected', () => {
  assert.equal(normalizeLockReason('ab'), null);
  assert.equal(normalizeLockReason('   a   '), null);
  assert.equal(normalizeLockReason(''), null);
});

test('a reason longer than 500 characters is rejected rather than truncated', () => {
  assert.equal(normalizeLockReason('x'.repeat(500))?.length, 500);
  assert.equal(normalizeLockReason('x'.repeat(501)), null);
});

test('a non-string reason is rejected', () => {
  for (const value of [null, undefined, 42, {}, []]) {
    assert.equal(normalizeLockReason(value), null, `${JSON.stringify(value)} must not normalize`);
  }
});
