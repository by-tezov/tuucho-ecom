import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPOSITION_FINGERS,
  COMPOSITION_MAX_NAILS,
  compositionIsAvailable,
  compositionUnitPrice,
  countsAsNailSet,
  missingCompositionFingers,
  validateComposition,
  type CompositionNailInput,
} from '../../../../../src/modules/cart/domain/composition.js';

function nail(
  overrides: Partial<CompositionNailInput> & { finger: string },
): CompositionNailInput {
  return {
    productId: 'p1',
    shapeKey: 'almond',
    lengthKey: 'medium',
    unitPrice: 3.5,
    available: true,
    ...overrides,
  };
}

test('ten fingers are left and right, five each', () => {
  assert.equal(COMPOSITION_FINGERS.length, 10);
  assert.ok(COMPOSITION_FINGERS.includes('left-thumb'));
  assert.ok(COMPOSITION_FINGERS.includes('right-thumb'));
  assert.equal(COMPOSITION_MAX_NAILS, 10);
});

test('missing fingers name empty left and right slots', () => {
  const missing = missingCompositionFingers([
    { finger: 'left-thumb' },
    { finger: 'right-index' },
  ]);
  assert.equal(missing.length, 8);
  assert.ok(missing.includes('left-index'));
  assert.ok(missing.includes('right-thumb'));
  assert.ok(!missing.includes('left-thumb'));
});

test('price is the sum of nail unit prices, rounded to cents', () => {
  assert.equal(
    compositionUnitPrice([{ unitPrice: 3.33 }, { unitPrice: 2.67 }, { unitPrice: 1.1 }]),
    7.1,
  );
  assert.equal(compositionUnitPrice([]), 0);
});

test('unavailable when any nail is false', () => {
  assert.equal(compositionIsAvailable([{ available: true }, { available: true }]), true);
  assert.equal(compositionIsAvailable([{ available: true }, { available: false }]), false);
  assert.equal(compositionIsAvailable([]), false);
});

test('validateComposition accepts a partial hand and reports missing fingers', () => {
  const result = validateComposition('M', [
    nail({ finger: 'left-thumb' }),
    nail({ finger: 'right-thumb', productId: 'p2' }),
  ]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.missingFingers.length, 8);
  }
});

test('a repeated finger is reported even when that nail is also unavailable', () => {
  const result = validateComposition('M', [
    nail({ finger: 'left-thumb' }),
    nail({ finger: 'left-thumb', productId: 'p2', available: false }),
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'duplicate_finger');
});

test('validateComposition blocks empty, duplicate finger, and unavailable', () => {
  const empty = validateComposition('M', []);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.code, 'empty');

  const dup = validateComposition('M', [
    nail({ finger: 'left-thumb' }),
    nail({ finger: 'left-thumb', productId: 'p2' }),
  ]);
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.equal(dup.code, 'duplicate_finger');

  const bad = validateComposition('M', [nail({ finger: 'left-thumb', available: false })]);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.code, 'unavailable');
});

test('validateComposition blocks invalid size and missing finger assignment', () => {
  const size = validateComposition('XL', [nail({ finger: 'left-thumb' })]);
  assert.equal(size.ok, false);
  if (!size.ok) assert.equal(size.code, 'invalid_size');

  const missing = validateComposition('M', [nail({ finger: '' })]);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, 'missing_finger');

  const invalid = validateComposition('M', [nail({ finger: 'thumb' })]);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.code, 'invalid_finger');
});

test('validateComposition blocks more than ten nails', () => {
  const eleven = [
    ...COMPOSITION_FINGERS.map((finger) => nail({ finger })),
    nail({ finger: 'left-thumb', productId: 'extra' }),
  ];
  assert.equal(eleven.length, 11);
  const result = validateComposition('M', eleven);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'too_many');
});

test('validateComposition blocks negative or non-finite nail prices', () => {
  const negative = validateComposition('M', [nail({ finger: 'left-thumb', unitPrice: -0.01 })]);
  assert.equal(negative.ok, false);
  if (!negative.ok) assert.equal(negative.code, 'invalid_price');

  const infinite = validateComposition('M', [nail({ finger: 'left-thumb', unitPrice: Number.POSITIVE_INFINITY })]);
  assert.equal(infinite.ok, false);
  if (!infinite.ok) assert.equal(infinite.code, 'invalid_price');

  const nan = validateComposition('M', [nail({ finger: 'left-thumb', unitPrice: Number.NaN })]);
  assert.equal(nan.ok, false);
  if (!nan.ok) assert.equal(nan.code, 'invalid_price');
});

test('countsAsNailSet treats composition like a catalogue set', () => {
  assert.equal(countsAsNailSet('nail'), true);
  assert.equal(countsAsNailSet('composition'), true);
  assert.equal(countsAsNailSet('accessory'), false);
  assert.equal(countsAsNailSet('nail_single'), false);
});
