import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packedNailQuantity } from '../../../../../src/modules/orders/domain/packetQuantity.js';

test('counts customer-added nail sets only', () => {
  assert.equal(
    packedNailQuantity([
      { product_type: 'nail', quantity: 2 },
      { product_type: 'nail', quantity: 3 },
    ]),
    5,
  );
});

test('accessories ride along but do not size the packet', () => {
  assert.equal(
    packedNailQuantity([
      { product_type: 'nail', quantity: 1 },
      { product_type: 'accessory', quantity: 9 },
    ]),
    1,
  );
});

test('rule gifts count as zero even when they are nail sets', () => {
  assert.equal(
    packedNailQuantity([
      { product_type: 'nail', quantity: 1 },
      { origin: 'rule', product_type: 'nail', quantity: 4 },
    ]),
    1,
  );
});

test('an empty or fully non-counting cart is zero, never NaN', () => {
  assert.equal(packedNailQuantity([]), 0);
  assert.equal(packedNailQuantity([{ origin: 'rule', product_type: 'nail', quantity: 3 }]), 0);
});

test('a composed set counts as one nail set toward the packet', () => {
  assert.equal(
    packedNailQuantity([
      { product_type: 'composition', quantity: 2 },
      { product_type: 'nail', quantity: 1 },
      { product_type: 'nail_single', quantity: 9 },
    ]),
    3,
  );
});
