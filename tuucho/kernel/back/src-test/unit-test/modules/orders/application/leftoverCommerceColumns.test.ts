import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leftoverCommerceColumnsFromSnapshot } from '../../../../../src/modules/orders/application/orderPluginSnapshot.js';

test('leftover commerce columns fill from plugin snapshot bags before insert', () => {
  const leftover = leftoverCommerceColumnsFromSnapshot({
    plugins: {
      'tuucho-commerce-vouchers': { code: 'SAVE10', discount: 10 },
      'tuucho-commerce-loyalty': { credit: 3.5, earn: 1.2, earnStatus: 'pending' },
    },
  });
  assert.equal(leftover.voucherCode, 'SAVE10');
  assert.equal(leftover.voucherItemDiscount, 10);
  assert.equal(leftover.loyaltyCredit, 3.5);
  assert.equal(leftover.loyaltyEarn, 1.2);
  assert.equal(leftover.loyaltyEarnStatus, 'pending');
});
