import { describe, expect, it } from 'vitest';
import {
  previewFreeShipping,
  previewGiftLines,
  previewNailQtyTier,
  type PublicCartRule,
} from '../../../src/utils/cartRulesPreview';

const tipPot: PublicCartRule = {
  code: 'tip-pot',
  kind: 'gift_per_nail_set',
  priority: 1,
  forbidVoucher: false,
  giftProductId: 'g1',
  params: { qtyPerNailSetUnit: 1, minNails: 5 },
};

describe('cartRulesPreview', () => {
  it('previews a gift from catalogue sets when no composed set qualifies', () => {
    expect(previewGiftLines([tipPot], { setUnits: 2, compositions: [] })).toEqual([
      { productId: 'g1', quantity: 2 },
    ]);
    expect(previewGiftLines([tipPot], { setUnits: 0, compositions: [{ quantity: 1, nailCount: 4 }] })).toEqual(
      [],
    );
  });

  it('adds a composed set of at least minNails nails on the same gift', () => {
    const compositions = [
      { quantity: 2, nailCount: 5 },
      { quantity: 1, nailCount: 4 },
    ];
    expect(previewGiftLines([tipPot], { setUnits: 1, compositions })).toEqual([
      { productId: 'g1', quantity: 3 },
    ]);
  });

  it('grants no composed-set units when minNails or the per-set qty is invalid', () => {
    const badMin: PublicCartRule[] = [{ ...tipPot, params: { qtyPerNailSetUnit: 1, minNails: 0 } }];
    const badQty: PublicCartRule[] = [{ ...tipPot, params: { qtyPerNailSetUnit: 1.5, minNails: 5 } }];
    const cart = { setUnits: 0, compositions: [{ quantity: 2, nailCount: 10 }] };
    expect(previewGiftLines(badMin, cart)).toEqual([]);
    expect(previewGiftLines(badQty, cart)).toEqual([]);
  });

  it('matches nail qty percent tiers, counting a composed set from minNails', () => {
    const rules: PublicCartRule[] = [
      {
        code: 'vol',
        kind: 'nail_qty_percent_tiers',
        priority: 1,
        forbidVoucher: false,
        params: {
          minNails: 5,
          tiers: [
            { minQty: 2, percent: 10 },
            { minQty: 4, percent: 20 },
          ],
        },
      },
    ];
    const preview = previewNailQtyTier(rules, 1, 60, [
      { quantity: 1, nailCount: 5, lineTotal: 40 },
      { quantity: 1, nailCount: 4, lineTotal: 30 },
    ]);
    expect(preview?.nailQty).toBe(2);
    expect(preview?.matched).toEqual({ minQty: 2, percent: 10 });
    expect(preview?.discount).toBe(10);
    expect(preview?.next?.minQty).toBe(4);
    expect(previewNailQtyTier(rules, 3, 100)).toMatchObject({
      matched: { minQty: 2, percent: 10 },
      discount: 10,
    });
  });

  it('applies free shipping above a country threshold', () => {
    const rules: PublicCartRule[] = [
      {
        code: 'fs',
        kind: 'free_shipping_above',
        priority: 1,
        forbidVoucher: false,
        params: { thresholdsByCountry: { FR: 50 } },
      },
    ];
    const applied = previewFreeShipping(rules, 'FR', 60, 8);
    expect(applied?.applied).toBe(true);
    expect(applied?.chargedFee).toBe(0);
    const pending = previewFreeShipping(rules, 'FR', 40, 8);
    expect(pending?.need).toBe(10);
    expect(pending?.chargedFee).toBe(8);
  });
});
