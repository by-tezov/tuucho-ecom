import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGalleryItemPubliclyAccessible,
  resolveGalleryFeedStock,
} from '../../../../../src/modules/catalog/application/outOfStockVisibility.js';
import type { GalleryItem } from '../../../../../src/types.js';

function item(shape: Record<string, unknown>, available: GalleryItem['available']): GalleryItem {
  return { shape, available } as unknown as GalleryItem;
}

test('with the Boutique toggle on, the requested stock view is honoured', () => {
  assert.equal(resolveGalleryFeedStock('in', false, true), 'in');
  assert.equal(resolveGalleryFeedStock('out', false, true), 'out');
  assert.equal(resolveGalleryFeedStock(undefined, false, true), 'all');
  assert.equal(resolveGalleryFeedStock('weird', false, true), 'all');
});

test('with the toggle off, browsing is forced to in-stock', () => {
  assert.equal(resolveGalleryFeedStock('out', false, false), 'in');
  assert.equal(resolveGalleryFeedStock(undefined, false, false), 'in');
  assert.equal(resolveGalleryFeedStock('all', false, false), 'in');
});

test('cart hydration by ids still resolves sold-out lines when the toggle is off', () => {
  assert.equal(resolveGalleryFeedStock(undefined, true, false), 'all');
  assert.equal(resolveGalleryFeedStock('out', true, false), 'in', 'an explicit out view is still refused');
});

test('a product with every shape hidden is never public', () => {
  assert.equal(isGalleryItemPubliclyAccessible(item({}, { almond: { medium: { M: 3 } } }), true), false);
});

test('a sold-out product is public only when the toggle is on', () => {
  const soldOut = item({ almond: {} }, { almond: { medium: { M: 0 } } });
  const inStock = item({ almond: {} }, { almond: { medium: { M: 0, L: 1 } } });
  assert.equal(isGalleryItemPubliclyAccessible(soldOut, true), true);
  assert.equal(isGalleryItemPubliclyAccessible(soldOut, false), false);
  assert.equal(isGalleryItemPubliclyAccessible(inStock, false), true);
});
