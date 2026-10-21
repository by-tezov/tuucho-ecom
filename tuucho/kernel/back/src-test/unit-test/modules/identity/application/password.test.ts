import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLegacyPasswordHash, rewriteLegacyPasswordHash } from '../../../../../src/modules/identity/application/password.js';

test('legacy prefixes are leftover scrypt encodings', () => {
  assert.equal(isLegacyPasswordHash('scrypt$16384$8$1$aa$bb'), true);
  assert.equal(isLegacyPasswordHash('scryptp1$16384$8$1$aa$bb'), true);
  assert.equal(isLegacyPasswordHash('$argon2id$v=19$m=19456,t=2,p=1$aa$bb'), false);
});

test('rewriteLegacyPasswordHash skips current argon2id rows', async () => {
  let wrote = 0;
  await rewriteLegacyPasswordHash('$argon2id$v=19$m=19456,t=2,p=1$aa$bb', 'AnyPass1!', async () => {
    wrote += 1;
  });
  assert.equal(wrote, 0);
});

test('rewriteLegacyPasswordHash writes argon2id for a leftover scrypt prefix', async () => {
  let next = '';
  await rewriteLegacyPasswordHash('scryptp1$16384$8$1$aa$bb', 'AnyPass1!', async (hash) => {
    next = hash;
  });
  assert.match(next, /^\$argon2id\$/);
});
