/** Proves the rung itself works: the real app, the real database, no browser. */
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, resetDatabase } from './support/stack.js';

before(async () => {
  await resetDatabase();
});

test('healthz answers', async () => {
  const response = await api<{ ok: boolean }>('GET', '/healthz');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
});

test('an authenticated route refuses an anonymous caller', async () => {
  const response = await api('GET', '/account/profile');
  assert.equal(response.status, 401);
});

test('the ops surface is not mounted on the public app', async () => {
  const response = await api('POST', '/operation/database-migrate');
  assert.equal(response.status, 404);
});

test('a query reaches a real, empty database', async () => {
  // An empty catalogue is a valid answer; what matters is that the handler
  // reached Postgres and came back, which no unit test can show.
  const response = await api<Record<string, unknown>>('GET', '/gallery/filter-options');
  assert.equal(response.status, 200);
  assert.equal(typeof response.body, 'object');
});
