import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_UID_PATTERN } from '../../../../../src/modules/catalog/domain/productUid.js';

test('accepts the manager-issued LL-LL-DDD shape, either case', () => {
  assert.match('AQ-YZ-367', PRODUCT_UID_PATTERN);
  assert.match('aq-yz-367', PRODUCT_UID_PATTERN);
});

test('rejects anything that is not exactly that shape', () => {
  for (const value of ['AQYZ367', 'A-YZ-367', 'AQ-YZ-36', 'AQ-YZ-3670', 'AQ-Y1-367', '', 'AQ-YZ-367 ']) {
    assert.doesNotMatch(value, PRODUCT_UID_PATTERN, `${value} must not be a product uid`);
  }
});

test('is anchored, so a uid cannot be smuggled inside a longer string', () => {
  assert.doesNotMatch('/creations/AQ-YZ-367/../../etc', PRODUCT_UID_PATTERN);
  assert.doesNotMatch('AQ-YZ-367\nDROP TABLE products', PRODUCT_UID_PATTERN);
});
