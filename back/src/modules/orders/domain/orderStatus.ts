import type { OrderRow, OrderStatus } from './order.js';

export const CANCELLABLE_ORDER_STATUSES = new Set<OrderStatus>(['confirmed', 'in_preparation', 'to_send']);

/** Forward-only fulfillment transition. Pickup-point delivery adds an
 * availability step that home delivery does not have. */
export function nextOrderStatus(order: Pick<OrderRow, 'status' | 'pickup_point'>): OrderStatus | undefined {
  switch (order.status) {
    case 'confirmed':
      return 'in_preparation';
    case 'in_preparation':
      return 'to_send';
    case 'to_send':
      return 'sent';
    case 'sent':
      return order.pickup_point ? 'disponible' : 'received';
    case 'disponible':
      return 'received';
    case 'received':
    case 'cancelled':
    case 'need_review':
    case 'return_review':
      return undefined;
  }
}
