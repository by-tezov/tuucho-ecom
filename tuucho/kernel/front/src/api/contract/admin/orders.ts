/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/admin/orders.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */
import type { Order, OrderLineChild, OrderStatus } from '../orders';

export interface AdminOrderItem {
  id: string;
  productId: string | null;
  productUid: string;
  productType: string;
  title: string;
  desc: string | null;
  shapeLabel: string;
  shapeKey: string;
  lengthKey: string;
  /** Localized length; falls back to lengthKey. Empty for accessories. */
  lengthLabel: string;
  size: string;
  packLabel: string;
  photo: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  origin: 'user' | 'rule';
  /** Customer note typed on the cart card; null when none. */
  comment: string | null;
  /** Present when this line has child units (plugin extra set). */
  nails?: OrderLineChild[];
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** Internal exception reason; only returned to the administrator. */
  statusReason: string | null;
  /** True when incomplete commercial ledgers make resume unsafe. */
  needReviewBlocked: boolean;
  needReviewResolvedAt: string | null;
  needReviewResolvedBy: string | null;
  needReviewResolution: 'continue' | 'cancel' | null;
  stripeResolution: StripeResolutionAudit | null;
  returnReview: AdminOrderReturnReview | null;
  /** Used by an administrator to locate the payment in Stripe. */
  stripePaymentIntentId: string | null;
  userEmail: string | null;
  /** Present on gift orders when the snapshot holds the giver email. */
  giftGiverEmail?: string | null;
  /** Present on gift orders when the recipient confirmed with an email. */
  giftReceiverEmail?: string | null;
  integrityToken: string | null;
  sentAt: string | null;
  /** Last status transition time — when status is `disponible`, days at the
   * pickup point are measured from this. */
  statusUpdatedAt: string;
  total: number;
  confirmedAt: string;
  /** True when checkout was guest; stays true after the order is claimed. */
  placedAsGuest: boolean;
  adminVerified: boolean;
  adminVerifiedAt: string | null;
  paymentCaptureStatus: Order['paymentCaptureStatus'];
  paymentMethod: Order['paymentMethod'];
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
  courierName: string | null;
  packet: { quantity: number; weight: number; size: { length: number; width: number; depth: number } } | null;
  shipmentNumber: string | null;
  items: AdminOrderItem[];
  loyaltyCredit?: number;
  loyaltyEarn?: number;
  loyaltyEarnStatus?: 'pending' | 'granted' | 'void';
  shippingFee?: number;
  shippingListFee?: number;
  rulesItemDiscount?: number;
  extraLines?: Array<{ label: string; amount: number }>;
  voucherCode?: string | null;
  voucherDiscount?: number | null;
}

export type OrderReturnRefundMode = 'full' | 'courier_deduction' | 'custom' | 'none';

export interface AdminOrderReturnStockLine {
  productId: string | null;
  productUid: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
  shippedUnits: number | null;
  restockedUnits: number;
  maxRestockUnits: number | null;
  displayQuantity?: number;
  productAvailable: boolean;
}

export interface AdminOrderReturnReview {
  id: string;
  previousStatus: 'sent' | 'disponible';
  returnType: 'unclaimed' | 'refused' | 'other';
  detectionSource: 'carrier' | 'admin';
  carrierEvidence: unknown;
  detectedAt: string;
  resolutionState: 'open' | 'refund_pending' | 'resolved' | 'dismissed';
  decisionReason: string | null;
  refundMode: OrderReturnRefundMode | null;
  refundAmountCents: number | null;
  courierRetainedCents: number | null;
  courierDefaultCents: number | null;
  loyaltyEarnRetainedCents: number | null;
  courierOverrideReason: string | null;
  stripeRefundId: string | null;
  stripeRefundStatus: string | null;
  resolvedAt: string | null;
  emailStatus: 'not_sent' | 'sending' | 'sent' | 'failed';
  emailSentAt: string | null;
  emailError: string | null;
  stockLedgerComplete: boolean;
  stockLines: AdminOrderReturnStockLine[];
}

export interface OrderReturnFinancialPreview {
  totalPaidCents: number;
  alreadyRefundedCents: number;
  remainingRefundableCents: number;
  courierDefaultCents: number;
  loyaltyEarnRetainedCents: number;
  refundPending: boolean;
}

export interface ResolveOrderReturnBody {
  refundMode: OrderReturnRefundMode;
  courierRetainedCents: number;
  customRefundAmountCents?: number;
  decisionReason: string;
  courierOverrideReason?: string;
  stock: Array<{
    productUid: string;
    shapeKey: string;
    lengthKey: string;
    size: string;
    quantity: number;
  }>;
  confirmed: true;
}

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  userEmail: string | null;
  placedAsGuest: boolean;
  itemCount: number;
  total: number;
  adminVerified: boolean;
}

export interface AdminOrderPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface StripeResolutionAudit {
  decision: 'continue' | 'cancel';
  action: 'verified' | 'canceled' | 'refunded' | 'already_refunded';
  paymentIntentId: string;
  paymentIntentStatus: string;
  refundId?: string;
  refundStatus?: string | null;
}
