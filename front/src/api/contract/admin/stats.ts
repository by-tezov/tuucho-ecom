/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: pamsurin-back `src/contract/admin/stats.ts`.
 * Regenerate the front copy with `npm run sync:contract` in pamsurin-back.
 */
import type { LoyaltyAdminStats } from '../loyalty';

export interface AdminOrderAttentionCounts {
  confirmed: number;
  disponible: number;
  needReview: number;
  returnReview: number;
  receivedUnverified: number;
  cancelledUnverified: number;
}

export interface AdminStatsSizeBucket {
  quantity: number;
  stockValue: number;
}

export interface AdminStats {
  library: {
    quantity: number;
    stockValue: number;
    averageUnitPrice: number | null;
    minUnitPrice: number | null;
    maxUnitPrice: number | null;
    bySize: {
      XS: AdminStatsSizeBucket;
      S: AdminStatsSizeBucket;
      M: AdminStatsSizeBucket;
      L: AdminStatsSizeBucket;
    };
  };
  accessories: {
    quantity: number;
    stockValue: number;
    averageUnitPrice: number | null;
  };
  orders: {
    confirmed: number;
    sent: number;
    received: number;
    cancelled: number;
    merchandiseSold: number;
    shippingPaid: number;
    totalSold: number;
  };
  loyalty?: LoyaltyAdminStats;
}
