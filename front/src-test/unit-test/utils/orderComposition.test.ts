import { describe, expect, it } from 'vitest';
import type { OrderItem } from '../../../src/api/orders';
import { isOrderCompositionItem, splitOrderItemsByComposition } from '../../../src/utils/orderComposition';

const item = (productType: OrderItem['productType'], id: string): OrderItem =>
  ({ id, productType }) as OrderItem;

describe('orderComposition', () => {
  it('detects composition lines', () => {
    expect(isOrderCompositionItem(item('composition', 'c1'))).toBe(true);
    expect(isOrderCompositionItem(item('nail', 'n1'))).toBe(false);
    expect(isOrderCompositionItem(item('accessory', 'a1'))).toBe(false);
  });

  it('splits composed sets from catalogue lines', () => {
    const items = [item('nail', 'n1'), item('composition', 'c1'), item('accessory', 'a1')];
    expect(splitOrderItemsByComposition(items)).toEqual({
      compositionItems: [item('composition', 'c1')],
      catalogItems: [item('nail', 'n1'), item('accessory', 'a1')],
    });
  });
});
