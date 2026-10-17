import { test, expect } from 'patchright/test';
import { computeLoyaltyPricing } from '../../../../src/modules/loyalty/application/loyalty.js';

const settings = {
  valuePer100: 10,
  lotDurationMonths: 6,
  updatedAt: null,
};

test.describe('Loyalty pricing domain rules', () => {
  test('valuePer100 10: is ten percent of paid merchandise', () => {
    const result = computeLoyaltyPricing(
      {
        lines: [
          { lineKey: 'nail', productType: 'nail', origin: 'user', lineTotal: 23.85, loyaltyMultiplier: 1 },
          { lineKey: 'box', productType: 'accessory', origin: 'user', lineTotal: 1, loyaltyMultiplier: 1 },
          { lineKey: 'kit', productType: 'accessory', origin: 'rule', lineTotal: 0, loyaltyMultiplier: 1 },
        ],
        merchandiseSubtotal: 24.85,
        rulesItemDiscount: 0,
        voucherItemDiscount: 0,
        voucherShippingDiscount: 0,
        shippingFee: 4.1,
        applyLoyalty: false,
        userId: 'user-1',
        voucherOfferType: null,
        availableBalance: 0,
      },
      settings,
    );
    expect(result.loyaltyEarn).toBe(2.49);
  });

  test('earn: ignores shipping and gift lines', () => {
    const result = computeLoyaltyPricing(
      {
        lines: [
          { lineKey: 'paid', productType: 'nail', origin: 'user', lineTotal: 80, loyaltyMultiplier: 1 },
          { lineKey: 'gift', productType: 'nail', origin: 'rule', lineTotal: 20, loyaltyMultiplier: 1 },
        ],
        merchandiseSubtotal: 100,
        rulesItemDiscount: 0,
        voucherItemDiscount: 0,
        voucherShippingDiscount: 0,
        shippingFee: 6.5,
        applyLoyalty: false,
        userId: 'user-1',
        voucherOfferType: null,
        availableBalance: 0,
      },
      settings,
    );
    expect(result.loyaltyCredit).toBe(0);
    expect(result.loyaltyEarn).toBe(8);
  });

  test('earn: is reduced by loyalty credit spent on merchandise', () => {
    const result = computeLoyaltyPricing(
      {
        lines: [{ lineKey: 'paid', productType: 'nail', origin: 'user', lineTotal: 50, loyaltyMultiplier: 1 }],
        merchandiseSubtotal: 50,
        rulesItemDiscount: 0,
        voucherItemDiscount: 0,
        voucherShippingDiscount: 0,
        shippingFee: 5.99,
        applyLoyalty: true,
        userId: 'user-1',
        voucherOfferType: null,
        availableBalance: 20,
      },
      settings,
    );
    expect(result.loyaltyCredit).toBe(20);
    expect(result.loyaltyEarn).toBe(3);
  });

  test('full wallet coverage: yields zero earn', () => {
    const result = computeLoyaltyPricing(
      {
        lines: [{ lineKey: 'paid', productType: 'nail', origin: 'user', lineTotal: 40, loyaltyMultiplier: 1 }],
        merchandiseSubtotal: 40,
        rulesItemDiscount: 0,
        voucherItemDiscount: 0,
        voucherShippingDiscount: 0,
        shippingFee: 5.99,
        applyLoyalty: true,
        userId: 'user-1',
        voucherOfferType: null,
        availableBalance: 200,
      },
      settings,
    );
    expect(result.loyaltyCredit).toBe(40);
    expect(result.loyaltyEarn).toBe(0);
    expect(result.earnStatus).toBe('void');
  });

  test('voucher: blocks wallet spend but earn still uses paid merchandise', () => {
    const result = computeLoyaltyPricing(
      {
        lines: [{ lineKey: 'paid', productType: 'nail', origin: 'user', lineTotal: 60, loyaltyMultiplier: 1 }],
        merchandiseSubtotal: 60,
        rulesItemDiscount: 0,
        voucherItemDiscount: 10,
        voucherShippingDiscount: 0,
        shippingFee: 5.99,
        applyLoyalty: true,
        userId: 'user-1',
        voucherOfferType: 'percent',
        availableBalance: 50,
      },
      settings,
    );
    expect(result.incompatibleWithVoucher).toBe(true);
    expect(result.loyaltyCredit).toBe(0);
    expect(result.loyaltyEarn).toBe(5);
  });

});
