import { describe, expect, it } from 'vitest';
import type { CartComposition, CartItem } from '../../../src/api/cart';
import type { ProductById } from '../../../src/api/gallery';
import type { GalleryItem } from '../../../src/data/types';
import { cartDrawerTotals, quantityForDrawerLine } from '../../../src/utils/cartDrawerTotals';

function nail(overrides: Partial<ProductById> = {}): ProductById {
  return {
    id: 'nail-1',
    productType: 'nail',
    productUid: 'AB-CD-001',
    title: 'Nail',
    desc: '',
    price: 20,
    photo: null,
    available: { almond: { short: { M: 2 } } },
    ...overrides,
  };
}

function accessory(overrides: Partial<ProductById> = {}): ProductById {
  return {
    id: 'acc-1',
    productType: 'accessory',
    productUid: 'AC-CE-001',
    title: 'Glue',
    desc: '',
    price: 3,
    photo: null,
    available: 12,
    ...overrides,
  };
}

const nailLine: CartItem = {
  productId: 'nail-1',
  shapeKey: 'almond',
  lengthKey: 'short',
  size: 'M',
  quantity: 5,
};

describe('quantityForDrawerLine', () => {
  it('clamps a nail line to what is still in stock', () => {
    expect(quantityForDrawerLine(nailLine, nail(), {}, false)).toBe(2);
    expect(quantityForDrawerLine({ ...nailLine, size: 'S' }, nail(), {}, false)).toBe(0);
  });

  it('never clamps rule lines, locked lines or a cart that owns the held stock', () => {
    expect(quantityForDrawerLine({ ...nailLine, origin: 'rule' }, nail(), {}, false)).toBe(5);
    expect(quantityForDrawerLine({ ...nailLine, locked: true }, nail(), {}, false)).toBe(5);
    expect(quantityForDrawerLine(nailLine, nail(), {}, true)).toBe(5);
  });

  it('falls back to the gallery set stock when the product carries none', () => {
    const product = nail({ available: 0 });
    const sets = { 'nail-1': { available: { almond: { short: { M: 1 } } } } as unknown as GalleryItem };
    expect(quantityForDrawerLine(nailLine, product, sets, false)).toBe(1);
    expect(quantityForDrawerLine(nailLine, product, {}, false)).toBe(5);
  });

  it('caps accessory packs by whole packs in stock', () => {
    const product = accessory({ packs: { x5: 5 } });
    const line: CartItem = {
      productId: 'acc-1',
      shapeKey: '',
      lengthKey: '',
      size: '',
      packKey: 'x5',
      quantity: 4,
    };
    expect(quantityForDrawerLine(line, product, {}, false)).toBe(2);
  });
});

describe('cartDrawerTotals', () => {
  const composition = (overrides: Partial<CartComposition>): CartComposition => ({
    id: 'c1',
    size: 'M',
    quantity: 1,
    editing: false,
    unitPrice: 30,
    available: true,
    nails: [],
    ...overrides,
  });

  it('counts paid lines and compositions but not rule gifts', () => {
    const items: CartItem[] = [nailLine, { ...nailLine, productId: 'gift', origin: 'rule', quantity: 1 }];
    const totals = cartDrawerTotals(items, [composition({ quantity: 2 })], []);
    expect(totals.cartCount).toBe(7);
  });

  it('excludes gift lines and unavailable compositions from money totals', () => {
    const lines = [
      { item: nailLine, product: nail(), quantity: 2, isGift: false },
      { item: nailLine, product: nail({ id: 'gift' }), quantity: 1, isGift: true },
      {
        item: { productId: 'acc-1', shapeKey: '', lengthKey: '', size: '' as const, quantity: 3 },
        product: accessory(),
        quantity: 3,
        isGift: false,
      },
    ];
    const totals = cartDrawerTotals(
      [],
      [composition({ editing: true }), composition({ id: 'c2', available: false, unitPrice: 99 })],
      lines,
    );
    expect(totals.subtotal).toBe(2 * 20 + 3 * 3 + 30);
    expect(totals.nailQty).toBe(2);
    expect(totals.nailSubtotal).toBe(40);
  });
});
