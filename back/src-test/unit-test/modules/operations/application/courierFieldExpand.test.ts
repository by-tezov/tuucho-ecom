import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compactBooleanMap,
  compactValueMap,
  expandCountries,
  expandCustodyTime,
  expandDeliveryTime,
  expandPriceOverCountries,
} from '../../../../../src/modules/operations/application/courierFieldExpand.js';

const VOCAB = ['BE', 'DE', 'FR'];
const VOCAB_SET = new Set(VOCAB);

test('countries: a boolean scalar covers the whole vocabulary', () => {
  assert.deepEqual(expandCountries(true, VOCAB), { BE: true, DE: true, FR: true });
  assert.deepEqual(expandCountries(false, VOCAB), { BE: false, DE: false, FR: false });
});

test('countries: default plus overrides', () => {
  assert.deepEqual(expandCountries({ default: false, FR: true }, VOCAB), { BE: false, DE: false, FR: true });
});

test('countries: a map without default lists only its keys', () => {
  assert.deepEqual(expandCountries({ FR: true, BE: false }, VOCAB), { FR: true, BE: false });
});

test('countries: legacy array and legacy { enabled } shapes still import', () => {
  assert.deepEqual(expandCountries(['FR', 'BE'], VOCAB), { FR: true, BE: true });
  assert.deepEqual(expandCountries({ FR: { enabled: true }, BE: { enabled: false } }, VOCAB), {
    FR: true,
    BE: false,
  });
});

test('countries: unknown or malformed codes are refused', () => {
  assert.throws(() => expandCountries(['XX'], VOCAB), /not declared/);
  assert.throws(() => expandCountries(['fr'], VOCAB), /ISO country codes/);
  assert.throws(() => expandCountries({ fr: true }, VOCAB), /not a valid ISO/);
  assert.throws(() => expandCountries([], VOCAB), /at least one/);
  assert.throws(() => expandCountries({}, VOCAB), /must not be empty/);
  assert.throws(() => expandCountries({ FR: 'yes' }, VOCAB), /invalid value/);
});

test('compactBooleanMap round-trips through expandCountries', () => {
  const cases: Record<string, boolean>[] = [
    { BE: true, DE: true, FR: true },
    { BE: false, DE: false, FR: false },
    { BE: false, DE: true, FR: true },
    { BE: true, DE: false, FR: false },
    { FR: true },
    { FR: false, BE: true },
  ];
  for (const expanded of cases) {
    const compact = compactBooleanMap(expanded, VOCAB);
    assert.deepEqual(expandCountries(compact, VOCAB), expanded, JSON.stringify(compact));
  }
  assert.equal(compactBooleanMap({ BE: true, DE: true, FR: true }, VOCAB), true);
});

test('compactValueMap picks a scalar when uniform, else the most frequent default', () => {
  const eq = (a: number, b: number) => a === b;
  assert.equal(compactValueMap({ FR: 5, BE: 5 }, eq), 5);
  assert.deepEqual(compactValueMap({ FR: 5, BE: 6, DE: 6 }, eq), { default: 6, FR: 5 });
  assert.throws(() => compactValueMap({}, eq), /empty/);
});

test('price: scalar and uniform default collapse to one number', () => {
  assert.equal(expandPriceOverCountries(4.9, VOCAB, 'price', VOCAB_SET), 4.9);
  assert.equal(expandPriceOverCountries({ default: 4.9 }, VOCAB, 'price', VOCAB_SET), 4.9);
  assert.equal(
    expandPriceOverCountries({ BE: 3, DE: 3, FR: 3 }, VOCAB, 'price', VOCAB_SET),
    3,
    'a listed map covering everything at one price is a scalar',
  );
});

test('price: overrides produce a per-country map', () => {
  assert.deepEqual(expandPriceOverCountries({ default: 5, FR: 4 }, VOCAB, 'price', VOCAB_SET), {
    BE: 5,
    DE: 5,
    FR: 4,
  });
});

test('price: a listed map may leave countries unpriced', () => {
  assert.deepEqual(expandPriceOverCountries({ FR: 4 }, VOCAB, 'price', VOCAB_SET), { FR: 4 });
});

test('price: zero, negative and non-numeric prices are refused', () => {
  assert.throws(() => expandPriceOverCountries(0, VOCAB, 'price', VOCAB_SET));
  assert.throws(() => expandPriceOverCountries({ FR: -1 }, VOCAB, 'price', VOCAB_SET), /invalid value/);
  assert.throws(() => expandPriceOverCountries({ default: '5' }, VOCAB, 'price', VOCAB_SET), /default/);
  assert.throws(() => expandPriceOverCountries({ XX: 5 }, VOCAB, 'price', VOCAB_SET), /not declared/);
});

test('delivery time must cover every country with a valid range', () => {
  assert.deepEqual(expandDeliveryTime({ min: 2, max: 3 }, ['FR', 'BE'], 'dt', VOCAB_SET), {
    FR: { min: 2, max: 3 },
    BE: { min: 2, max: 3 },
  });
  assert.throws(() => expandDeliveryTime({ FR: { min: 2, max: 3 } }, ['FR', 'BE'], 'dt', VOCAB_SET), /BE/);
  assert.throws(() => expandDeliveryTime({ min: 3, max: 2 }, ['FR'], 'dt', VOCAB_SET));
  assert.throws(() => expandDeliveryTime({ min: 0, max: 2 }, ['FR'], 'dt', VOCAB_SET));
});

test('custody time: listed countries only, or everyone with a default', () => {
  assert.deepEqual(expandCustodyTime({ FR: 10 }, VOCAB, 'custody', VOCAB_SET), { FR: 10 });
  assert.deepEqual(expandCustodyTime(14, ['FR', 'BE'], 'custody', VOCAB_SET), { FR: 14, BE: 14 });
  assert.throws(() => expandCustodyTime(1.5, ['FR'], 'custody', VOCAB_SET));
});
