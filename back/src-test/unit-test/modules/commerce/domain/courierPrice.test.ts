import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPositivePrice,
  parseCourierPriceValue,
  resolveCourierPrice,
  courierPricesEqual,
  readCourierPriceJson,
} from '../../../../../src/modules/commerce/domain/courierPrice.js';
import { roundMoney, shippingFeeForTier } from '../../../../../src/modules/commerce/domain/checkoutMoney.js';

test('roundMoney keeps cents stable', () => {
  assert.equal(roundMoney(13 + 4.99 - 17.99), 0);
  assert.equal(roundMoney(10.129), 10.13);
  assert.equal(roundMoney(10.121), 10.12);
});

test('parseCourierPriceValue accepts scalar and country maps', () => {
  assert.equal(parseCourierPriceValue(4.5), 4.5);
  assert.deepEqual(parseCourierPriceValue({ FR: 5, BE: 6 }), { FR: 5, BE: 6 });
  assert.equal(parseCourierPriceValue({ fr: 5 }), undefined);
  assert.equal(parseCourierPriceValue({ FR: 0 }), undefined);
  assert.equal(parseCourierPriceValue([]), undefined);
});

test('resolveCourierPrice and coverage', () => {
  assert.equal(isPositivePrice(1), true);
  assert.equal(resolveCourierPrice(5, 'FR'), 5);
  assert.equal(resolveCourierPrice({ FR: 5, BE: 6 }, 'BE'), 6);
  assert.equal(resolveCourierPrice({ FR: 5 }, 'DE'), null);
});

test('courierPricesEqual normalizes key order', () => {
  assert.equal(courierPricesEqual({ BE: 2, FR: 1 }, { FR: 1, BE: 2 }), true);
  assert.equal(courierPricesEqual(3, 3), true);
  assert.equal(courierPricesEqual(3, { FR: 3 }), false);
});

test('readCourierPriceJson accepts jsonb shapes', () => {
  assert.equal(readCourierPriceJson(4), 4);
  assert.equal(readCourierPriceJson('4'), 4);
  assert.deepEqual(readCourierPriceJson({ FR: 5 }), { FR: 5 });
  assert.throws(() => readCourierPriceJson('nope'));
});

test('shippingFeeForTier picks express or list', () => {
  assert.deepEqual(shippingFeeForTier(5, 9, false, 'FR'), { ok: true, shippingListFee: 5 });
  assert.deepEqual(shippingFeeForTier(5, 9, true, 'FR'), { ok: true, shippingListFee: 9 });
  assert.deepEqual(shippingFeeForTier(5, null, true, 'FR'), {
    ok: false,
    reason: 'express_unavailable',
  });
  assert.deepEqual(shippingFeeForTier({ FR: 5 }, null, false, 'DE'), {
    ok: false,
    reason: 'shipping_price_unavailable',
  });
});
