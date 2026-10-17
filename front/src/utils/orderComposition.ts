import type { OrderCompositionNail, OrderItem } from '../api/orders';

export type { OrderCompositionNail };

export function isOrderCompositionItem(item: OrderItem): boolean {
  return item.productType === 'composition';
}

/** Composed sets are shown as one block each, catalogue lines keep their
 * usual shape grouping — so every order screen has to split them first. */
export function splitOrderItemsByComposition(items: OrderItem[]): {
  compositionItems: OrderItem[];
  catalogItems: OrderItem[];
} {
  const compositionItems: OrderItem[] = [];
  const catalogItems: OrderItem[] = [];
  for (const item of items) {
    if (isOrderCompositionItem(item)) compositionItems.push(item);
    else catalogItems.push(item);
  }
  return { compositionItems, catalogItems };
}
