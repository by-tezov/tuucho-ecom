import { describe, expect, it } from 'vitest';
import type { CartItem } from '../../../src/api/cart';
import type { GiftItem } from '../../../src/api/gift';
import { giftItemsToCart, sameLine } from '../../../src/utils/cartLines';

const base: CartItem = { productId: 'p1', shapeKey: 'almond', lengthKey: 'short', size: 'M', quantity: 1 };

describe('cart line identity', () => {
  it('treats any variant difference as a different line', () => {
    expect(sameLine(base, 'p1', 'almond', 'short', 'M')).toBe(true);
    expect(sameLine(base, 'p1', 'almond', 'short', 'S')).toBe(false);
    expect(sameLine(base, 'p1', 'almond', 'long', 'M')).toBe(false);
    expect(sameLine(base, 'p1', 'coffin', 'short', 'M')).toBe(false);
  });

  it('maps gift items to plain editable user lines', () => {
    const gifts = [
      { productId: 'acc', shapeKey: '', lengthKey: '', size: null, packKey: null, quantity: 2 },
    ] as unknown as GiftItem[];
    expect(giftItemsToCart(gifts)).toEqual([
      {
        productId: 'acc',
        shapeKey: '',
        lengthKey: '',
        size: '',
        packKey: '',
        quantity: 2,
        origin: 'user',
        locked: false,
      },
    ]);
  });
});
