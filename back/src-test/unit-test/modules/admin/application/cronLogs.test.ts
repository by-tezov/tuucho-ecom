import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boundCronLogLines,
  isAdminCronLogKind,
} from '../../../../../src/modules/admin/application/cronLogs.js';

test('accepts the eight journals and rejects anything else', () => {
  assert.equal(isAdminCronLogKind('gift'), true);
  assert.equal(isAdminCronLogKind('gift-purge'), true);
  assert.equal(isAdminCronLogKind('api'), false);
  assert.equal(isAdminCronLogKind('cron-gift'), false);
});

test('bounds the tail the same way as the ops readers', () => {
  assert.equal(boundCronLogLines(undefined), 100);
  assert.equal(boundCronLogLines('100'), 100);
  assert.equal(boundCronLogLines('1'), 1);
  assert.equal(boundCronLogLines('500'), 500);
  assert.equal(boundCronLogLines('501'), 500);
  assert.equal(boundCronLogLines('0'), 1);
  assert.equal(boundCronLogLines('nope'), 100);
});
