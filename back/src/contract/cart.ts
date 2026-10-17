/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: pamsurin-back `src/contract/cart.ts`.
 * Regenerate the front copy with `npm run sync:contract` in pamsurin-back.
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

export type CompositionFinger =
  | 'left-thumb'
  | 'left-index'
  | 'left-middle'
  | 'left-ring'
  | 'left-pinky'
  | 'right-thumb'
  | 'right-index'
  | 'right-middle'
  | 'right-ring'
  | 'right-pinky';

/** One nail inside a composed set. Shape and length are per nail. */
export interface CartCompositionNail {
  productId: string;
  productUid: string;
  title: string;
  shapeKey: string;
  lengthKey: string;
  shapeLabel: string;
  lengthLabel: string;
  finger: CompositionFinger;
  /** Variation option of a single nail with variations (`''` otherwise),
   * its localized label and the localized axis name ("Couleur"). */
  variationKey: string;
  variationLabel: string;
  variationAxisLabel: string;
  photo: string | null;
  /** Unit TTC for this nail (server price, the option's own when it has one). */
  unitPrice: number;
  /** False when this shape × length × option × composition size is no longer offered. */
  available: boolean;
}

/** A composed nail set in the cart. Never a catalogue product line. */
export interface CartComposition {
  id: string;
  size: Size;
  quantity: number;
  /** True while the customer left modify mode without update or cancel. */
  editing: boolean;
  /** Sum of nail unit prices (server). */
  unitPrice: number;
  /** False when any nail is unavailable for the shared size. */
  available: boolean;
  nails: CartCompositionNail[];
  /** Customer note for the set; absent when none. */
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
