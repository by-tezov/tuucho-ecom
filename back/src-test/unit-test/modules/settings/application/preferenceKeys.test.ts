import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allKeys,
  defaultForKey,
  parseBool,
  shopPaymentKey,
  shopSignInKey,
  shopSignInVerboseKey,
  type ShopPaymentMethod,
  type ShopSignInMethod,
} from '../../../../../src/modules/settings/application/preferenceKeys.js';

const PAYMENT_METHODS: ShopPaymentMethod[] = ['card', 'paypal', 'bancontact', 'google_pay', 'apple_pay'];
const SIGN_IN_METHODS: ShopSignInMethod[] = ['google', 'facebook', 'apple'];

test('preference keys are unique', () => {
  const keys = allKeys();
  assert.equal(new Set(keys).size, keys.length);
});

test('every payment and sign-in key is a known preference', () => {
  const keys = new Set(allKeys());
  for (const method of PAYMENT_METHODS) assert.ok(keys.has(shopPaymentKey(method)), method);
  for (const method of SIGN_IN_METHODS) {
    assert.ok(keys.has(shopSignInKey(method)), method);
    assert.ok(keys.has(shopSignInVerboseKey(method)), method);
  }
});

test('each method maps to its own key', () => {
  assert.equal(new Set(PAYMENT_METHODS.map(shopPaymentKey)).size, PAYMENT_METHODS.length);
  assert.equal(new Set(SIGN_IN_METHODS.map(shopSignInKey)).size, SIGN_IN_METHODS.length);
});

test('payment methods, sign-in providers and relaxed rate limits fail closed', () => {
  for (const method of PAYMENT_METHODS) assert.equal(defaultForKey(shopPaymentKey(method)), false, method);
  for (const method of SIGN_IN_METHODS) {
    assert.equal(defaultForKey(shopSignInKey(method)), false, method);
    assert.equal(defaultForKey(shopSignInVerboseKey(method)), false, method);
  }
  assert.equal(defaultForKey('relax_rate_limits'), false);
});

test('the composition page stays off until an admin turns it on', () => {
  assert.equal(defaultForKey('composition_page_enabled'), false);
  assert.ok(allKeys().includes('composition_page_enabled'));
});

test('parseBool accepts a boolean or an { enabled } wrapper only', () => {
  assert.equal(parseBool(true), true);
  assert.equal(parseBool(false), false);
  assert.equal(parseBool({ enabled: false }), false);
  assert.equal(parseBool({ enabled: 'false' }), undefined);
  assert.equal(parseBool('true'), undefined);
  assert.equal(parseBool(1), undefined);
  assert.equal(parseBool(null), undefined);
});
