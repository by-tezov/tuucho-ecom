import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProductUid, PRODUCT_UID_PATTERN } from '../../../../../src/modules/catalog/domain/productUid.js';

test('accepts A-Z, 0-9 and single dashes, including the generated shape', () => {
  assert.match('AQ-YZ-367', PRODUCT_UID_PATTERN);
  assert.match('AA-BB-123-TEST', PRODUCT_UID_PATTERN);
  assert.match('A', PRODUCT_UID_PATTERN);
  assert.match('0', PRODUCT_UID_PATTERN);
  assert.equal(isProductUid('aq-yz-367'), true);
  assert.equal(isProductUid(' aa-bb-123-test '), true);
});

test('rejects dashes in the wrong place, the wrong length, and other characters', () => {
  for (const value of ['', '-A', 'A-', 'A--B', 'A-B-', 'AA-BB-123-TEST-EXTRAS', 'AQ YZ', 'A'.repeat(21)]) {
    assert.equal(isProductUid(value), false, `${value} must not be a product uid`);
  }
  assert.doesNotMatch('aq-yz-367', PRODUCT_UID_PATTERN);
});

test('is anchored, so a uid cannot be smuggled inside a longer string', () => {
  assert.doesNotMatch('/creations/AQ-YZ-367/../../etc', PRODUCT_UID_PATTERN);
  assert.doesNotMatch('AQ-YZ-367\nDROP TABLE products', PRODUCT_UID_PATTERN);
  assert.equal(isProductUid('/creations/AQ-YZ-367/../../etc'), false);
  assert.equal(isProductUid('AQ-YZ-367\nDROP TABLE products'), false);
});
