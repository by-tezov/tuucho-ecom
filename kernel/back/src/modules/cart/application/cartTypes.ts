export type CartKind = 'default' | 'wishlist' | 'rebuy' | 'custom' | 'unconnected' | 'gift';

export interface CartListEntry {
  id: string;
  name: string;
  kind: CartKind;
  is_active: boolean;
  item_count: number;
  /** Lines subtotal (TTC, EUR) from current product_prices — no shipping/voucher. */
  total: number;
  created_at: Date | string;
  updated_at: Date | string;
}

/** A cart list row as SQL returns it: `total` is numeric text. */
export type CartListEntryRow = Omit<CartListEntry, 'total'> & { total: string | number };

export function mapCartListEntry(row: CartListEntryRow): CartListEntry {
  return {
    ...row,
    total: Number(row.total),
  };
}
