import { countsAsNailSet } from '../../cart/domain/composition.js';

/** Courier packet tiers are sized by customer-added nail sets (catalogue or
 * composed). Accessories and rule gifts ride in the parcel but count as 0
 * toward `max_quantity`. */
export function packedNailQuantity(
  lines: ReadonlyArray<{
    origin?: string | null;
    product_type: string;
    quantity: number;
  }>,
): number {
  return lines.reduce((sum, line) => {
    if (line.origin === 'rule' || !countsAsNailSet(line.product_type)) return sum;
    return sum + line.quantity;
  }, 0);
}
