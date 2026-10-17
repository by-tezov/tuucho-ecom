import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCursor, encodeCursor } from '../../../../../src/modules/catalog/application/galleryCursor.js';

const ID = '22222222-2222-4222-8222-222222222222';

test('a cursor round-trips, including accented titles', () => {
  const cursor = { sortTitle: 'Été rosé', id: ID };
  const encoded = encodeCursor(cursor);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/, 'URL-safe without escaping');
  assert.deepEqual(decodeCursor(encoded), cursor);
});

test('anything that does not decode to a valid cursor reads as page 1', () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  for (const bad of [
    '',
    '%%%',
    Buffer.from('not json').toString('base64url'),
    encode(null),
    encode({ sortTitle: 'a' }),
    encode({ sortTitle: 1, id: ID }),
    encode({ sortTitle: 'a', id: "1' or 1=1" }),
  ]) {
    assert.equal(decodeCursor(bad), undefined, bad);
  }
});
