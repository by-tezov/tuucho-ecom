import { describe, expect, it } from 'vitest';
import { giftCartIsLocked, lastGiftUserLineRemoval, type GiftCartEditLine } from '@/utils/giftCartEdit';

function nail(productId: string, extra: Partial<GiftCartEditLine> = {}): GiftCartEditLine {
  return {
    productId,
    shapeKey: 'amande',
    lengthKey: 'medium',
    size: 'M',
    origin: 'user',
    locked: false,
    ...extra,
  };
}

function accessory(productId: string, extra: Partial<GiftCartEditLine> = {}): GiftCartEditLine {
  return {
    productId,
    shapeKey: '',
    lengthKey: '',
    size: '',
    origin: 'user',
    locked: false,
    ...extra,
  };
}

describe('giftCartIsLocked', () => {
  it('is false for a non-gift cart', () => {
    expect(giftCartIsLocked({ isGiftCart: false, giftStatus: 'awaiting_payment', items: [nail('a')] })).toBe(
      false,
    );
  });

  it('stays locked while the receiver is still selecting', () => {
    expect(giftCartIsLocked({ isGiftCart: true, giftStatus: 'selecting', items: [] })).toBe(true);
  });

  it('is locked when every remaining user line is locked', () => {
    expect(
      giftCartIsLocked({
        isGiftCart: true,
        giftStatus: 'awaiting_payment',
        items: [nail('a', { locked: true }), { ...accessory('kit'), origin: 'rule', locked: true }],
      }),
    ).toBe(true);
  });

  it('is not locked when the giver emptied an unlocked cart', () => {
    expect(
      giftCartIsLocked({
        isGiftCart: true,
        giftStatus: 'awaiting_payment',
        items: [{ ...accessory('kit'), origin: 'rule', locked: true }],
      }),
    ).toBe(false);
  });
});

describe('lastGiftUserLineRemoval', () => {
  const base = {
    isGiftCart: true,
    giftPayable: true,
    giftLocked: false,
  };

  it('is true when the last nail set card (all sizes) would disappear', () => {
    const xs = nail('set-a', { size: 'XS' });
    const m = nail('set-a', { size: 'M' });
    expect(lastGiftUserLineRemoval({ ...base, userItems: [xs, m], removing: [xs, m] })).toBe(true);
  });

  it('is false when another size of the last set remains', () => {
    const xs = nail('set-a', { size: 'XS' });
    const m = nail('set-a', { size: 'M' });
    expect(lastGiftUserLineRemoval({ ...base, userItems: [xs, m], removing: [xs] })).toBe(false);
  });

  it('is true when the last accessory would disappear', () => {
    const glue = accessory('glue');
    expect(lastGiftUserLineRemoval({ ...base, userItems: [glue], removing: [glue] })).toBe(true);
  });

  it('distinguishes accessory pack keys', () => {
    const x5 = accessory('glue', { packKey: 'x5' });
    const x10 = accessory('glue', { packKey: 'x10' });
    expect(lastGiftUserLineRemoval({ ...base, userItems: [x5, x10], removing: [x5] })).toBe(false);
    expect(lastGiftUserLineRemoval({ ...base, userItems: [x5, x10], removing: [x5, x10] })).toBe(true);
  });

  it('ignores rule kit lines', () => {
    const set = nail('set-a');
    expect(
      lastGiftUserLineRemoval({
        ...base,
        userItems: [set],
        removing: [set],
      }),
    ).toBe(true);
  });

  it('is false on a locked or not-yet-payable gift cart', () => {
    const set = nail('set-a');
    expect(lastGiftUserLineRemoval({ ...base, giftLocked: true, userItems: [set], removing: [set] })).toBe(
      false,
    );
    expect(lastGiftUserLineRemoval({ ...base, giftPayable: false, userItems: [set], removing: [set] })).toBe(
      false,
    );
  });
});
