import type pg from 'pg';
import { applyOrderStatusEffects } from '../status/orderStatusEffects.js';
import { setStatus } from '../ordersFacade.js';
import type { OrderRow, OrderStatus } from '../../domain/order.js';
import { applyCarrierReturnSignal } from '../returns/orderReturnTracking.js';

interface CarrierEvent {
  label: string;
  dateTime: string | null;
  location: string | null;
  countryCode: string | null;
}

function normalize(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isPickupPlace(label: string): boolean {
  return ['locker', 'casier', 'point relais', 'point rel', 'point de retrait'].some((value) =>
    label.includes(value),
  );
}

function isReceived(label: string): boolean {
  return (
    /\blivr(?:e|ee|es|ees)\b/.test(label) ||
    /\bretir(?:e|ee|es|ees)\b/.test(label) ||
    (label.includes('destinataire') && ['remis', 'livre', 'retir'].some((value) => label.includes(value)))
  );
}

function isAvailable(label: string): boolean {
  if (
    ['disponible', 'mis a disposition', 'mise a disposition', 'jours restants'].some((value) =>
      label.includes(value),
    )
  )
    return true;
  return isPickupPlace(label) && (label.includes('retirer') || label.includes('retrait'));
}

export function orderStatusFromTracing(
  events: CarrierEvent[],
  statusCode?: string,
  extraLabels: string[] = [],
): 'sent' | 'disponible' | 'received' | undefined {
  const labels = [...events.map((event) => normalize(event.label)), ...extraLabels.map(normalize)];
  if ((!!statusCode && /^0*82$/.test(statusCode)) || labels.some(isReceived)) return 'received';
  if (labels.some(isAvailable)) return 'disponible';
  if (labels.some((label) => label.includes('prise en charge point rel'))) return 'sent';
  return undefined;
}

function statusTargets(
  order: Pick<OrderRow, 'status' | 'pickup_point'>,
  carrierStatus: 'sent' | 'disponible' | 'received' | undefined,
): OrderStatus[] {
  if (!carrierStatus) return [];
  const path: OrderStatus[] = order.pickup_point ? ['sent', 'disponible', 'received'] : ['sent', 'received'];
  const goal = carrierStatus === 'disponible' && !order.pickup_point ? 'sent' : carrierStatus;
  const to = path.indexOf(goal);
  if (to < 0) return [];
  const current = path.indexOf(order.status);
  if (order.status !== 'to_send' && current < 0) return [];
  return path.slice(order.status === 'to_send' ? 0 : current + 1, to + 1);
}

export async function applyCarrierMilestones(
  pool: pg.Pool,
  order: OrderRow,
  events: CarrierEvent[],
  statusCode?: string,
  extraLabels: string[] = [],
): Promise<{ sent: number; available: number; received: number; returnReview: number; order: OrderRow }> {
  const returned = await applyCarrierReturnSignal(pool, order, events, statusCode, extraLabels);
  if (returned) return returned;
  const counts = { sent: 0, available: 0, received: 0, returnReview: 0, order };
  let current = order;
  for (const target of statusTargets(order, orderStatusFromTracing(events, statusCode, extraLabels))) {
    if (current.status === target) continue;
    const updated = await setStatus(pool, current.id, target);
    if (!updated.ok) break;
    current = updated.order;
    if (!updated.changed) continue;
    await applyOrderStatusEffects(pool, target, current, updated.items);
    if (target === 'sent') counts.sent += 1;
    if (target === 'disponible') counts.available += 1;
    if (target === 'received') counts.received += 1;
  }
  counts.order = current;
  return counts;
}

export function tracingAwaitingLaterMilestone(
  order: Pick<OrderRow, 'status' | 'pickup_point'>,
  carrierStatus: 'sent' | 'disponible' | 'received' | undefined,
): boolean {
  return (
    ['to_send', 'sent', 'disponible'].includes(order.status) &&
    statusTargets(order, carrierStatus).length === 0
  );
}
