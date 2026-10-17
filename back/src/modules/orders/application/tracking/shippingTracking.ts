import { createHash } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../../config/env.js';
import { type OrderRow, type OrderStatus } from '../ordersFacade.js';
import * as couriers from '../../../delivery/application/couriers.js';
import {
  applyCarrierMilestones,
  orderStatusFromTracing,
  tracingAwaitingLaterMilestone,
} from './orderTrackingMilestones.js';

export interface TrackingEvent {
  label: string;
  dateTime: string | null;
  location: string | null;
  countryCode: string | null;
}

export interface TrackingResult {
  shipmentNumber: string;
  events: TrackingEvent[];
  /** null when the live carrier call itself failed just now (config issue,
   * network error, unexpected response) — the frontend still has a
   * shipmentNumber + externalUrl to fall back on even then, see below. */
  fetchedAt: string | null;
  /** The provider's own public tracking page, when known for the resolved
   * provider — content, not courier-branching logic (the frontend never
   * decides this itself, it just renders whatever URL the backend already
   * determined for this specific order's actual carrier). null for a
   * provider with no known public page. */
  externalUrl: string | null;
}

export class ShippingTrackingError extends Error {
  readonly code: 'tracking_unavailable' | 'tracking_configuration_missing' | 'shipment_not_found';
  readonly webserviceCall?: ShipmentTrackingWebserviceCall;

  constructor(
    code: ShippingTrackingError['code'],
    message: string,
    webserviceCall?: ShipmentTrackingWebserviceCall,
  ) {
    super(message);
    this.code = code;
    this.webserviceCall = webserviceCall;
  }
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new ShippingTrackingError('tracking_configuration_missing', `Missing ${name}.`);
  return value;
}

// Tracing is only ever refreshed from the carrier at most every FRESHNESS_MS
// — Mondial Relay's own documentation says WSI2_TracingColisDetaille "must
// not be called more than 4 to 6 times a day" per shipment and is not meant
// for live polling, so a multi-hour cache comfortably stays under that even
// if several customers reopen the tracking modal the same day.
const FRESHNESS_MS = 4 * 60 * 60 * 1000;
// When an in-flight order's cached events still do not justify the next
// lifecycle step, a customer/admin opening tracking may catch SOAP up sooner
// than the four-hour poll. Floor that extra call so the modal cannot burn
// the daily tracing budget on repeat opens.
const USER_CATCHUP_MS = 15 * 60 * 1000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TrackingProvider = 'mondial-relay';

/** Which backend provider (if any) knows how to fetch tracing for this
 * order's courier — resolved the same way shippingLabels.service.ts's
 * mondialRelayDelivery() resolves label generation: by comparing
 * order.courier_code against config-driven codes, never a literal courier
 * name/id. A courier can be marked `trackingAvailable` in the catalog
 * (customer-facing "we can track this") without a provider being
 * implemented for it yet — that's a configuration/roadmap gap, not
 * something the customer can act on, so it collapses into the same
 * `tracking_unavailable` outcome as the flag being off. */
function resolveTrackingProvider(order: OrderRow): TrackingProvider | undefined {
  const mr = config.mondialRelay;
  const isMondialRelay =
    (!!mr.pointCourierCode && order.courier_code === mr.pointCourierCode) ||
    (!!mr.homeCourierCode && order.courier_code === mr.homeCourierCode);
  return isMondialRelay ? 'mondial-relay' : undefined;
}

// Mondial Relay's public tracking form accepts the shipment number and the
// recipient postal code in its query string. Build that URL server-side from
// the immutable order snapshot so neither browser has to guess the carrier's
// parameter names or expose a shipment number in its own routing state.
function externalTrackingUrl(
  provider: TrackingProvider,
  shipmentNumber: string,
  postalCode: string,
): string | null {
  switch (provider) {
    case 'mondial-relay': {
      const baseUrl = config.mondialRelay.publicTrackingUrl;
      if (!baseUrl) return null;
      try {
        const url = new URL(baseUrl);
        const isMondialRelayHost =
          url.hostname === 'mondialrelay.fr' || url.hostname.endsWith('.mondialrelay.fr');
        if (url.protocol !== 'https:' || !isMondialRelayHost) return null;
        url.searchParams.set('numeroExpedition', shipmentNumber);
        url.searchParams.set('codePostal', postalCode);
        return url.toString();
      } catch {
        return null;
      }
    }
  }
}

function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character]!,
  );
}

function xmlTag(xml: string, tag: string): string | undefined {
  const namespace = '(?:[A-Za-z_][\\w.-]*:)?';
  const match = new RegExp(`<${namespace}${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${namespace}${tag}>`, 'i').exec(
    xml,
  );
  return match?.[1]
    ?.replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function xmlTagAll(xml: string, tag: string): string[] {
  const namespace = '(?:[A-Za-z_][\\w.-]*:)?';
  const regex = new RegExp(`<${namespace}${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${namespace}${tag}>`, 'gi');
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) matches.push(match[0]);
  return matches;
}

// Mondial Relay's legacy API1 (SOAP) computes Security the same way across
// its methods: concatenate the request's own parameters, in the exact order
// the WSDL declares them (Security itself excluded), append the account's
// private key, then uppercase MD5 the result. The WSI2_TracingColisDetaille
// parameter order below (Enseigne, Expedition, Langue) is per Mondial
// Relay's published WSI2 operation schema.
function tracingSecurityKey(
  enseigne: string,
  expedition: string,
  langue: string,
  privateKey: string,
): string {
  return createHash('md5')
    .update(`${enseigne}${expedition}${langue}${privateKey}`)
    .digest('hex')
    .toUpperCase();
}

const MONDIAL_RELAY_LANGUAGE: Partial<Record<string, string>> = {
  fr: 'FR',
  en: 'EN',
  es: 'ES',
  it: 'IT',
  nl: 'NL',
  pt: 'PT',
};

/** WSI2 returns an ISO-like date and a distinct time field. Convert the two
 * official fields to the ISO timestamp exposed by our API; support the
 * documented DD/MM/YYYY form and the live SOAP DD/MM/YY form too rather
 * than leaving the frontend a value JavaScript cannot reliably parse. */
function tracingDateTime(date: string | undefined, time: string | undefined): string | null {
  if (!date) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const french = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(date);
  const day = iso?.[3] ?? french?.[1];
  const month = iso?.[2] ?? french?.[2];
  let year = iso?.[1] ?? french?.[3];
  if (year?.length === 2) year = `20${year}`;
  if (!year || !month || !day) return date;
  const clock = /^\d{2}:\d{2}(?::\d{2})?$/.test(time ?? '') ? time! : '00:00:00';
  return `${year}-${month}-${day}T${clock.length === 5 ? `${clock}:00` : clock}`;
}

/** The generated SOAP response names (`Libelle`, `Date`, …) are shown by
 * Mondial Relay's live WSDL. Their PDF technical guide calls the same child
 * fields `Tracing_Libelle`, `Tracing_Date`, …, so accept both documented
 * spellings while always reading the actual `Tracing` collection. */
function parseMondialRelayTracing(xml: string): TrackingEvent[] {
  return xmlTagAll(xml, 'ret_WSI2_sub_TracingColisDetaille')
    .map((entry) => {
      const date = xmlTag(entry, 'Date') ?? xmlTag(entry, 'Tracing_Date');
      const time = xmlTag(entry, 'Heure') ?? xmlTag(entry, 'Tracing_Heure');
      return {
        label: xmlTag(entry, 'Libelle') ?? xmlTag(entry, 'Tracing_Libelle') ?? '',
        dateTime: tracingDateTime(date, time),
        location: xmlTag(entry, 'Emplacement') ?? xmlTag(entry, 'Tracing_Lieu') ?? null,
        countryCode: xmlTag(entry, 'Relais_Pays') ?? xmlTag(entry, 'Tracing_Pays') ?? null,
      };
    })
    .filter((event) => event.label);
}

/** WSI2 pads `Tracing` with dozens of empty `ret_WSI2_sub_TracingColisDetaille`
 * rows. Drop those from the logged SOAP body; parsing already ignores them. */
function stripEmptyTracingSlots(xml: string): string {
  let stripped = xml;
  const seen = new Set<string>();
  for (const entry of xmlTagAll(xml, 'ret_WSI2_sub_TracingColisDetaille')) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    const label = xmlTag(entry, 'Libelle') ?? xmlTag(entry, 'Tracing_Libelle') ?? '';
    if (label) continue;
    stripped = stripped.split(entry).join('');
  }
  return stripped;
}

export interface ShipmentTrackingWebserviceCall {
  shipmentNumber: string;
  url: string;
  request: string;
  responseStatus: number | null;
  response: string | null;
  error?: string;
}

interface MondialRelayTracingResult {
  events: TrackingEvent[];
  /** WSI2 tracing STAT: 80 recorded, 81 in process, 82 delivered, 83 anomaly. */
  statusCode: string | undefined;
  /** Result-level Libelle01/02 (current-step titles, not the Tracing rows). */
  summaryLabels: string[];
  webserviceCall: ShipmentTrackingWebserviceCall;
}

async function mondialRelayTracing(
  shipmentNumber: string,
  language: string,
): Promise<MondialRelayTracingResult> {
  const mr = config.mondialRelay;
  const apiUrl = required(mr.api1Url, 'MONDIAL_RELAY_API1_URL');
  const enseigne = required(mr.api1Enseigne, 'MONDIAL_RELAY_API1_ENSEIGNE');
  const privateKey = required(mr.api1PrivateKey, 'MONDIAL_RELAY_API1_PRIVATE_KEY');
  const langue = MONDIAL_RELAY_LANGUAGE[language] ?? 'FR';
  const security = tracingSecurityKey(enseigne, shipmentNumber, langue, privateKey);

  const body = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><WSI2_TracingColisDetaille xmlns="http://www.mondialrelay.fr/webservice/"><Enseigne>${escapeXml(enseigne)}</Enseigne><Expedition>${escapeXml(shipmentNumber)}</Expedition><Langue>${escapeXml(langue)}</Langue><Security>${escapeXml(security)}</Security></WSI2_TracingColisDetaille></soap:Body></soap:Envelope>`;
  // The request's Security value is derived from the merchant private key.
  // It must never be retained in a log, even a protected operations log.
  const loggedRequest = body.replace(/<Security>[\s\S]*?<\/Security>/i, '<Security>[redacted]</Security>');
  let response: Response;
  let xml: string;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'text/xml; charset=utf-8',
        soapaction: 'http://www.mondialrelay.fr/webservice/WSI2_TracingColisDetaille',
      },
      body,
      signal: AbortSignal.timeout(mr.trackingTimeoutMs),
    });
    xml = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown request error.';
    throw new ShippingTrackingError(
      'shipment_not_found',
      `Mondial Relay tracing request failed: ${message}`,
      {
        shipmentNumber,
        url: apiUrl,
        request: loggedRequest,
        responseStatus: null,
        response: null,
        error: message,
      },
    );
  }
  const webserviceCall: ShipmentTrackingWebserviceCall = {
    shipmentNumber,
    url: apiUrl,
    request: loggedRequest,
    responseStatus: response.status,
    response: stripEmptyTracingSlots(xml),
  };
  if (!response.ok)
    throw new ShippingTrackingError(
      'shipment_not_found',
      `Mondial Relay tracing returned ${response.status}.`,
      webserviceCall,
    );

  const statusCode = xmlTag(xml, 'STAT');
  // Mondial Relay's WSI2 documentation defines 80–83 as normal tracing
  // states (registered, in process, delivered, …), alongside 0. They still
  // carry the tracking timeline, so rejecting every non-zero value hid valid
  // in-flight shipments from customers.
  if (statusCode && statusCode !== '0' && !/^(80|81|82|83)$/.test(statusCode))
    throw new ShippingTrackingError(
      'shipment_not_found',
      `Mondial Relay tracing status ${statusCode}.`,
      webserviceCall,
    );

  return {
    events: parseMondialRelayTracing(xml),
    statusCode,
    summaryLabels: parseMondialRelaySummaryLabels(xml),
    webserviceCall,
  };
}

/** WSI2 puts the current-step title on the result (`Libelle01`), separately
 * from the `Tracing` history. Locker availability sometimes lands there
 * before the matching history row. */
function parseMondialRelaySummaryLabels(xml: string): string[] {
  return ['Libelle01', 'Libelle02']
    .map((tag) => xmlTag(xml, tag))
    .filter((value): value is string => !!value);
}

interface TrackingCacheRow {
  shipment_number: string | null;
  tracking_events: TrackingEvent[] | null;
  tracking_fetched_at: string | null;
}

async function cacheTrackingEvents(
  pool: pg.Pool,
  orderId: string,
  events: TrackingEvent[],
  fetchedAt: string,
): Promise<void> {
  await pool.query(
    `update order_shipping_labels set tracking_events = $2, tracking_fetched_at = $3 where order_id = $1`,
    [orderId, JSON.stringify(events), fetchedAt],
  );
}

function addMilestoneCounts(
  result: ShipmentTrackingCronResult,
  counts: { sent: number; available: number; received: number; returnReview?: number },
): void {
  result.sentMarked += counts.sent;
  result.availableMarked += counts.available;
  result.receivedMarked += counts.received;
  result.returnReviewMarked += counts.returnReview ?? 0;
}

export interface ShipmentTrackingCronResult {
  skipped: boolean;
  reason?: 'tracking_not_configured' | 'mondial_relay_not_configured';
  candidates: number;
  fetched: number;
  webserviceCalls: ShipmentTrackingWebserviceCall[];
  sentMarked: number;
  availableMarked: number;
  receivedMarked: number;
  returnReviewMarked: number;
  failed: number;
}

interface TrackingCronRow extends OrderRow {
  shipment_number: string;
}

interface TrackingCronCacheRow extends OrderRow {
  shipment_number: string;
  tracking_events: TrackingEvent[] | null;
}

const IN_FLIGHT_STATUSES: OrderStatus[] = ['to_send', 'sent', 'disponible'];

function cacheAgeMs(fetchedAt: string | null): number | null {
  if (!fetchedAt) return null;
  return Date.now() - new Date(fetchedAt).getTime();
}

/** Polls labelled in-flight Mondial Relay shipments whose cache is at least
 * four hours old. A `to_send` order advances to `sent` only when SOAP
 * reports drop-off (`PRISE EN CHARGE POINT RELAIS`), not merely because the
 * tracing call succeeded. Later milestones still walk through `sent` first
 * because status changes are sequential. The carrier explicitly caps WSI2
 * tracing at 4–6 calls/day per shipment; this gate remains effective even if
 * the external cron is run too often. A small per-run cap avoids turning a
 * backlog into an abusive batch.
 *
 * Orders whose cache is still fresh are not re-fetched, but their cached
 * events still advance status. Opening the tracking modal used to refresh
 * that cache without walking the lifecycle, which then hid locker/delivery
 * from the hourly job for four hours.
 */
export async function processShipmentTrackingCron(pool: pg.Pool): Promise<ShipmentTrackingCronResult> {
  const mr = config.mondialRelay;
  const courierCodes = [
    ...new Set([mr.pointCourierCode, mr.homeCourierCode].filter((code): code is string => !!code)),
  ];
  if (courierCodes.length === 0) {
    return {
      skipped: true,
      reason: 'mondial_relay_not_configured',
      candidates: 0,
      fetched: 0,
      webserviceCalls: [],
      sentMarked: 0,
      availableMarked: 0,
      receivedMarked: 0,
      returnReviewMarked: 0,
      failed: 0,
    };
  }
  if (!mr.api1Url || !mr.api1Enseigne || !mr.api1PrivateKey) {
    return {
      skipped: true,
      reason: 'tracking_not_configured',
      candidates: 0,
      fetched: 0,
      webserviceCalls: [],
      sentMarked: 0,
      availableMarked: 0,
      receivedMarked: 0,
      returnReviewMarked: 0,
      failed: 0,
    };
  }

  const { rows: cachedRows } = await pool.query<TrackingCronCacheRow>(
    `select o.*, osl.shipment_number, osl.tracking_events
       from orders o
       join order_shipping_labels osl on osl.order_id = o.id
      where o.status = any($1::text[])
        and o.courier_code = any($2::text[])
        and osl.shipment_number is not null
        and osl.tracking_events is not null
        and osl.tracking_fetched_at > now() - ($3::int * interval '1 millisecond')`,
    [IN_FLIGHT_STATUSES, courierCodes, FRESHNESS_MS],
  );

  const { rows } = await pool.query<TrackingCronRow>(
    `select o.*, osl.shipment_number
       from orders o
       join order_shipping_labels osl on osl.order_id = o.id
      where o.status = any($1::text[])
        and o.courier_code = any($2::text[])
        and osl.shipment_number is not null
        and (osl.tracking_fetched_at is null or osl.tracking_fetched_at <= now() - ($3::int * interval '1 millisecond'))
      order by osl.tracking_fetched_at asc nulls first
      limit 25`,
    [IN_FLIGHT_STATUSES, courierCodes, FRESHNESS_MS],
  );

  const result: ShipmentTrackingCronResult = {
    skipped: false,
    candidates: cachedRows.length + rows.length,
    fetched: 0,
    webserviceCalls: [],
    sentMarked: 0,
    availableMarked: 0,
    receivedMarked: 0,
    returnReviewMarked: 0,
    failed: 0,
  };

  for (const order of cachedRows) {
    const events = order.tracking_events ?? [];
    if (events.length === 0) continue;
    addMilestoneCounts(result, await applyCarrierMilestones(pool, order, events));
  }

  for (const [index, order] of rows.entries()) {
    try {
      const { events, statusCode, summaryLabels, webserviceCall } = await mondialRelayTracing(
        order.shipment_number,
        'fr',
      );
      result.webserviceCalls.push(webserviceCall);
      const fetchedAt = new Date().toISOString();
      await cacheTrackingEvents(pool, order.id, events, fetchedAt);
      result.fetched += 1;
      addMilestoneCounts(
        result,
        await applyCarrierMilestones(pool, order, events, statusCode, summaryLabels),
      );
    } catch (error) {
      if (error instanceof ShippingTrackingError && error.webserviceCall)
        result.webserviceCalls.push(error.webserviceCall);
      result.failed += 1;
      console.error(`[shippingTracking] cron fetch failed for order ${order.id}:`, error);
    }
    if (index < rows.length - 1) await wait(mr.trackingThrottleMs);
  }
  return result;
}

export async function getOrderTracking(
  pool: pg.Pool,
  order: OrderRow,
  language: string,
): Promise<TrackingResult> {
  const trackingAvailable = order.courier_code
    ? ((await couriers.trackingAvailableByCode(pool, [order.courier_code])).get(order.courier_code) ?? false)
    : false;
  if (!trackingAvailable) {
    throw new ShippingTrackingError('tracking_unavailable', 'Tracking is not enabled for this courier.');
  }

  const provider = resolveTrackingProvider(order);
  if (!provider) {
    throw new ShippingTrackingError(
      'tracking_unavailable',
      `No tracking provider implemented for courier "${order.courier_code}".`,
    );
  }

  const { rows } = await pool.query<TrackingCacheRow>(
    `select shipment_number, tracking_events, tracking_fetched_at from order_shipping_labels where order_id = $1`,
    [order.id],
  );
  const stored = rows[0];
  if (!stored?.shipment_number) {
    throw new ShippingTrackingError('shipment_not_found', 'No shipment has been created for this order yet.');
  }

  const externalUrl = externalTrackingUrl(provider, stored.shipment_number, order.postal_code);
  const cachedEvents = stored.tracking_events ?? [];
  const age = cacheAgeMs(stored.tracking_fetched_at);
  if (cachedEvents.length > 0) {
    order = (await applyCarrierMilestones(pool, order, cachedEvents)).order;
  }
  const cachedStatus = orderStatusFromTracing(cachedEvents);

  const displayFresh = age !== null && age < FRESHNESS_MS && stored.tracking_events;
  const catchUpDue =
    tracingAwaitingLaterMilestone(order, cachedStatus) && (age === null || age >= USER_CATCHUP_MS);
  if (displayFresh && !catchUpDue) {
    return {
      shipmentNumber: stored.shipment_number,
      events: cachedEvents,
      fetchedAt: stored.tracking_fetched_at!,
      externalUrl,
    };
  }

  // From here on, a shipment genuinely exists on a courier we know how to
  // track — the customer already has an actionable shipmentNumber/externalUrl
  // fallback, so a failed *live* call degrades to that instead of a bare
  // error: stale cached events if there are any, otherwise an empty list.
  // The underlying cause (config missing, network error, unexpected
  // response) is logged server-side, never surfaced to the customer.
  try {
    const { events, statusCode, summaryLabels } = await mondialRelayTracing(stored.shipment_number, language);
    const fetchedAt = new Date().toISOString();
    await cacheTrackingEvents(pool, order.id, events, fetchedAt);
    await applyCarrierMilestones(pool, order, events, statusCode, summaryLabels);
    return { shipmentNumber: stored.shipment_number, events, fetchedAt, externalUrl };
  } catch (error) {
    console.error(`[shippingTracking] live fetch failed for order ${order.id}:`, error);
    return {
      shipmentNumber: stored.shipment_number,
      events: stored.tracking_events ?? [],
      fetchedAt: stored.tracking_fetched_at,
      externalUrl,
    };
  }
}
