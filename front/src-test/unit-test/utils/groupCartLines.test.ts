import { describe, expect, it } from 'vitest';
import type { CartItem } from '../../../src/api/cart';
import type { ProductById } from '../../../src/api/gallery';
import type { GalleryItem } from '../../../src/data/types';
import { groupCartLinesByShape, groupDrawerLinesByProduct } from '../../../src/utils/groupCartLines';

function set(id: string, title: string): GalleryItem {
  return {
    id,
    title,
    shape: { almond: 'Amande' },
    lengthsByShape: { almond: { short: 'Court' } },
  } as unknown as GalleryItem;
}

function item(productId: string, size: CartItem['size'], overrides: Partial<CartItem> = {}): CartItem {
  return { productId, shapeKey: 'almond', lengthKey: 'short', size, quantity: 1, ...overrides };
}

function product(id: string, title: string, productType: ProductById['productType']): ProductById {
  return { id, title, productType, productUid: '', desc: '', price: 1, photo: null, available: 1 };
}

describe('groupCartLinesByShape', () => {
  it('makes one card per set+shape+length with sizes as variants, sorted by title', () => {
    const zebra = set('z', 'Zebra');
    const apple = set('a', 'Apple');
    const groups = groupCartLinesByShape([
      { item: item('z', 'M'), set: zebra },
      { item: item('a', 'S'), set: apple },
      { item: item('z', 'L'), set: zebra },
      { item: item('z', 'M', { lengthKey: 'long' }), set: zebra },
    ]);
    expect(groups.map((g) => [g.set.title, g.lengthKey, g.variants.map((v) => v.size)])).toEqual([
      ['Apple', 'short', ['S']],
      ['Zebra', 'short', ['M', 'L']],
      ['Zebra', 'long', ['M']],
    ]);
    expect(groups[0]).toMatchObject({ shapeLabel: 'Amande', lengthLabel: 'Court' });
    expect(groups[2]?.lengthLabel).toBe('long');
  });
});

describe('groupDrawerLinesByProduct', () => {
  it('keeps every nail above every accessory, by title within each kind', () => {
    const groups = groupDrawerLinesByProduct([
      {
        item: item('acc-a', '', { shapeKey: '', lengthKey: '' }),
        product: product('acc-a', 'Aaa glue', 'accessory'),
        quantity: 1,
      },
      { item: item('n-z', 'M'), product: product('n-z', 'Zed', 'nail'), quantity: 1 },
      { item: item('n-b', 'S'), product: product('n-b', 'Bee', 'nail'), quantity: 2 },
      { item: item('n-b', 'M'), product: product('n-b', 'Bee', 'nail'), quantity: 1 },
    ]);
    expect(groups.map((g) => g.product.title)).toEqual(['Bee', 'Zed', 'Aaa glue']);
    expect(groups[0]?.variants.map((v) => v.quantity)).toEqual([2, 1]);
    expect(groups[2]?.shapeLabel).toBe('');
  });
});
