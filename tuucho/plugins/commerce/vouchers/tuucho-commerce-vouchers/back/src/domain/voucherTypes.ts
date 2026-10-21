/** The voucher shapes the whole module agrees on: what an operator declares
 * and what the table stores. Pure types, so the pure pricing rules beside
 * them can use them without reaching back into the application layer. */

export type VoucherOfferType = 'percent' | 'amount' | 'free_shipping' | 'free_item' | 'free_item_nth';
export type VoucherFailureReason =
  | 'voucher_not_found'
  | 'voucher_disabled'
  | 'voucher_not_started'
  | 'voucher_expired'
  | 'voucher_depleted'
  | 'voucher_user_not_allowed'
  | 'voucher_user_limit_reached'
  | 'voucher_conditions_not_met';

export interface VoucherDesiredState {
  enabled: boolean;
  quantity: number;
  /** Per-customer cap; `0` means unlimited (global `quantity` still applies). */
  maxUsesPerUser: number;
  /** Minimum merchandise subtotal (after cart rules, before shipping/voucher). */
  minSubtotal?: number | null;
  startsAt: string;
  endsAt: string;
  /** Empty means every authenticated customer may redeem the voucher. */
  allowedUserIds: string[];
  offer: {
    type: VoucherOfferType;
    percent?: number;
    amount?: number;
    requiredItemQuantity?: number;
    maxItemPrice?: number;
  };
}

export interface VoucherRow {
  code: string;
  enabled: boolean;
  quantity: number;
  max_uses_per_user: number;
  min_subtotal: string | null;
  starts_at: string;
  ends_at: string;
  allowed_user_ids: string[];
  offer_type: VoucherOfferType;
  percent: string | null;
  amount: string | null;
  required_item_quantity: number | null;
  max_item_price: string | null;
}
