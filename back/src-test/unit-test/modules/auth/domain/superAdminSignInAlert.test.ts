import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIdleResume } from '../../../../../src/modules/auth/domain/superAdminSignInAlert.js';

const HOUR = 60 * 60 * 1000;
const now = Date.parse('2026-10-07T12:00:00Z');

test('a refresh by an open tab is not a sign-in', () => {
  assert.equal(isIdleResume('2026-10-07T11:45:00Z', now, HOUR), false);
});

test('a refresh after the idle threshold counts as an automatic sign-in', () => {
  assert.equal(isIdleResume('2026-10-07T11:00:00Z', now, HOUR), true);
  assert.equal(isIdleResume('2026-10-06T08:00:00Z', now, HOUR), true);
});

test('an unreadable issue time never triggers the alert', () => {
  assert.equal(isIdleResume('not a date', now, HOUR), false);
});
