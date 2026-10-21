import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateVoucher,
  offerFromRow,
  round2,
  type VoucherPricingInput,
} from '../../../../../../../plugins/commerce/vouchers/tuucho-commerce-vouchers/back/src/domain/voucherPricing.js';
import type { VoucherRow } from '../../../../../../../plugins/commerce/vouchers/tuucho-commerce-vouchers/back/src/domain/voucherTypes.js';

function row(overrides: Partial<VoucherRow>): VoucherRow {
  return {
    code: 'TEST',
    enabled: true,
    quantity: 10,
    max_uses_per_user: 0,
    min_subtotal: null,
    starts_at: '2026-01-01',
    ends_at: '2026-12-31',
    allowed_user_ids: [],
    offer_type: 'amount',
    percent: null,
    amount: null,
    required_item_quantity: null,
    max_item_price: null,
    ...overrides,
  };
}

function basket(overrides: Partial<VoucherPricingInput> = {}): VoucherPricingInput {
  return {
    subtotal: 60,
    shippingFee: 5,
    totalQuantity: 3,
    itemUnitPrices: [
      { unitPrice: 15, quantity: 2, productType: 'nail' },
      { unitPrice: 30, quantity: 1, productType: 'nail' },
    ],
    ...overrides,
  };
}

test('round2 keeps cents and absorbs float noise', () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(19.999), 20);
});

test('percent applies to merchandise and delivery alike', () => {
  const applied = calculateVoucher(row({ offer_type: 'percent', percent: '10' }), basket());
  assert.deepEqual(applied, {
    code: 'TEST',
    itemDiscount: 6,
    shippingDiscount: 0.5,
    discount: 6.5,
    offer: { type: 'percent', percent: 10 },
  });
});

test('percent rounds each portion to cents', () => {
  const applied = calculateVoucher(
    row({ offer_type: 'percent', percent: '15' }),
    basket({ subtotal: 19.99, shippingFee: 4.99 }),
  );
  assert.equal(applied?.itemDiscount, 3);
  assert.equal(applied?.shippingDiscount, 0.75);
  assert.equal(applied?.discount, 3.75);
});

test('amount covers merchandise first, then delivery, never more than the order', () => {
  const partial = calculateVoucher(row({ amount: '20' }), basket());
  assert.equal(partial?.itemDiscount, 20);
  assert.equal(partial?.shippingDiscount, 0);

  const spill = calculateVoucher(row({ amount: '62' }), basket());
  assert.equal(spill?.itemDiscount, 60);
  assert.equal(spill?.shippingDiscount, 2);

  const huge = calculateVoucher(row({ amount: '500' }), basket());
  assert.equal(huge?.itemDiscount, 60);
  assert.equal(huge?.shippingDiscount, 5);
  assert.equal(huge?.discount, 65, 'a voucher can never make the order negative');
});

test('min_subtotal gates amount and free_shipping only', () => {
  const small = basket({ subtotal: 20 });
  assert.equal(calculateVoucher(row({ amount: '5', min_subtotal: '30' }), small), undefined);
  assert.equal(calculateVoucher(row({ offer_type: 'free_shipping', min_subtotal: '30' }), small), undefined);
  assert.ok(calculateVoucher(row({ amount: '5', min_subtotal: '20' }), small), 'the bound is inclusive');
  assert.ok(
    calculateVoucher(row({ offer_type: 'percent', percent: '10', min_subtotal: '30' }), small),
    'percent ignores min_subtotal',
  );
});

test('free_shipping removes exactly the delivery fee', () => {
  const applied = calculateVoucher(row({ offer_type: 'free_shipping' }), basket({ shippingFee: 7.9 }));
  assert.equal(applied?.itemDiscount, 0);
  assert.equal(applied?.shippingDiscount, 7.9);
  assert.equal(applied?.discount, 7.9);
  assert.deepEqual(applied?.offer, { type: 'free_shipping' });
});

test('free_item_nth gives the cheapest nail units, accessories excluded', () => {
  const input = basket({
    subtotal: 100,
    itemUnitPrices: [
      { unitPrice: 25, quantity: 2, productType: 'nail' },
      { unitPrice: 12, quantity: 1, productType: 'nail' },
      { unitPrice: 3, quantity: 5, productType: 'accessory' },
      { unitPrice: 40, quantity: 3, productType: 'nail' },
    ],
  });
  // "Buy 2, get 1": 6 nail-set units -> 2 free units, the 12 then one 25.
  const applied = calculateVoucher(row({ offer_type: 'free_item_nth', required_item_quantity: 2 }), input);
  assert.equal(applied?.freeItemQuantity, 2);
  assert.equal(applied?.itemDiscount, 37);
  assert.equal(applied?.shippingDiscount, 0);
  assert.deepEqual(applied?.offer, { type: 'free_item_nth', requiredItemQuantity: 2 });
});

test('free_item_nth does not apply below the threshold', () => {
  const input = basket({
    itemUnitPrices: [
      { unitPrice: 25, quantity: 2, productType: 'nail' },
      { unitPrice: 3, quantity: 10, productType: 'accessory' },
    ],
  });
  assert.equal(calculateVoucher(row({ offer_type: 'free_item_nth', required_item_quantity: 2 }), input), undefined);
});

test('free_item_nth ignores zero-quantity lines', () => {
  const input = basket({
    itemUnitPrices: [
      { unitPrice: 1, quantity: 0, productType: 'nail' },
      { unitPrice: 20, quantity: 2, productType: 'nail' },
    ],
  });
  const applied = calculateVoucher(row({ offer_type: 'free_item_nth', required_item_quantity: 1 }), input);
  assert.equal(applied?.itemDiscount, 20);
});

test('free_item picks the most expensive eligible nail set under the cap', () => {
  const input = basket({
    itemUnitPrices: [
      { unitPrice: 15, quantity: 2, productType: 'nail' },
      { unitPrice: 22, quantity: 1, productType: 'nail' },
      { unitPrice: 35, quantity: 1, productType: 'nail' },
      { unitPrice: 30, quantity: 1, productType: 'accessory' },
    ],
  });
  const applied = calculateVoucher(row({ offer_type: 'free_item', max_item_price: '25' }), input);
  assert.equal(applied?.itemDiscount, 22);
  assert.equal(applied?.freeItemQuantity, 1);
  assert.deepEqual(applied?.offer, { type: 'free_item', maxItemPrice: 25 });
});

test('free_item does not apply when nothing is under the cap', () => {
  const input = basket({ itemUnitPrices: [{ unitPrice: 30, quantity: 1, productType: 'nail' }] });
  assert.equal(calculateVoucher(row({ offer_type: 'free_item', max_item_price: '25' }), input), undefined);
});

test('item discount is capped at the subtotal (cart rules already lowered it)', () => {
  const input = basket({ subtotal: 10, itemUnitPrices: [{ unitPrice: 25, quantity: 1, productType: 'nail' }] });
  const applied = calculateVoucher(row({ offer_type: 'free_item', max_item_price: '30' }), input);
  assert.equal(applied?.itemDiscount, 10);
});

test('freeItemQuantity is only present on free-item offers', () => {
  const applied = calculateVoucher(row({ amount: '5' }), basket());
  assert.equal(applied && 'freeItemQuantity' in applied, false);
});

test('an unknown offer type never discounts', () => {
  const unknown = row({ offer_type: 'mystery' as VoucherRow['offer_type'] });
  assert.equal(calculateVoucher(unknown, basket()), undefined);
});

test('offerFromRow converts numeric strings from Postgres', () => {
  assert.deepEqual(offerFromRow(row({ offer_type: 'percent', percent: '12.5' })), { type: 'percent', percent: 12.5 });
  assert.deepEqual(offerFromRow(row({ offer_type: 'amount', amount: '7.00' })), { type: 'amount', amount: 7 });
});
