import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  desiredGiftQuantities,
  evaluateCartRules,
  giftRuleProductUid,
  parseFreeShippingAboveParams,
  parseGiftPerNailSetParams,
  parseNailQtyPercentTierParams,
  validateAndNormalizeParams,
  type CartRuleRow,
} from '../../../../../src/modules/commerce/domain/cartRuleEvaluation.js';
import { formatIntegrityToken } from '../../../../../src/modules/commerce/domain/integrityToken.js';
import { roundMoney, shippingFeeForTier } from '../../../../../src/modules/commerce/domain/checkoutMoney.js';

test('parseGiftPerNailSetParams requires uid, positive qty and 1 to 10 nails', () => {
  assert.deepEqual(
    parseGiftPerNailSetParams({ productUid: ' tip ', qtyPerNailSetUnit: 2, minNails: 5 }),
    { productUid: 'tip', qtyPerNailSetUnit: 2, minNails: 5 },
  );
  assert.throws(() => parseGiftPerNailSetParams({ productUid: '', qtyPerNailSetUnit: 1, minNails: 5 }));
  assert.throws(() => parseGiftPerNailSetParams({ productUid: 'tip', qtyPerNailSetUnit: 1, minNails: 0 }));
  assert.throws(() => parseGiftPerNailSetParams({ productUid: 'tip', qtyPerNailSetUnit: 1, minNails: 11 }));
});

test('parseNailQtyPercentTierParams sorts and rejects duplicates', () => {
  assert.deepEqual(
    parseNailQtyPercentTierParams({
      minNails: 5,
      tiers: [
        { minQty: 4, percent: 20 },
        { minQty: 2, percent: 10 },
      ],
    }),
    {
      minNails: 5,
      tiers: [
        { minQty: 2, percent: 10 },
        { minQty: 4, percent: 20 },
      ],
    },
  );
  assert.throws(() =>
    parseNailQtyPercentTierParams({
      tiers: [
        { minQty: 2, percent: 10 },
        { minQty: 2, percent: 15 },
      ],
    }),
  );
});

test('parseFreeShippingAboveParams normalizes country codes', () => {
  assert.deepEqual(parseFreeShippingAboveParams({ thresholdsByCountry: { fr: 50 } }), {
    thresholdsByCountry: { FR: 50 },
  });
  assert.throws(() =>
    parseFreeShippingAboveParams({
      thresholdsByCountry: { FR: 50 },
      thresholdsByCourier: { mondial: 40 },
    }),
  );
});

test('validateAndNormalizeParams dispatches by kind', () => {
  assert.deepEqual(
    validateAndNormalizeParams('gift_per_nail_set', {
      productUid: 'a',
      qtyPerNailSetUnit: 1,
      minNails: 5,
    }),
    {
      productUid: 'a',
      qtyPerNailSetUnit: 1,
      minNails: 5,
    },
  );
});

test('giftRuleProductUid reads the gift product', () => {
  assert.equal(
    giftRuleProductUid({
      kind: 'gift_per_nail_set',
      params: { productUid: 'KIT', qtyPerNailSetUnit: 1, minNails: 5 },
    }),
    'KIT',
  );
  assert.equal(
    giftRuleProductUid({
      kind: 'free_shipping_above',
      params: { thresholdsByCountry: { FR: 50 } },
    }),
    null,
  );
});

test('evaluateCartRules applies tier discount and free shipping', () => {
  const rules: CartRuleRow[] = [
    {
      id: '1',
      code: 'vol',
      kind: 'nail_qty_percent_tiers',
      enabled: true,
      priority: 1,
      forbid_voucher: true,
      params: { tiers: [{ minQty: 2, percent: 10 }], minNails: 5 },
    },
    {
      id: '2',
      code: 'fs',
      kind: 'free_shipping_above',
      enabled: true,
      priority: 2,
      forbid_voucher: false,
      params: { thresholdsByCountry: { FR: 50 } },
    },
  ];
  const state = evaluateCartRules({
    rules,
    nailLines: [{ quantity: 2, lineTotal: 100 }],
    merchandiseSubtotal: 100,
    shippingListFee: 8,
    countryCode: 'fr',
    compositions: [
      { quantity: 1, nailCount: 5, lineTotal: 40 },
      { quantity: 1, nailCount: 4, lineTotal: 30 },
    ],
    giftLines: [],
  });
  assert.equal(state.nailQtyTier?.nailQty, 3);
  assert.equal(state.rulesItemDiscount, 14);
  assert.equal(state.nailQtyTier?.matched?.percent, 10);
  assert.equal(state.forbidVoucher, true);
  assert.equal(state.freeShipping?.applied, true);
  assert.equal(state.shippingFee, 0);
});

test('roundMoney and shippingFeeForTier resolve country prices', () => {
  assert.equal(roundMoney(10.126), 10.13);
  assert.deepEqual(shippingFeeForTier({ FR: 5 }, null, false, 'FR'), {
    ok: true,
    shippingListFee: 5,
  });
  assert.deepEqual(shippingFeeForTier({ FR: 5 }, null, true, 'FR'), {
    ok: false,
    reason: 'express_unavailable',
  });
  assert.deepEqual(shippingFeeForTier({ FR: 5 }, { FR: 9 }, true, 'FR'), {
    ok: true,
    shippingListFee: 9,
  });
});

test('formatIntegrityToken groups the first 16 hex chars', () => {
  assert.equal(formatIntegrityToken('abcd1234efgh5678zzzz'), 'ABCD-1234-EFGH-5678');
});

function giftRule(code: string, params: unknown, priority = 10, enabled = true) {
  return { code, kind: 'gift_per_nail_set' as const, enabled, priority, params };
}

const tipPot = { productUid: 'KIT', qtyPerNailSetUnit: 1, minNails: 5 };

test('desiredGiftQuantities: a short composed set does not count', () => {
  const rules = [giftRule('tip-pot', tipPot)];
  assert.deepEqual(
    desiredGiftQuantities(rules, { setUnits: 0, compositions: [{ quantity: 3, nailCount: 4 }] }),
    [],
  );
});

test('desiredGiftQuantities: catalogue sets and composed sets of minNails add on one rule', () => {
  const rules = [giftRule('tip-pot', tipPot)];
  const compositions = [
    { quantity: 2, nailCount: 5 },
    { quantity: 1, nailCount: 4 },
  ];
  assert.deepEqual(desiredGiftQuantities(rules, { setUnits: 1, compositions }), [
    { productUid: 'KIT', quantity: 3, ruleCode: 'tip-pot' },
  ]);
});

test('desiredGiftQuantities: two rules giving the same kit add up under the first by priority', () => {
  const rules = [
    giftRule('tip-pot', tipPot, 10),
    giftRule('tip-pot-extra', { productUid: 'kit', qtyPerNailSetUnit: 1, minNails: 5 }, 11),
    { ...giftRule('off', { productUid: 'KIT', qtyPerNailSetUnit: 5, minNails: 5 }), enabled: false },
  ];
  assert.deepEqual(
    desiredGiftQuantities(rules, { setUnits: 1, compositions: [{ quantity: 1, nailCount: 10 }] }),
    [{ productUid: 'KIT', quantity: 4, ruleCode: 'tip-pot' }],
  );
});
