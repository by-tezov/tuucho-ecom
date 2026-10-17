import { describe, expect, it } from 'vitest';
import { giftSetsEstimate } from '@/utils/giftSetsEstimate';

describe('giftSetsEstimate', () => {
  it('counts sets at the cheapest price in stock', () => {
    expect(giftSetsEstimate(90, { min: 15, max: 30 })).toBe(6);
  });

  it('does not move when the budget crosses the dearest set', () => {
    expect(giftSetsEstimate(29, { min: 14, max: 30 })).toBe(2);
    expect(giftSetsEstimate(30, { min: 14, max: 30 })).toBe(2);
  });

  it('reports zero when even the cheapest set is out of reach', () => {
    expect(giftSetsEstimate(10, { min: 15, max: 30 })).toBe(0);
  });

  it('never promises more sets than the packing ceiling allows', () => {
    expect(giftSetsEstimate(300, { min: 15, max: 30 }, 5)).toBe(5);
  });

  it('has nothing to say without a price range or a budget', () => {
    expect(giftSetsEstimate(90, null)).toBeNull();
    expect(giftSetsEstimate(0, { min: 15, max: 30 })).toBeNull();
    expect(giftSetsEstimate(Number.NaN, { min: 15, max: 30 })).toBeNull();
  });

  it('ignores a price range that cannot be divided by', () => {
    expect(giftSetsEstimate(90, { min: 0, max: 0 })).toBeNull();
  });
});
