import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsParkedDefaultCart } from '../../../../../src/modules/cart/application/ensureParkedDefaultCart.js';

test('an active non-default cart with no default row needs one parked', () => {
  assert.equal(
    needsParkedDefaultCart([
      { kind: 'custom', is_active: true },
      { kind: 'wishlist', is_active: false },
    ]),
    true,
  );
});

test('an empty inactive default is already the way back', () => {
  assert.equal(
    needsParkedDefaultCart([
      { kind: 'custom', is_active: true },
      { kind: 'default', is_active: false },
    ]),
    false,
  );
});

test('the selected default cart does not get a second default', () => {
  assert.equal(needsParkedDefaultCart([{ kind: 'default', is_active: true }]), false);
});

test('an account with no carts stays without a default until something creates one', () => {
  assert.equal(needsParkedDefaultCart([]), false);
});
