import type { OrderStatus as ContractOrderStatus } from '../../../contract/orders.js';
import type { PartialTrilingual } from '../../../types.js';
import type { Language } from '../../../utils/language.js';

export interface OrderPickupPoint {
  id: string;
  name?: string;
  metadata?: Record<string, string>;
}

export const ORDER_STATUSES = [
  'confirmed',
  'in_preparation',
  'to_send',
  'sent',
  'disponible',
  'received',
  'cancelled',
  'need_review',
  'return_review',
] as const;
/** Published in every order payload, so the API contract owns the vocabulary.
 * The assignment below is what makes a divergence a compile error rather than
 * a status the front cannot render. */
export type OrderStatus = ContractOrderStatus;
const _statusesMatchContract: readonly ContractOrderStatus[] = ORDER_STATUSES;
void _statusesMatchContract;

export interface OrderRow {
  id: string;
  /** Null for a still-unlinked guest order — see guest_email below. Exactly
   * one of the two is ever set (orders_owner_chk). A manage-order token or
   * an integrity-code claim may set this later; `placed_as_guest` stays
   * true so origin remains visible. Guest confirm never auto-attaches. */
  user_id: string | null;
  /** Only set when user_id is null — a guest order's sole contact point.
   * Nulled both when the order is claimed by an account and when an account
   * deletion orphans it, which is what makes an orphan permanently
   * unclaimable (see owner_deleted_at). */
  guest_email: string | null;
  /** Blind index over guest_email (HMAC of the normalized address), so the
   * claim paths can match in SQL instead of decrypting the table. Null
   * exactly when guest_email is. */
  guest_email_lookup: string | null;
  /** Set when the owning account was permanently deleted. The order keeps its
   * full snapshot but belongs to nobody, and stays that way forever — this is
   * the terminal third state of orders_owner_chk. */
  owner_deleted_at: string | null;
  /** Who placed the order, snapshotted at insert by the
   * orders_customer_identity_snapshot trigger so the record survives the
   * account being deleted. Encrypted; never blind-indexed, deliberately —
   * an orphan must not be findable by email. */
  customer_email: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  /** True when the order was placed through unauthenticated guest checkout,
   * even after it is later attached to an account. */
  placed_as_guest: boolean;
  /** Guest-checkout locale snapshot. Null on connected-checkout orders
   * (those use the account language preference). */
  language: Language | null;
  order_number: string;
  status: OrderStatus;
  /** Internal exception state. Never expose this reason to customers. */
  status_reason: string | null;
  need_review_blocked: boolean;
  need_review_resolved_at: string | null;
  need_review_resolved_by: string | null;
  need_review_resolution: 'continue' | 'cancel' | null;
  stripe_resolution: unknown;
  /** At least one of recipient_name/company_name is always set (DB check
   * constraint) — see addresses.service.ts's own OrderRow-adjacent comment. */
  recipient_name: string | null;
  company_name: string | null;
  line1: string;
  line2: string | null;
  /** Snapshot of the livraison address's delivery notes at confirm time. */
  delivery_notes: string | null;
  postal_code: string;
  city: string;
  country_code: string;
  phone: string | null;
  address_id: string | null;
  network_code: string | null;
  pickup_point: OrderPickupPoint | null;
  courier_id: string | null;
  courier_code: string | null;
  courier_name: PartialTrilingual | null;
  packet_key: string | null;
  express: boolean;
  shipping_fee: string;
  voucher_code: string | null;
  voucher_item_discount: string;
  voucher_shipping_discount: string;
  rules_item_discount: string;
  shipping_list_fee: string;
  cart_rules_snapshot: unknown;
  loyalty_credit: string;
  loyalty_earn: string;
  loyalty_earn_status: 'pending' | 'granted' | 'void';
  loyalty_granted_at: string | null;
  total: string;
  /** Stripe PaymentIntent id, or `free:<reservationId>` for zero-total. */
  stripe_payment_intent_id: string | null;
  /**
   * When money was / will be taken:
   * - `authorized` — manual-capture hold (card or PayPal); capture on set-status
   * - `captured` — funds taken after ensurePaymentCaptured (or rare already-succeeded PI)
   * - `not_required` — free/voucher €0
   * - `canceled` — auth released on cancel before capture
   * - `expired` — Stripe auth window ended before capture; funds never taken
   */
  payment_capture_status: 'authorized' | 'captured' | 'not_required' | 'canceled' | 'expired';
  /** Internal cross-process mutex for Stripe capture/cancel work. The row is
   * marked and committed before network I/O, so no pool connection or row
   * lock is held while Stripe responds. Never exposed to customers. */
  payment_operation: 'capture' | 'cancel' | null;
  payment_operation_started_at: string | null;
  /**
   * Confirm-time snapshot of how payment was made / requested. Null only on
   * rows that predate this column on an older DB. `card` may still have null
   * brand/last4 if Stripe did not expand the PM.
   */
  payment_method_type: 'card' | 'paypal' | 'bancontact' | 'free' | null;
  payment_card_brand: string | null;
  payment_card_last4: string | null;
  /** HMAC fingerprint of this row's current snapshot content — see
   * computeOrderContentHash / applyOrderRevision. Set once in confirmOrder
   * (revision 0), then rewritten to each later revision's chained hash.
   * Null for orders confirmed before this column existed. */
  content_hash: string | null;
  /** Billing snapshot, always populated — mirrored from the delivery
   * address's own fields above when the customer chose "same as delivery"
   * (billing_same_as_shipping = true), or from a distinct kind='facturation'
   * address otherwise. Never null, unlike the delivery fields' own history
   * with content_hash — every order has always had a billing address, even
   * ones confirmed before this column existed (backfilled by the migration).
   * Mutable only through applyOrderRevision (billing_address_change). */
  billing_address_id: string | null;
  billing_recipient_name: string | null;
  billing_company_name: string | null;
  billing_line1: string;
  billing_line2: string | null;
  billing_postal_code: string;
  billing_city: string;
  billing_country_code: string;
  billing_phone: string | null;
  billing_same_as_shipping: boolean;
  /** Derived from whichever address serves as this order's billing identity
   * — the facturation address when one is used, otherwise the delivery
   * address. Re-derived on billing_address_change revisions. Feeds a later
   * VAT/TVA feature, not shown to the customer. */
  customer_type: 'particulier' | 'entreprise';
  /** Active customer edit lock — see acquireRevisionLock. Null when unlocked
   * or after a successful apply/release. */
  revision_lock_token: string | null;
  revision_lock_until: string | null;
  revision_lock_user_id: string | null;
  /** content_hash at lock acquire — used to detect concurrent changes when
   * saving after the lock TTL has expired. */
  revision_lock_baseline_hash: string | null;
  /** One-way admin acknowledgement for `received` / `cancelled`. Null =
   * still needs attention on the admin hub. Ignored by customer APIs. */
  admin_verified_at: string | null;
  /** Physical handoff time, preserved even after carrier-driven status changes. */
  sent_at: string | null;
  /** Frozen gift context when this order fulfilled a gift promise. */
  gift_offer_id: string | null;
  gift_snapshot: unknown;
  plugin_snapshot?: unknown;
  confirmed_at: string;
  status_updated_at: string;
  created_at: string;
}

export interface OrderItemPhotoSnapshot {
  position: number;
  smallPath: string;
  modalPath: string;
  hash: string;
}

export interface OrderItemColorSnapshot {
  key: string;
  role: 'main' | 'secondary';
  label: PartialTrilingual;
}

export interface OrderChildRow {
  id: string;
  order_item_id: string;
  position: number;
  product_id: string | null;
  product_uid: string;
  title: PartialTrilingual;
  shape_key: string;
  length_key: string;
  shape_label: PartialTrilingual | null;
  length_label: PartialTrilingual | null;
  finger: string;
  photo_path: string | null;
  unit_price: string;
  variation_key: string;
  variation_label: PartialTrilingual | null;
  variation_axis_label: PartialTrilingual | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_uid: string;
  product_type: string;
  title: PartialTrilingual;
  /** Multilingual product description snapshot; null for legacy rows. */
  desc: PartialTrilingual | null;
  /** Multilingual occasion snapshot; null for accessories / legacy. */
  occasion: PartialTrilingual | null;
  /** Product colors + vocabulary labels frozen at confirm; `[]` when none/legacy. */
  colors: OrderItemColorSnapshot[] | string;
  shape_key: string;
  length_key: string;
  shape_label: PartialTrilingual | null;
  length_label: PartialTrilingual | null;
  photo_path: string | null;
  /** All photos for the ordered shape at confirm time (paths + modal hash). */
  photos: OrderItemPhotoSnapshot[] | string;
  size: string;
  pack_key: string;
  pack_label: PartialTrilingual | null;
  quantity: number;
  unit_price: string;
  line_total: string;
  origin: 'user' | 'rule';
  locked: boolean;
  rule_code: string | null;
  /** Customer note typed on the cart card; null when none. */
  comment: string | null;
  /** Plugin-owned child lines (custom sets). */
  nails?: OrderChildRow[];
}

export function parseOrderItemColors(
  value: OrderItemRow['colors'] | null | undefined,
): OrderItemColorSnapshot[] {
  if (value == null) return [];
  const raw = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const key = typeof row.key === 'string' ? row.key : '';
      const role = row.role === 'main' || row.role === 'secondary' ? row.role : null;
      const label =
        row.label && typeof row.label === 'object' && typeof (row.label as { fr?: unknown }).fr === 'string'
          ? (row.label as PartialTrilingual)
          : null;
      if (!key || !role || !label) return null;
      return { key, role, label };
    })
    .filter((entry): entry is OrderItemColorSnapshot => entry !== null);
}

export function parseOrderItemPhotos(
  value: OrderItemRow['photos'] | null | undefined,
): OrderItemPhotoSnapshot[] {
  if (value == null) return [];
  const raw = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const position = Number(row.position);
      const smallPath = typeof row.smallPath === 'string' ? row.smallPath : '';
      const modalPath = typeof row.modalPath === 'string' ? row.modalPath : '';
      const hash = typeof row.hash === 'string' ? row.hash : '';
      if (!Number.isFinite(position) || !smallPath || !modalPath) return null;
      return { position, smallPath, modalPath, hash };
    })
    .filter((entry): entry is OrderItemPhotoSnapshot => entry !== null);
}

export interface AdminOrderRow extends OrderRow {
  user_email: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  user_phone: string | null;
}

export interface AdminOrderListRow extends AdminOrderRow {
  item_count: string;
}
