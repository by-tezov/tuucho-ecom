import type { OrderItemRow, OrderRow } from '../../domain/order.js';

export type SetStatusResult =
  | { ok: true; changed: boolean; order: OrderRow; items: OrderItemRow[] }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'invalid_transition'
        | 'shipping_packet_missing'
        | 'order_revision_locked'
        | 'order_revision_lock_stale'
        | 'payment_capture_failed'
        | 'stripe_not_configured';
      order?: OrderRow;
      message?: string;
    };
