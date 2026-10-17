/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: pamsurin-back `src/contract/orders.ts`.
 * Regenerate the front copy with `npm run sync:contract` in pamsurin-back.
 */
import type { PickupPoint } from './account';
import type { Size } from './cart';

export type OrderStatus =
  | 'confirmed'
  | 'in_preparation'
  | 'to_send'
  | 'sent'
  | 'disponible'
  | 'received'
  | 'cancelled'
  | 'need_review'
  | 'return_review';

export interface OrderItemPhoto {
  position: number;
  small: string | null;
  modal: string | null;
}

/** Child nail on a composed-set order line. */
export interface OrderCompositionNail {
  productId: string;
  productUid: string;
  title: string;
  shapeKey: string;
  shapeLabel: string;
  lengthKey: string;
  lengthLabel: string;
  finger: string;
  /** Variation option of a single nail (`''` when it has none), its label and
   * the axis name ("Couleur"), all frozen at confirm. */
  variationKey: string;
  variationLabel: string;
  variationAxisLabel: string;
  photo: string | null;
  /** Nail unit TTC frozen at confirm (not shown on customer line cards). */
  unitPrice?: number;
}

export interface OrderItem {
  id: string;
  productId: string | null;
  productUid: string;
  /** Catalogue set, accessory, or composed set parent. */
  productType?: 'nail' | 'accessory' | 'composition';
  title: string;
  /** Localized description snapshot; null when missing (legacy). */
  desc: string | null;
  /** Localized occasion snapshot; null for accessories / legacy. */
  occasion: string | null;
  /** Localized main color labels frozen at confirm. */
  colorMain: string[];
  /** Localized secondary color labels frozen at confirm. */
  colorSecondary: string[];
  shapeKey: string;
  shapeLabel: string;
  lengthKey: string;
  /** Frozen length label, shown next to shapeLabel in the order history line,
   * order emails, and the invoice PDF. */
  lengthLabel: string;
  /** Verified first small thumb URL, or null when missing/hash mismatch. */
  photo: string | null;
  /** All snapshotted photos for the shape/length; URLs null when modal hash
   * fails. */
  photos?: OrderItemPhoto[];
  size: Size | '';
  /** Accessory pack key ('' for nails and non-pack accessories). */
  packKey: string;
  /** Resolved pack label (e.g. "x2"); '' when the line has no pack. */
  packLabel: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  origin?: 'user' | 'rule';
  locked?: boolean;
  ruleCode?: string | null;
  /** Customer note typed on the cart card; null when none. Every size line
   * of one product+shape+length carries the same note. */
  comment?: string | null;
  /** Present when productType is composition. */
  nails?: OrderCompositionNail[];
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  deliveryNotes: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
  /** Saved livraison address id snapshotted at confirm (null for legacy). */
  addressId: string | null;
  networkCode: string | null;
  pickupPoint: PickupPoint | null;
  courierCode: string | null;
  courierName: string | null;
  trackingAvailable: boolean;
  packetKey: string | null;
  express: boolean;
  shippingFee: number;
  /** List shipping fee before free-shipping rule (strikethrough UI). */
  shippingListFee?: number;
  /** Nail-qty tier % discount amount. */
  rulesItemDiscount?: number;
  cartRulesSnapshot?: unknown;
  voucherCode: string | null;
  voucherDiscount: number | null;
  integrityToken: string | null;
  /** Number of accepted amendments in order_revisions (0 = never amended). */
  revisionCount: number;
  /** Whether funds were taken yet — see pamsurin-back payment_capture_status. */
  paymentCaptureStatus: 'authorized' | 'captured' | 'not_required' | 'canceled' | 'expired';
  /** Confirm-time how-paid snapshot; null for legacy orders. */
  paymentMethod: {
    type: 'card' | 'paypal' | 'bancontact' | 'free';
    brand: string | null;
    last4: string | null;
  } | null;
  total: number;
  confirmedAt: string;
  statusUpdatedAt: string;
  billingSameAsShipping: boolean;
  billingAddressId: string | null;
  billingRecipientName: string | null;
  billingCompanyName: string | null;
  billingLine1: string;
  billingLine2: string | null;
  billingPostalCode: string;
  billingCity: string;
  billingCountryCode: string;
  billingPhone: string | null;
  /** True when the order was placed through guest checkout, even after it
   * was later attached to this account. */
  placedAsGuest?: boolean;
  loyaltyCredit?: number;
  loyaltyEarn?: number;
  loyaltyEarnStatus?: 'pending' | 'granted' | 'void';
  /** Frozen gift snapshot. `null` when the order is not a gift promise. */
  gift?: {
    offerId: string;
    giverDisplayName: string;
    receiverName: string;
    maxSets: number | null;
    maxBudget: number | null;
    hideReceiverPrices: boolean;
  } | null;
  items: OrderItem[];
}

export interface GuestOrderCandidate {
  id: string;
  orderNumber: string;
  total: number;
  status: OrderStatus;
}

export interface TrackingEvent {
  label: string;
  dateTime: string | null;
  location: string | null;
  countryCode: string | null;
}

export interface OrderTracking {
  shipmentNumber: string;
  events: TrackingEvent[];
  /** null when the backend's live carrier call just failed — shipmentNumber
   * and externalUrl are still usable as a fallback even then. */
  fetchedAt: string | null;
  /** The carrier's own public tracking page for this shipment, decided
   * server-side (see shippingTracking.service.ts) — never hardcoded here. */
  externalUrl: string | null;
}

export type OrderRevisionKind = 'billing_address_change' | 'shipping_address_change';

export interface OrderRevisionBillingSnapshot {
  sameAsShipping: boolean;
  addressId: string | null;
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
}

export interface OrderRevisionShippingSnapshot {
  addressId: string | null;
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  deliveryNotes: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
  networkCode: string | null;
  pickupPoint: unknown;
}

export interface OrderRevision {
  id: string;
  revisionNumber: number;
  kind: OrderRevisionKind;
  diff: {
    billing?: {
      before: OrderRevisionBillingSnapshot;
      after: OrderRevisionBillingSnapshot;
    };
    shipping?: {
      before: OrderRevisionShippingSnapshot;
      after: OrderRevisionShippingSnapshot;
    };
    customerType?: { before: string; after: string };
  };
  totalBefore: number;
  totalAfter: number;
  requestedBy: 'customer' | 'ops';
  /** Hash token for the diff's `before` snapshot. Null only for legacy first
   * revisions whose confirmation snapshot was not retained. */
  previousIntegrityToken: string | null;
  integrityToken: string;
  createdAt: string;
}

export interface OrderRevisionLock {
  lockToken: string;
  lockUntil: string;
  ttlSeconds: number;
}
