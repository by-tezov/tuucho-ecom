/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/cart.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */

export type Size = 'XS' | 'S' | 'M' | 'L';

/** A cart line's size: one of `Size`, or empty for an accessory line. */
export type CartSize = Size | '';

/** Cart line identity. Accessories use empty `shapeKey`/`lengthKey`/`size`
 * (URL path encodes each as `-` — see cartLineUrl). Rule-gift lines set
 * `origin` / `locked` from the server (PATCH/DELETE → line_locked). */
export interface CartItem {
  productId: string;
  shapeKey: string; // '' for accessory
  lengthKey: string; // '' for accessory
  size: CartSize; // '' for accessory
  /** byQuantity pack (`x5` / `x10`); `''` for nails and default accessories. */
  packKey?: string;
  quantity: number;
  origin?: 'user' | 'rule';
  locked?: boolean;
  /** Customer note for the card. Every size line of one
   * product+shape+length carries the same value; absent when none. */
  comment?: string;
}

export type CartKind = 'default' | 'wishlist' | 'rebuy' | 'custom' | 'unconnected' | 'gift';

export interface CartGiftMeta {
  offerId: string;
  status: 'selecting' | 'awaiting_payment' | 'paying' | 'ordered' | 'cancelled' | 'expired';
  receiverName: string;
  giverToken: string;
  maxBudget: number | null;
  allowAccessories: boolean;
  maxAccessoryBudget: number | null;
}

export interface CartSummary {
  id: string;
  name: string;
  kind: CartKind;
  isActive: boolean;
  itemCount: number;
  /** Lines subtotal (TTC, EUR) — no shipping/voucher. Always present. */
  total: number;
  createdAt: string;
  updatedAt: string;
  gift?: CartGiftMeta;
}

export interface GuestImportSelection {
  addressId?: string | null;
  billingAddressId?: string | null;
  sameAsBilling?: boolean;
  courierCode?: string | null;
  express?: boolean;
  paymentMethodId?: string | null;
  voucherCode?: string | null;
}
