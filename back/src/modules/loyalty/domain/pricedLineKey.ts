/** Identity of one priced checkout line for loyalty bookkeeping. */
export interface PricedLineIdentity {
  product_id: string | null;
  /** A composed set has no product id of its own. */
  composition_id?: string;
  shape_key: string;
  length_key: string;
  size: string;
}

export function pricedItemLineKey(line: PricedLineIdentity): string {
  const id = line.product_id ?? line.composition_id ?? 'composition';
  return `${id}:${line.shape_key}:${line.length_key}:${line.size}`;
}
