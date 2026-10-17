import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accessorySpendCeiling,
  giftConstraintViolation,
  leftoverClaimedByAccessories,
  leftoverNailBudget,
  remainingBudget,
  remainingSlots,
  roundMoney,
  totalSetQuantity,
} from '../../../../../../../plugins/tuucho/commerce/gift/tuucho-commerce-gift/back/src/domain/remaining.js';

const nail = (unitPrice: number, quantity = 1) => ({ productType: 'nail', unitPrice, quantity });
const accessory = (unitPrice: number, quantity = 1) => ({ productType: 'accessory', unitPrice, quantity });

test('money is rounded to cents, so float drift cannot leak into a total', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(19.999), 20);
  assert.equal(roundMoney(10.005), 10.01);
});

test('a null cap means unlimited, not zero', () => {
  assert.equal(remainingSlots(null, 5), null);
  assert.equal(remainingBudget(null, 5), null);
  assert.equal(remainingSlots(3, 1), 2);
  assert.equal(remainingBudget(50, 20.5), 29.5);
});

test('totalSetQuantity sums quantities, not lines', () => {
  assert.equal(totalSetQuantity([{ quantity: 2 }, { quantity: 3 }]), 5);
  assert.equal(totalSetQuantity([]), 0);
});

test('unspent nail budget spills over into the accessory ceiling', () => {
  assert.equal(leftoverNailBudget(50, 30), 20);
  assert.equal(accessorySpendCeiling(50, 10, 30), 30);
});

test('overspent nail budget never produces a negative spillover', () => {
  assert.equal(leftoverNailBudget(50, 80), 0);
  assert.equal(accessorySpendCeiling(50, 10, 80), 10);
});

test('with no overall budget the accessory ceiling is the dedicated one alone', () => {
  assert.equal(accessorySpendCeiling(null, 15, 0), 15);
  assert.equal(accessorySpendCeiling(null, null, 0), 0);
});

test('accessories draw on their dedicated budget before claiming leftover', () => {
  assert.equal(leftoverClaimedByAccessories(10, 4), 0);
  assert.equal(leftoverClaimedByAccessories(10, 25), 15);
  assert.equal(leftoverClaimedByAccessories(null, 25), 25);
});

test('an offer within every cap passes', () => {
  const offer = { maxSets: 3, maxBudget: 100, maxAccessoryBudget: 20 };
  assert.equal(giftConstraintViolation(offer, [nail(30, 2), accessory(15)]), null);
});

test('set count is checked against nail sets only', () => {
  const offer = { maxSets: 2, maxBudget: null, maxAccessoryBudget: 100 };
  assert.equal(giftConstraintViolation(offer, [nail(10, 2), accessory(5, 9)]), null);
  assert.equal(giftConstraintViolation(offer, [nail(10, 3)]), 'gift_sets_exceeded');
});

test('a null accessory budget means accessories are disallowed, not unlimited', () => {
  // createOffer rejects allowAccessories without a dedicated budget, and
  // stores null when accessories are off, so a null ceiling must reject any
  // accessory line even when the overall budget is unlimited.
  const offer = { maxSets: null, maxBudget: null, maxAccessoryBudget: null };
  assert.equal(giftConstraintViolation(offer, [nail(10)]), null);
  assert.equal(giftConstraintViolation(offer, [accessory(1)]), 'gift_accessory_budget_exceeded');
});

test('nail merchandise over the budget is rejected', () => {
  const offer = { maxSets: null, maxBudget: 50, maxAccessoryBudget: null };
  assert.equal(giftConstraintViolation(offer, [nail(50)]), null);
  assert.equal(giftConstraintViolation(offer, [nail(50.01)]), 'gift_budget_exceeded');
});

test('spending exactly to the cent is allowed despite float representation', () => {
  const offer = { maxSets: null, maxBudget: 0.3, maxAccessoryBudget: null };
  assert.equal(giftConstraintViolation(offer, [nail(0.1), nail(0.2)]), null);
});

test('accessories may spend leftover nail budget', () => {
  const offer = { maxSets: null, maxBudget: 100, maxAccessoryBudget: 10 };
  // 40 spent on nails leaves 60, plus the dedicated 10: a 70 ceiling.
  assert.equal(giftConstraintViolation(offer, [nail(40), accessory(70)]), null);
  assert.equal(
    giftConstraintViolation(offer, [nail(40), accessory(70.01)]),
    'gift_accessory_budget_exceeded',
  );
});

test('the nail cap is reported before the accessory cap when both are broken', () => {
  const offer = { maxSets: null, maxBudget: 10, maxAccessoryBudget: 0 };
  assert.equal(giftConstraintViolation(offer, [nail(999), accessory(999)]), 'gift_budget_exceeded');
});

test('an empty gift never violates a constraint', () => {
  assert.equal(giftConstraintViolation({ maxSets: 0, maxBudget: 0, maxAccessoryBudget: 0 }, []), null);
});
