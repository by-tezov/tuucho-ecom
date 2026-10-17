/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: pamsurin-back `src/contract/account.ts`.
 * Regenerate the front copy with `npm run sync:contract` in pamsurin-back.
 */
import type { AuthUser } from './identity.js';

export interface ProfilePatch {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/** 'social' unlocks the Google + Apple + Facebook block as one — its single
 * unlock button must not send two different OTP codes for one prompt. See
 * accountUnlock.service.ts (back) for which routes accept it. */
export type UnlockAction =
  'profile' | 'email' | 'password' | 'deletion' | 'google' | 'apple' | 'facebook' | 'social';

/** Link Sign in with Google to the signed-in account (GIS idToken + unlock). */
export type LinkGoogleAccountResult =
  | { success: true; user: AuthUser }
  | {
      success: true;
      needsEmailChoice: true;
      googleLinkToken: string;
      currentEmail: string;
      googleEmail: string;
    };

export type LinkAppleAccountResult =
  | { success: true; user: AuthUser }
  | {
      success: true;
      needsEmailChoice: true;
      appleLinkToken: string;
      currentEmail: string;
      appleEmail: string;
    };

export type LinkFacebookAccountResult =
  | { success: true; user: AuthUser }
  | {
      success: true;
      needsEmailChoice: true;
      facebookLinkToken: string;
      currentEmail: string;
      facebookEmail: string;
    };

export type AddressKind = 'livraison' | 'facturation';

export interface Address {
  id: string;
  /** Immutable — set once at creation. A 'facturation' address never has a
   * network or a pickup point; a 'livraison' one always does. */
  kind: AddressKind;
  label: string | null;
  /** At least one of recipientName/companyName is always set — a company
   * address may still also carry a contact person's name, so neither
   * replaces the other. */
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  /** Optional complementary delivery instructions — livraison only. */
  deliveryNotes: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
  /** An address can belong to more than one delivery network at once — a
   * single physical pickup point can genuinely be registered with more
   * than one network. Defaults to `['home']` server-side when empty for a
   * livraison address; always empty for a facturation address. */
  networkCodes: string[];
  pickupPoints: Record<string, PickupPoint>;
  isDefault: boolean;
  /** false = one-time checkout address (kept for order/sticker, hidden
   * from the saved address book). Defaults true when omitted from older
   * guest localStorage payloads. */
  savedForFuture: boolean;
}

export interface PickupPoint {
  id: string;
  /** The relay/locker's own public name, as returned by the provider's
   * picker. It belongs to the point, not to the customer: it is shown as
   * the first line of the address and is never editable — the customer's
   * own name for the address stays the free-text `label`. Absent on
   * addresses saved before this field existed. */
  name?: string;
  metadata?: Record<string, string>;
}

export interface AddressInput {
  kind: AddressKind;
  label?: string;
  /** At least one of recipientName/companyName must be set. */
  recipientName?: string;
  companyName?: string;
  line1: string;
  line2?: string | null;
  deliveryNotes?: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone?: string;
  networkCodes?: string[];
  pickupPoints?: Record<string, PickupPoint>;
  isDefault?: boolean;
  /** Defaults true server-side when omitted. Checkout may send false. */
  savedForFuture?: boolean;
}

export interface Country {
  code: string;
  label: string;
}

export interface DeliveryNetwork {
  code: string;
  name: string;
}

export interface CourierPacket {
  packetKey: string;
  maxQuantity: number;
  /** Scalar for every served country, or a map keyed by ISO country code.
   * Omitted on gift receiver courier lists (fees are never shown to Julie). */
  price?: number | Record<string, number>;
  /** Same shape as `price`; null when the courier has no express option. */
  expressPrice?: number | Record<string, number> | null;
}

/** How long this courier takes to one country, and — pickup points only —
 * how long it then holds the parcel before sending it back. Authored per
 * country in pamsurin-manager's courier/<code>.json. */
export interface CourierDeliveryTime {
  minDays: number;
  maxDays: number;
  custodyDays: number | null;
}

export interface CourierCatalogCountry {
  code: string;
  enabled: boolean;
}

export interface Courier {
  code: string;
  name: string;
  /** Optional short explanation authored with the courier catalogue. */
  description?: string;
  sortOrder: number;
  /** Countries currently open for shipping on this courier. */
  countries: string[];
  /** Full catalog (enabled + disabled); older backends omit the field. */
  catalogCountries?: CourierCatalogCountry[];
  /** Keyed by country code, and only for countries that declared an
   * estimate — a subset of `countries`, often empty. Older backends omit
   * the field entirely. */
  deliveryTimes?: Record<string, CourierDeliveryTime>;
  networks: string[];
  packets: CourierPacket[];
}

export type NotificationChannel =
  | 'emails_enabled'
  | 'order_confirmation'
  | 'order_shipped'
  | 'invoice'
  | 'security'
  | 'chat_reply'
  | 'loyalty_expiry'
  | 'nouveautes'
  | 'cart_reminder'
  | 'favorite_sold'
  | 'favorite_restock'
  | 'promo';

export interface NotificationPreferences {
  emailsEnabled: boolean;
  primary: { email: string; verified: boolean };
  transactional: {
    order_confirmation: boolean;
    order_shipped: boolean;
    invoice: boolean;
    security: boolean;
    chat_reply: boolean;
    loyalty_expiry: boolean;
  };
  marketing: {
    nouveautes: boolean;
    cart_reminder: boolean;
    favorite_sold: boolean;
    favorite_restock: boolean;
    promo: boolean;
  };
}

export interface RecentLogin {
  createdAt: string;
  ip: string | null;
  location: string | null;
  device: string | null;
}
