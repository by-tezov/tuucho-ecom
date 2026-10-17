import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGuestCompositions } from '../../../../../src/modules/cart/http/compositionRequest.js';

const validNail = {
  productId: 'p1',
  shapeKey: 'almond',
  lengthKey: 'medium',
  finger: 'left-thumb',
  variationKey: 'glossy',
};

test('parseGuestCompositions ignores a non-array body', () => {
  assert.deepEqual(parseGuestCompositions(null), []);
  assert.deepEqual(parseGuestCompositions({}), []);
  assert.deepEqual(parseGuestCompositions('nope'), []);
});

test('parseGuestCompositions keeps shape-safe entries and drops the rest', () => {
  const result = parseGuestCompositions([
    null,
    'skip',
    { size: 'M', quantity: 0, nails: [validNail] },
    { size: '', quantity: 1, nails: [validNail] },
    { size: 'M', quantity: 1, nails: [] },
    {
      size: 'M',
      quantity: 2,
      nails: [
        validNail,
        { productId: 'p2', shapeKey: 'oval', lengthKey: 'short', finger: 'not-a-finger' },
        { productId: '', shapeKey: 'oval', lengthKey: 'short', finger: 'right-thumb' },
        { productId: 'p3', shapeKey: 'square', lengthKey: 'long', finger: 'right-index' },
      ],
    },
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    size: 'M',
    quantity: 2,
    nails: [
      {
        productId: 'p1',
        shapeKey: 'almond',
        lengthKey: 'medium',
        finger: 'left-thumb',
        variationKey: 'glossy',
      },
      {
        productId: 'p3',
        shapeKey: 'square',
        lengthKey: 'long',
        finger: 'right-index',
        variationKey: '',
      },
    ],
  });
});

test('parseGuestCompositions caps the request at twenty compositions', () => {
  const raw = Array.from({ length: 25 }, (_, i) => ({
    size: 'M',
    quantity: 1,
    nails: [{ ...validNail, productId: `p-${i}` }],
  }));
  assert.equal(parseGuestCompositions(raw).length, 20);
});
