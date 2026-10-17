import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  priceMerchandiseAndShipping,
  type PacketTier,
  type PricedLine,
} from '../../../../../src/modules/orders/domain/checkoutTotals.js';

const nail = (unitPrice: number, quantity = 1, origin: 'user' | 'rule' = 'user'): PricedLine => ({
  productId: `p-${unitPrice}-${quantity}-${origin}`,
  productUid: 'AQ-YZ-367',
  productType: 'nail',
  origin,
  ruleCode: origin === 'rule' ? 'GIFT' : null,
  quantity,
  unitPrice,
  lineTotal: unitPrice * quantity,
});

const accessory = (unitPrice: number, quantity = 1): PricedLine => ({
  ...nail(unitPrice, quantity),
  productId: `acc-${unitPrice}`,
  productType: 'accessory',
});

const composition = (unitPrice: number, quantity = 1, nailCount = 10): PricedLine => ({
  ...nail(unitPrice, quantity),
  productId: `comp-${unitPrice}-${nailCount}`,
  productUid: 'COMPOSE',
  productType: 'composition',
  nailCount,
});

/** Two tiers: up to 2 sets for 5 EUR, up to 10 for 9 EUR. */
const tiers: PacketTier[] = [
  { packet_key: 'S', max_quantity: 2, price: 5, express_price: 8 },
  { packet_key: 'M', max_quantity: 10, price: 9, express_price: 14 },
];

const base = { packetTiers: tiers, rules: [], countryCode: 'FR', express: false, hasVoucher: false };

test('merchandise counts customer lines and never a rule gift', () => {
  const result = priceMerchandiseAndShipping({ ...base, lines: [nail(30), nail(20, 1, 'rule')] });
  assert.ok(result.ok);
  assert.equal(result.pricing.merchandiseSubtotal, 30);
});

test('the packet tier is the smallest that fits the nail quantity', () => {
  const small = priceMerchandiseAndShipping({ ...base, lines: [nail(10, 2)] });
  assert.ok(small.ok);
  assert.equal(small.pricing.packetKey, 'S');
  assert.equal(small.pricing.shippingListFee, 5);

  const bigger = priceMerchandiseAndShipping({ ...base, lines: [nail(10, 3)] });
  assert.ok(bigger.ok);
  assert.equal(bigger.pricing.packetKey, 'M');
  assert.equal(bigger.pricing.shippingListFee, 9);
});

test('accessories ride along without sizing the packet', () => {
  const result = priceMerchandiseAndShipping({ ...base, lines: [nail(10, 2), accessory(4, 9)] });
  assert.ok(result.ok);
  assert.equal(result.pricing.packetKey, 'S', 'nine accessories must not push the parcel up a tier');
  assert.equal(result.pricing.merchandiseSubtotal, 56);
});

test('a rule gift does not size the packet either', () => {
  const result = priceMerchandiseAndShipping({ ...base, lines: [nail(10, 2), nail(0, 4, 'rule')] });
  assert.ok(result.ok);
  assert.equal(result.pricing.packetKey, 'S');
});

test('exceeding every tier blocks checkout rather than picking the largest', () => {
  const result = priceMerchandiseAndShipping({ ...base, lines: [nail(10, 11)] });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'shipping_overflow');
});

test('express takes the express price of the same tier', () => {
  const result = priceMerchandiseAndShipping({ ...base, express: true, lines: [nail(10, 2)] });
  assert.ok(result.ok);
  assert.equal(result.pricing.shippingListFee, 8);
});

test('with no rules the shipping fee is the list fee and nothing is discounted', () => {
  const result = priceMerchandiseAndShipping({ ...base, lines: [nail(30, 2)] });
  assert.ok(result.ok);
  assert.equal(result.pricing.shippingFee, result.pricing.shippingListFee);
  assert.equal(result.pricing.rulesItemDiscount, 0);
});

test('a voucher is measured after any rule discount, never against the gross subtotal', () => {
  const result = priceMerchandiseAndShipping({ ...base, lines: [nail(50, 2)] });
  assert.ok(result.ok);
  assert.equal(
    result.pricing.voucherMerchandiseSubtotal,
    result.pricing.merchandiseSubtotal - result.pricing.rulesItemDiscount,
  );
});

test('a rule that forbids vouchers rejects the checkout only when one was offered', () => {
  const forbidding = [
    {
      id: 'r1',
      code: 'NOVOUCHER',
      kind: 'free_shipping_above' as const,
      enabled: true,
      priority: 1,
      forbid_voucher: true,
      params: { thresholdsByCountry: { FR: 0 } },
    },
  ];
  const withVoucher = priceMerchandiseAndShipping({
    ...base,
    rules: forbidding,
    hasVoucher: true,
    lines: [nail(30, 2)],
  });
  assert.equal(withVoucher.ok, false);
  assert.equal(withVoucher.ok === false && withVoucher.reason, 'voucher_forbidden_by_rule');

  const withoutVoucher = priceMerchandiseAndShipping({ ...base, rules: forbidding, lines: [nail(30, 2)] });
  assert.equal(withoutVoucher.ok, true, 'the same cart must price fine when no voucher was offered');
});

test('money stays on the cent through the whole chain', () => {
  const result = priceMerchandiseAndShipping({ ...base, lines: [nail(0.1), nail(0.2)] });
  assert.ok(result.ok);
  assert.equal(result.pricing.merchandiseSubtotal, 0.3);
});

test('a composed set counts in merchandise and packet quantity', () => {
  const result = priceMerchandiseAndShipping({
    ...base,
    lines: [composition(25, 2), accessory(4)],
  });
  assert.ok(result.ok);
  assert.equal(result.pricing.merchandiseSubtotal, 54);
  assert.equal(result.pricing.totalQuantity, 2);
  assert.equal(result.pricing.packetKey, 'S');
});

test('volume remise counts a composed set once it has minNails nails', () => {
  const rules = [
    {
      id: 'r1',
      code: 'vol',
      kind: 'nail_qty_percent_tiers' as const,
      enabled: true,
      priority: 1,
      forbid_voucher: false,
      params: { tiers: [{ minQty: 2, percent: 10 }], minNails: 5 },
    },
  ];
  const tooShort = priceMerchandiseAndShipping({
    ...base,
    rules,
    lines: [composition(50, 2, 4)],
  });
  assert.ok(tooShort.ok);
  assert.equal(tooShort.pricing.rulesItemDiscount, 0);

  const composeOnly = priceMerchandiseAndShipping({
    ...base,
    rules,
    lines: [composition(50, 2, 5)],
  });
  assert.ok(composeOnly.ok);
  assert.equal(composeOnly.pricing.rulesItemDiscount, 10);
  assert.equal(composeOnly.pricing.cartRules.nailQtyTier?.nailQty, 2);

  const withCatalogue = priceMerchandiseAndShipping({
    ...base,
    rules,
    lines: [composition(50, 1, 5), nail(40, 1)],
  });
  assert.ok(withCatalogue.ok);
  assert.equal(withCatalogue.pricing.rulesItemDiscount, 9);
});
