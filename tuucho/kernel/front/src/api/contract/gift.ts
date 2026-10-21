/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/gift.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */

export type GiftStatus = 'selecting' | 'awaiting_payment' | 'paying' | 'ordered' | 'cancelled' | 'expired';

export type GiftShareCardStyle =
  | 'classic'
  | 'anniversaire'
  | 'mariage'
  | 'fete'
  | 'noel'
  | 'valentin'
  | 'meres'
  | 'merci'
  | 'diplome'
  | 'amitie'
  | 'minimal'
  | 'coquin'
  | 'manga'
  | 'halloween'
  | 'nouvelan'
  | 'artdeco'
  | 'botanique'
  | 'neon'
  | 'celeste'
  | 'fantastique';

export interface GiftClocks {
  offerExpiresAt: string | null;
  holdExpiresAt: string | null;
  payByAt: string | null;
  receiverVisibleUntil: string | null;
}

export interface GiftItem {
  productId: string;
  productUid?: string;
  productType?: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
  packKey?: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
}

export interface GiftDestination {
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  deliveryNotes: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
  courierCode: string;
  networkCodes: string[];
  pickupPoints: Record<string, unknown>;
}

export interface GiftSummary {
  success: true;
  id: string;
  status: GiftStatus;
  giverDisplayName: string;
  receiverName: string;
  receiverEmail?: string | null;
  giverComment?: string | null;
  shareCardStyle?: GiftShareCardStyle;
  maxSets: number | null;
  maxBudget: number | null;
  allowAccessories?: boolean;
  maxAccessoryBudget?: number | null;
  hideReceiverPrices: boolean;
  remaining: {
    quantity: number;
    merchandise: number;
    remainingSlots: number | null;
    remainingBudget: number | null;
    accessoryMerchandise?: number;
    remainingAccessoryBudget?: number | null;
  };
  clocks: GiftClocks;
  /** Giver payload only: whether another two weeks would still sit inside
   * `GIFT_EXTEND_CEILING_DAYS`. Absent on receiver payloads. */
  canExtend?: boolean;
  items: GiftItem[];
  /** Opaque plugin extra on the gift cart. Kernel gift HTTP does not read it. */
  extra?: unknown;
  destination: GiftDestination | null;
  orderId: string | null;
  cartId?: string | null;
  orderNumber?: string | null;
  orderStatus?: string | null;
  orderConfirmedAt?: string | null;
  shareCard?: { receiverUrl: string; receiverToken: string; qrDataUri: string } | null;
}

export interface GiftPublicSettings {
  success: true;
  /** Always true. Kept so an older shop build still shows Offrir. */
  enabled: boolean;
  maxSetsCeiling: number;
  /** Smallest sets budget create accepts (`GIFT_MIN_BUDGET`). */
  minBudget: number;
  maxBudgetCeiling: number;
  maxAccessoryBudgetCeiling: number;
  receiverTokenTtlDays: number;
  stockHoldTtlDays: number;
  giverPayTtlDays: number;
  /** Cheapest and dearest public nail set currently in stock, rounded out to
   * whole euros. Null when nothing is buyable. `/gift` turns it into the
   * "about this many sets" estimate under the budget input. */
  setPriceRange: { min: number; max: number } | null;
}

export interface AdminGiftOffer {
  id: string;
  status: GiftStatus;
  giverEmail: string;
  giverDisplayName: string;
  receiverName: string;
  /** Null until the recipient confirms with an email. */
  receiverEmail: string | null;
  maxSets: number | null;
  maxBudget: number | null;
  allowAccessories: boolean;
  maxAccessoryBudget: number | null;
  clocks: {
    offerExpiresAt: string | null;
    holdExpiresAt: string | null;
    payByAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

/** `POST /admin/gift/offers/:id/enter`. The two tokens are secrets: the
 * capability token is the customer link, the pin token is a real PIN grant. */
export interface AdminGiftEnter {
  role: 'giver' | 'receiver';
  language: 'en' | 'fr';
  capabilityToken: string;
  pinToken: string;
  expiresAt: string;
  /** Giver gift cart, after open-pay. Null for the recipient. */
  cartId: string | null;
}
