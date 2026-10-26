import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  desiredGiftQuantities,
  evaluateCartRules,
  parseGiftPerNailSetParams,
  parseNailQtyPercentTierParams,
  type CartRuleRow,
} from '../../../../../../../plugins/commerce/cart-rules/tuucho-commerce-cart-rules/back/src/cartRuleEvaluation.js';

const rule = (params: unknown): CartRuleRow => ({
  id: 'r1',
  code: 'vol',
  kind: 'nail_qty_percent_tiers',
  enabled: true,
  priority: 1,
  forbid_voucher: false,
  params,
});

test('an omitted minNails defaults to 1, the catalogue-tier behavior', () => {
  assert.deepEqual(parseGiftPerNailSetParams({ productUid: 'KIT', qtyPerNailSetUnit: 2 }), {
    productUid: 'KIT',
    qtyPerNailSetUnit: 2,
    minNails: 1,
  });
  assert.deepEqual(parseNailQtyPercentTierParams({ tiers: [{ minQty: 2, percent: 10 }] }), {
    tiers: [{ minQty: 2, percent: 10 }],
    minNails: 1,
  });
  assert.throws(() => parseNailQtyPercentTierParams({ tiers: [{ minQty: 2, percent: 10 }], minNails: 0 }));
  assert.throws(() => parseNailQtyPercentTierParams({ tiers: [{ minQty: 2, percent: 10 }], minNails: 11 }));
});

test('volume tiers apply to catalogue sets when minNails is omitted', () => {
  const evaluated = evaluateCartRules({
    rules: [rule({ tiers: [{ minQty: 2, percent: 10 }] })],
    nailLines: [{ quantity: 2, lineTotal: 60 }],
    merchandiseSubtotal: 60,
    shippingListFee: 8,
    countryCode: '',
    giftLines: [],
  });
  assert.equal(evaluated.nailQtyTier?.nailQty, 2);
  assert.equal(evaluated.nailQtyTier?.discount, 6);
  assert.equal(evaluated.rulesItemDiscount, 6);
});

test('gift-per-set rules without minNails count every composed set', () => {
  const gifts = desiredGiftQuantities(
    [{ code: 'tip', kind: 'gift_per_nail_set', enabled: true, priority: 1, params: { productUid: 'KIT', qtyPerNailSetUnit: 1 } }],
    { setUnits: 1, extraSets: [{ quantity: 2, nailCount: 1 }] },
  );
  assert.deepEqual(gifts, [{ productUid: 'KIT', quantity: 3, ruleCode: 'tip' }]);
});
