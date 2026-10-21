/** Courier-agnostic pickup point returned by a shipping plugin picker page
 * through location state. Kernel cart/address screens persist this shape;
 * they do not talk to a named courier widget. */
export interface PickupPoint {
  id: string;
  name: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  countryCode: string;
}
