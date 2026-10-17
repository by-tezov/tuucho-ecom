import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGiftPerNailSetParams,
  parseNailQtyPercentTierParams,
  parseFreeShippingAboveParams,
} from '../../../../../../../plugins/tuucho/commerce/cart-rules/tuucho-commerce-cart-rules/back/src/cartRuleEvaluation.js';
import { formatIntegrityToken } from '../../../../../src/modules/commerce/domain/integrityToken.js';
import { CHECKOUT_FAILURE_STATUS } from '../../../../../src/modules/commerce/application/checkoutFailureStatus.js';

test('parseGiftPerNailSetParams requires uid and positive qty', () => {
  assert.deepEqual(parseGiftPerNailSetParams({ productUid: ' uid ', qtyPerNailSetUnit: 2, minNails: 5 }), {
    productUid: 'uid',
    qtyPerNailSetUnit: 2,
    minNails: 5,
  });
  assert.throws(() => parseGiftPerNailSetParams({ productUid: '', qtyPerNailSetUnit: 1, minNails: 5 }));
  assert.throws(() => parseGiftPerNailSetParams({ productUid: 'x', qtyPerNailSetUnit: 0, minNails: 5 }));
});

test('parseNailQtyPercentTierParams requires a non-empty tier list', () => {
  assert.deepEqual(parseNailQtyPercentTierParams({ minNails: 5, tiers: [{ minQty: 2, percent: 10 }] }), {
    minNails: 5,
    tiers: [{ minQty: 2, percent: 10 }],
  });
  assert.throws(() => parseNailQtyPercentTierParams({ tiers: [] }));
  assert.throws(() => parseNailQtyPercentTierParams({}));
});

test('parseFreeShippingAboveParams requires country thresholds', () => {
  assert.deepEqual(parseFreeShippingAboveParams({ thresholdsByCountry: { FR: 50 } }), {
    thresholdsByCountry: { FR: 50 },
  });
  assert.throws(() => parseFreeShippingAboveParams({ thresholdsByCountry: { FR: -1 } }));
});

test('formatIntegrityToken groups the first 16 hex chars', () => {
  assert.equal(formatIntegrityToken('abcdef0123456789zzzz'), 'ABCD-EF01-2345-6789');
});

test('CHECKOUT_FAILURE_STATUS maps known reasons', () => {
  assert.equal(CHECKOUT_FAILURE_STATUS.voucher_user_not_allowed, 403);
  assert.equal(CHECKOUT_FAILURE_STATUS.address_not_found, 404);
  assert.equal(CHECKOUT_FAILURE_STATUS.payment_method_not_available, 409);
});
