import type pg from 'pg';
import { setStatus } from '../ordersFacade.js';
import type { OrderRow } from '../../domain/order.js';
import { markOrderReturnReview, type OrderReturnType } from './orderReturnReview.js';

interface CarrierTrackingEvent {
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

function typeFromLabel(label: string): OrderReturnType | undefined {
  if (/\brefus(?:e|ee|es|ees)?\b/.test(label) || label.includes('destinataire refuse')) return 'refused';
  if (
    label.includes('non reclame') ||
    label.includes('non retire') ||
    label.includes('delai de garde') ||
    label.includes('instance expiree')
  )
    return 'unclaimed';
  if (
    label.includes('retour expediteur') ||
    label.includes('retour a l expediteur') ||
    label.includes('retourne a l expediteur') ||
    label.includes('retour vers l expediteur')
  )
    return 'other';
  return undefined;
}

function detectSignal(events: CarrierTrackingEvent[], statusCode?: string, extraLabels: string[] = []) {
  const candidates = [
    ...events.map((event) => ({ source: 'event', label: event.label, event })),
    ...extraLabels.map((label) => ({ source: 'summary', label, event: null })),
  ];
  for (const candidate of candidates.reverse()) {
    const returnType = typeFromLabel(normalize(candidate.label));
    if (!returnType) continue;
    return {
      returnType,
      evidence: {
        provider: 'mondial-relay',
        statusCode: statusCode ?? null,
        source: candidate.source,
        matchedLabel: candidate.label,
        event: candidate.event,
      },
    };
  }
  return undefined;
}

/** Return evidence wins over older forward milestones in the full carrier
 * history. The special to_send catch-up persists physical stock departure
 * without sending a misleading late shipment email. */
export async function applyCarrierReturnSignal(
  pool: pg.Pool,
  order: OrderRow,
  events: CarrierTrackingEvent[],
  statusCode?: string,
  extraLabels: string[] = [],
): Promise<
  { sent: number; available: number; received: number; returnReview: number; order: OrderRow } | undefined
> {
  const signal = detectSignal(events, statusCode, extraLabels);
  if (!signal) return undefined;
  const counts = { sent: 0, available: 0, received: 0, returnReview: 0, order };
  let current = order;
  if (current.status === 'to_send') {
    const sent = await setStatus(pool, current.id, 'sent');
    if (sent.ok) {
      current = sent.order;
      if (sent.changed) counts.sent += 1;
    }
  }
  if (current.status === 'sent' || current.status === 'disponible') {
    const marked = await markOrderReturnReview(pool, current.id, {
      returnType: signal.returnType,
      detectionSource: 'carrier',
      evidence: signal.evidence,
    });
    if (marked.ok) {
      current = marked.order;
      if (marked.changed) counts.returnReview += 1;
    }
  }
  counts.order = current;
  return counts;
}
