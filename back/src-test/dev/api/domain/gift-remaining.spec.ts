import { test, expect } from 'patchright/test';
import {
  accessorySpendCeiling,
  giftConstraintViolation,
  leftoverClaimedByAccessories,
  leftoverNailBudget,
  remainingBudget,
} from '../../../../src/modules/gift/domain/remaining.js';

const offer = (maxBudget: number | null, maxAccessoryBudget: number | null = null) => ({
  maxSets: null as number | null,
  maxBudget,
  maxAccessoryBudget,
});

test.describe('Gift remaining accessory pooling', () => {
  test('leftover nail budget: stacks on a dedicated accessory envelope', () => {
    const nailMerchandise = 25 + 18;
    expect(leftoverNailBudget(45, nailMerchandise)).toBe(2);
    expect(accessorySpendCeiling(45, 5, nailMerchandise)).toBe(7);
    expect(leftoverClaimedByAccessories(5, 7)).toBe(2);
    expect(remainingBudget(45, nailMerchandise + leftoverClaimedByAccessories(5, 7))).toBe(0);
    expect(remainingBudget(accessorySpendCeiling(45, 5, nailMerchandise), 7)).toBe(0);

    const items = [
      { productType: 'nail', unitPrice: 25, quantity: 1 },
      { productType: 'nail', unitPrice: 18, quantity: 1 },
      { productType: 'accessory', unitPrice: 7, quantity: 1 },
    ];
    expect(giftConstraintViolation(offer(45, 5), items)).toBeNull();
    expect(
      giftConstraintViolation(offer(45, 5), [
        ...items.slice(0, 2),
        { productType: 'accessory', unitPrice: 7.01, quantity: 1 },
      ]),
    ).toBe('gift_accessory_budget_exceeded');
  });

  test('unused nail budget: can buy accessories without a dedicated envelope', () => {
    const nails = [
      { productType: 'nail', unitPrice: 25, quantity: 1 },
      { productType: 'nail', unitPrice: 18, quantity: 1 },
    ];
    expect(accessorySpendCeiling(45, null, 43)).toBe(2);
    expect(
      giftConstraintViolation(offer(45), [...nails, { productType: 'accessory', unitPrice: 2, quantity: 1 }]),
    ).toBeNull();
    expect(
      giftConstraintViolation(offer(45), [...nails, { productType: 'accessory', unitPrice: 2.01, quantity: 1 }]),
    ).toBe('gift_accessory_budget_exceeded');
  });

  test('empty basket leftover: is the full nail budget plus dedicated accessory money', () => {
    expect(accessorySpendCeiling(45, 5, 0)).toBe(50);
    expect(accessorySpendCeiling(45, null, 0)).toBe(45);
    expect(remainingBudget(accessorySpendCeiling(45, 5, 0), 0)).toBe(50);
  });

  test('nail lines: cannot spend the dedicated accessory envelope', () => {
    expect(
      giftConstraintViolation(offer(45, 5), [{ productType: 'nail', unitPrice: 45.01, quantity: 1 }]),
    ).toBe('gift_budget_exceeded');
    expect(giftConstraintViolation(offer(45, 5), [{ productType: 'nail', unitPrice: 45, quantity: 1 }])).toBeNull();
  });

  test('accessories that overflow leftover: reduce remaining nail budget', () => {
    const leftoverUsed = leftoverClaimedByAccessories(5, 6);
    expect(leftoverUsed).toBe(1);
    expect(remainingBudget(45, 43 + leftoverUsed)).toBe(1);
  });
});
