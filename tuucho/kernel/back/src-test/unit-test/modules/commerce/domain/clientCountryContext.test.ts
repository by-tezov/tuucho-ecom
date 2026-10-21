import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientCountryContext,
  buildEffectiveCountries,
  normalizeCountryCode,
} from '../../../../../src/modules/commerce/domain/clientCountryContext.js';

test('country codes are normalized to upper-case ISO 3166-1 alpha-2', () => {
  assert.equal(normalizeCountryCode(' fr '), 'FR');
  assert.equal(normalizeCountryCode('Be'), 'BE');
});

test('anything that is not a two-letter code is rejected, not coerced', () => {
  for (const value of ['FRA', 'F', '', '  ', 'F1', null, undefined]) {
    assert.equal(normalizeCountryCode(value as string | null), null, `${String(value)} must not normalize`);
  }
});

test('effective countries are the union of delivery and geo, without duplicates', () => {
  assert.deepEqual(buildEffectiveCountries('FR', 'BE'), ['FR', 'BE']);
  assert.deepEqual(buildEffectiveCountries('FR', 'FR'), ['FR']);
  assert.deepEqual(buildEffectiveCountries('FR', null), ['FR']);
  assert.deepEqual(buildEffectiveCountries(null, null), []);
});

test('building a context normalizes both inputs first', () => {
  assert.deepEqual(buildClientCountryContext(' fr ', 'be'), {
    deliveryCountry: 'FR',
    geoCountry: 'BE',
    effectiveCountries: ['FR', 'BE'],
  });
  assert.deepEqual(buildClientCountryContext('nope', undefined), {
    deliveryCountry: null,
    geoCountry: null,
    effectiveCountries: [],
  });
});
