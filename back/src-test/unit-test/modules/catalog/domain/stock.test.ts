import { test } from 'node:test';
import assert from 'node:assert/strict';
import { galleryItemHasPurchasableStock } from '../../../../../src/modules/catalog/domain/stock.js';

test('one purchasable size anywhere makes the set in stock', () => {
  assert.equal(galleryItemHasPurchasableStock({ almond: { short: { M: 1 } } }), true);
  assert.equal(
    galleryItemHasPurchasableStock({ almond: { short: { S: 0 } }, square: { long: { L: 2 } } }),
    true,
  );
});

test('all-zero and empty shapes are out of stock', () => {
  assert.equal(galleryItemHasPurchasableStock({}), false);
  assert.equal(galleryItemHasPurchasableStock({ almond: {} }), false);
  assert.equal(galleryItemHasPurchasableStock({ almond: { short: {} } }), false);
  assert.equal(galleryItemHasPurchasableStock({ almond: { short: { S: 0, M: 0 } } }), false);
});

test('a missing quantity is treated as none, not as available', () => {
  assert.equal(galleryItemHasPurchasableStock({ almond: { short: { S: undefined } } }), false);
});

test('a negative quantity never reads as purchasable', () => {
  assert.equal(galleryItemHasPurchasableStock({ almond: { short: { S: -3 } } }), false);
});
