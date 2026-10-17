import type { AdminAttentionCounts } from '../../hooks/useAdminAttentionCounts';
import type { AdminOrder, StripeResolutionAudit } from '../../api/admin/orders';
import type { OrderStatus } from '../../api/orders';
import { useLang } from '../../assets/i18n';
import type { AdminStatusTab } from '../../components/admin/AdminStatusTabs';
import styles from '../AdminOrdersPage.module.css';

export const BASE_STATUSES = [
  'confirmed',
  'in_preparation',
  'to_send',
  'sent',
  'disponible',
  'need_review',
  'return_review',
] as const;
export type FilterValue =
  | (typeof BASE_STATUSES)[number]
  | 'received:false'
  | 'received:true'
  | 'cancelled:false'
  | 'cancelled:true'
  | '';

/** Chip order follows the fulfilment workflow. The two exceptions lead the
 * row, but only while they hold something (or are the open filter): an empty
 * exception chip would be permanent noise. */
export const WORKFLOW_FILTERS: Exclude<FilterValue, ''>[] = [
  'confirmed',
  'in_preparation',
  'to_send',
  'sent',
  'disponible',
  'received:false',
  'received:true',
  'cancelled:false',
  'cancelled:true',
];
export const EXCEPTION_FILTERS: Exclude<FilterValue, ''>[] = ['need_review', 'return_review'];

export function parseFilter(value: string): { status: OrderStatus; verified?: boolean } | null {
  if (value === 'received:false') return { status: 'received', verified: false };
  if (value === 'received:true') return { status: 'received', verified: true };
  if (value === 'cancelled:false') return { status: 'cancelled', verified: false };
  if (value === 'cancelled:true') return { status: 'cancelled', verified: true };
  if (
    value === 'confirmed' ||
    value === 'in_preparation' ||
    value === 'to_send' ||
    value === 'sent' ||
    value === 'disponible' ||
    value === 'need_review' ||
    value === 'return_review'
  ) {
    return { status: value };
  }
  return null;
}

export function filterFromSearchParams(params: URLSearchParams): FilterValue {
  const status = params.get('status');
  const verified = params.get('verified');
  if (status === 'received' || status === 'cancelled') {
    if (verified === 'true') return `${status}:true`;
    if (verified === 'false') return `${status}:false`;
    return `${status}:false`;
  }
  if (
    status === 'confirmed' ||
    status === 'in_preparation' ||
    status === 'to_send' ||
    status === 'sent' ||
    status === 'disponible' ||
    status === 'need_review' ||
    status === 'return_review'
  ) {
    return status;
  }
  return '';
}

export function filterLabel(value: Exclude<FilterValue, ''>, t: ReturnType<typeof useLang>['t']): string {
  switch (value) {
    case 'confirmed':
      return t.ordersPage.statusConfirmed;
    case 'in_preparation':
      return t.ordersPage.statusInPreparation;
    case 'to_send':
      return t.ordersPage.statusToSend;
    case 'sent':
      return t.ordersPage.statusSent;
    case 'disponible':
      return t.ordersPage.statusDisponible;
    case 'need_review':
      return t.admin.needReviewOrderStatus;
    case 'return_review':
      return t.admin.returnReviewOrderStatus;
    case 'received:false':
      return t.admin.filterReceivedUnverified;
    case 'received:true':
      return t.admin.filterReceivedVerified;
    case 'cancelled:false':
      return t.admin.filterCancelledUnverified;
    case 'cancelled:true':
      return t.admin.filterCancelledVerified;
  }
}

/** Only some statuses have a live count (the attention-counts endpoint, plus
 * the two extra listAdminOrders totals in useAdminAttentionCounts) — the
 * rest (sent, received:true, cancelled:true) show no badge at all rather
 * than a fabricated number. */
export function filterCount(value: Exclude<FilterValue, ''>, counts: AdminAttentionCounts): number | null {
  switch (value) {
    case 'confirmed':
      return counts.orders?.confirmed ?? null;
    case 'disponible':
      return counts.orders?.disponible ?? null;
    case 'need_review':
      return counts.orders?.needReview ?? null;
    case 'return_review':
      return counts.orders?.returnReview ?? null;
    case 'in_preparation':
      return counts.ordersInPreparation;
    case 'to_send':
      return counts.ordersToSend;
    case 'received:false':
      return counts.orders?.receivedUnverified ?? null;
    case 'cancelled:false':
      return counts.orders?.cancelledUnverified ?? null;
    case 'sent':
    case 'received:true':
    case 'cancelled:true':
      return null;
  }
}

/** Soft background/border-free status tones — same convention as the
 * dashboard's urgent cards (see AdminPage.module.css): specific enough per
 * status that folding them into global tokens would be overreach. */
export const STATUS_TONE: Record<OrderStatus, string> = {
  confirmed: styles.tone_confirmed!,
  in_preparation: styles.tone_preparing!,
  to_send: styles.tone_toSend!,
  sent: styles.tone_sent!,
  disponible: styles.tone_disponible!,
  received: styles.tone_received!,
  cancelled: styles.tone_cancelled!,
  need_review: styles.tone_needReview!,
  return_review: styles.tone_returnReview!,
};

export function statusLabel(status: OrderStatus, t: ReturnType<typeof useLang>['t']): string {
  switch (status) {
    case 'confirmed':
      return t.ordersPage.statusConfirmed;
    case 'in_preparation':
      return t.ordersPage.statusInPreparation;
    case 'to_send':
      return t.ordersPage.statusToSend;
    case 'sent':
      return t.ordersPage.statusSent;
    case 'disponible':
      return t.ordersPage.statusDisponible;
    case 'received':
      return t.ordersPage.statusReceived;
    case 'cancelled':
      return t.ordersPage.statusCancelled;
    case 'need_review':
      return t.admin.needReviewOrderStatus;
    case 'return_review':
      return t.admin.returnReviewOrderStatus;
  }
}

export function OrderOriginBadge({
  placedAsGuest,
  t,
}: {
  placedAsGuest: boolean;
  t: ReturnType<typeof useLang>['t'];
}) {
  return (
    <span className={`${styles.originBadge} ${placedAsGuest ? styles.originGuest : styles.originRegistered}`}>
      {placedAsGuest ? t.admin.orderGuestBadge : t.admin.orderRegisteredBadge}
    </span>
  );
}

export function needReviewResolutionMessage(
  resolution: StripeResolutionAudit,
  t: ReturnType<typeof useLang>['t'],
): string {
  switch (resolution.action) {
    case 'verified':
      return t.admin.needReviewOrderResolvedVerified(resolution.paymentIntentId);
    case 'canceled':
      return t.admin.needReviewOrderResolvedCanceled(resolution.paymentIntentId);
    case 'refunded':
      return t.admin.needReviewOrderResolvedRefunded(resolution.refundId ?? resolution.paymentIntentId);
    case 'already_refunded':
      return t.admin.needReviewOrderResolvedAlreadyRefunded(resolution.paymentIntentId);
  }
}

export function groupedItems(items: AdminOrder['items']) {
  const groups = new Map<string, AdminOrder['items']>();
  for (const item of items) {
    const key = [
      item.origin,
      item.productType,
      item.productUid,
      item.shapeLabel,
      item.lengthKey,
      item.packLabel,
    ].join('::');
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()];
}

/** Options of the orders status filter: workflow queues in order, preceded by
 * the two exceptions only while they hold something (or are the open one). */
export function orderStatusTabs(
  filter: FilterValue,
  counts: AdminAttentionCounts,
  t: ReturnType<typeof useLang>['t'],
): AdminStatusTab<Exclude<FilterValue, ''>>[] {
  return [
    ...EXCEPTION_FILTERS.filter((value) => (filterCount(value, counts) ?? 0) > 0 || value === filter),
    ...WORKFLOW_FILTERS,
  ].map((value) => ({
    value,
    label: filterLabel(value, t),
    count: filterCount(value, counts),
    urgent: EXCEPTION_FILTERS.includes(value),
  }));
}
