/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/contact.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */
import type { Size } from './cart.js';

export interface AnonymousContactMessage {
  email: string;
  identity: string;
  message: string;
  images?: File[];
}

/** "Make this sold-out size for me" — see the cart page's size picker
 * (SelectionPickerModal). The backend resolves the product's reference and
 * title itself, so only its id and the variant travel here. */
export interface ProductRequest {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  size: Size;
  /** How many the customer wants made. Only the gallery's "request your
   * size" dialog asks; the cart's entry points send the line's own count
   * or 1. */
  quantity: number;
  /** Optional note for the workshop. Omitted when empty. */
  comment?: string;
}
