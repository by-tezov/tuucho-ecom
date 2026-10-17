import { describe, expect, it } from 'vitest';
import type { CartItem } from '@/api/cart';
import { cardComment, withCardComment } from '@/utils/cartComment';

const base: CartItem = { productId: 'p1', shapeKey: 'almond', lengthKey: 'short', size: 'M', quantity: 1 };
const card = { productId: 'p1', shapeKey: 'almond', lengthKey: 'short' };

describe('card comments', () => {
  it('reads the first note found on any size line of the card', () => {
    const items: CartItem[] = [
      { ...base, size: 'S' },
      { ...base, comment: 'matte' },
      { ...base, lengthKey: 'long', comment: 'x' },
    ];
    expect(cardComment(items, card)).toBe('matte');
    expect(cardComment([base], card)).toBe('');
  });

  it('writes the note on every editable line of the card only', () => {
    const items: CartItem[] = [
      { ...base, size: 'S' },
      { ...base, size: 'L', origin: 'rule' },
      { ...base, size: 'XS', locked: true },
      { ...base, productId: 'other' },
    ];
    const next = withCardComment(items, card, 'glossy');
    expect(next.map((line) => line.comment)).toEqual(['glossy', undefined, undefined, undefined]);

    const cleared = withCardComment(next, card, '');
    expect(cleared[0]).not.toHaveProperty('comment');
  });
});
