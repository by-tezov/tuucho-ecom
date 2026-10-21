import { describe, expect, it } from 'vitest';
import type { ProductById } from '@/api/gallery';
import { accessoryBudgetQtyMax, accessoryFitsBudget, sellablePackKeysWithinBudget } from '@/utils/accessoryPacks';

function accessory(overrides: Partial<ProductById> & Pick<ProductById, 'price'>): ProductById {
  return {
    id: 'acc-1',
    productUid: 'glue',
    productType: 'accessory',
    title: 'Glue',
    desc: '',
    photo: null,
    available: 20,
    accessoryType: 'default',
    ...overrides,
  };
}

describe('accessoryFitsBudget', () => {
  it('keeps a default accessory whose unit still fits remaining budget', () => {
    const product = accessory({ price: 4.5 });
    expect(accessoryFitsBudget(product, 4.5)).toBe(true);
    expect(accessoryFitsBudget(product, 4.49)).toBe(false);
  });

  it('keeps a pack accessory when at least one in-stock pack fits', () => {
    const product = accessory({
      accessoryType: 'byQuantity',
      price: 2,
      packs: { s: 2, l: 6 },
      available: 8,
    });
    expect(accessoryFitsBudget(product, 5)).toBe(true);
    expect(sellablePackKeysWithinBudget(product, 5)).toEqual(['s']);
    expect(accessoryFitsBudget(product, 3)).toBe(false);
  });

  it('drops an accessory with no in-stock unit', () => {
    expect(accessoryFitsBudget(accessory({ price: 4, available: 0 }), 50)).toBe(false);
  });
});

describe('accessoryBudgetQtyMax', () => {
  it('caps quantity so another unit would not exceed remaining budget', () => {
    const product = accessory({ price: 5, available: 10 });
    expect(accessoryBudgetQtyMax(product, '', 1, 4.99)).toBe(1);
    expect(accessoryBudgetQtyMax(product, '', 1, 5)).toBe(2);
    expect(accessoryBudgetQtyMax(product, '', 1, 11)).toBe(3);
  });

  it('leaves the shop stock max alone when there is no remaining budget', () => {
    const product = accessory({ price: 5, available: 10 });
    expect(accessoryBudgetQtyMax(product, '', 1, null)).toBe(10);
  });
});
