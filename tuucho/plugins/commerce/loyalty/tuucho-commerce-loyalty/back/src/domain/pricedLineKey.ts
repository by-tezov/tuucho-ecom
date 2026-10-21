/** Identity of one priced checkout line for loyalty bookkeeping. */
export interface PricedLineIdentity {
  product_id: string | null;
  shape_key: string;
  length_key: string;
  size: string;
}

export function pricedItemLineKey(line: PricedLineIdentity): string {
  const id = line.product_id ?? '';
  return `${id}:${line.shape_key}:${line.length_key}:${line.size}`;
}
