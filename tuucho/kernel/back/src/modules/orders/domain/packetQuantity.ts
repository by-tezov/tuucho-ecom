/** Courier packet tiers are sized by customer-added merchandise sets.
 * Accessories and rule gifts ride in the parcel but count as 0 toward
 * `max_quantity`. */
export function packedNailQuantity(
  lines: ReadonlyArray<{
    origin?: string | null;
    product_type: string;
    quantity: number;
  }>,
): number {
  return lines.reduce((sum, line) => {
    if (line.origin === 'rule' || line.product_type === 'accessory') return sum;
    return sum + line.quantity;
  }, 0);
}
