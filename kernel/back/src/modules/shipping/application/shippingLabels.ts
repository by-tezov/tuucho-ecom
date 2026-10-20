import { requiresMondialRelayRecipientPhone } from '../../delivery/application/recipientPhone.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { carrierLabelSettings } from './carrierSettings.js';
import { identityName } from '../../../utils/customerIdentity.js';
import { decryptJsonPii, decryptPii } from '../../../platform/security/piiCrypto.js';

export interface ShippingPacket {
  weight: number;
  size: { length: number; width: number; depth: number };
}

/** The immutable order snapshot needed by the carrier adapter.
 *
 * Keep this port owned by shipping instead of depending on the complete
 * orders service model. Orders can call shipping, but shipping must not
 * import orders back and create a feature cycle. */
export interface ShippingLabelOrder {
  id: string;
  user_id: string | null;
  guest_email: string | null;
  order_number: string;
  recipient_name: string | null;
  company_name: string | null;
  line1: string;
  line2: string | null;
  delivery_notes: string | null;
  postal_code: string;
  city: string;
  country_code: string;
  phone: string | null;
  network_code: string | null;
  pickup_point: { id: string } | null;
  courier_code: string | null;
  /** Encrypted gift snapshot when the order is a gift checkout. */
  gift_snapshot?: unknown;
}

export interface ShippingLabel {
  carrierCode: string;
  shipmentNumber: string | null;
  /** Relative to config.shipmentLabelDir — see getShippingLabel/the
   * /sticker route for how this becomes a downloadable response. The PDF
   * bytes themselves never touch Postgres (project hard rule) — only this
   * file name is persisted, same pattern as order_invoices.file_name. */
  fileName: string;
}

interface MondialRelayDelivery {
  carrierCode: string;
  mode: string;
  location: string;
  collectionMode: string;
  recipientEmailRequired: boolean;
}

export class ShippingLabelError extends Error {
  readonly code:
    'label_unsupported' | 'label_configuration_missing' | 'pickup_point_missing' | 'label_generation_failed';

  constructor(
    code:
      | 'label_unsupported'
      | 'label_configuration_missing'
      | 'pickup_point_missing'
      | 'label_generation_failed',
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new ShippingLabelError('label_configuration_missing', `Missing ${name}.`);
  return value;
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
  return match?.[1]?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function xmlAttribute(xml: string, tag: string, attribute: string): string | undefined {
  const namespace = '(?:[A-Za-z_][\\w.-]*:)?';
  const match = new RegExp(`<${namespace}${tag}\\s[^>]*\\b${attribute}="([^"]*)"[^>]*/?>`, 'i').exec(xml);
  return match?.[1];
}

function xmlStatusMessage(xml: string): string | undefined {
  const code = xmlTag(xml, 'Code') ?? xmlAttribute(xml, 'Status', 'Code');
  const message = xmlTag(xml, 'Message') ?? xmlAttribute(xml, 'Status', 'Message');
  if (!message) return undefined;
  return code ? `Mondial Relay error ${code}: ${message}` : message;
}

function validatePacket(packet: ShippingPacket): void {
  const values = [packet.weight, packet.size.length, packet.size.width, packet.size.depth];
  if (!values.every((value) => Number.isSafeInteger(value) && value > 0) || packet.weight < 10) {
    throw new ShippingLabelError(
      'label_generation_failed',
      'Packet weight and size must be positive integers; weight must be at least 10.',
    );
  }
}

function addressXml(
  name: string,
  line1: string,
  line2: string | null,
  postalCode: string,
  city: string,
  countryCode: string,
  phone: string | null,
  email: string | null,
  deliveryNotes: string | null = null,
): string {
  const notes = (deliveryNotes ?? '').slice(0, config.fieldLimits.deliveryNotesMax);
  return `<Address><Title/><Firstname/><Lastname/><Streetname>${escapeXml(line1)}</Streetname><HouseNo/><CountryCode>${escapeXml(countryCode)}</CountryCode><PostCode>${escapeXml(postalCode)}</PostCode><City>${escapeXml(city)}</City><AddressAdd1>${escapeXml(name)}</AddressAdd1><AddressAdd2>${escapeXml(line2 ?? '')}</AddressAdd2><AddressAdd3>${escapeXml(notes)}</AddressAdd3><PhoneNo>${escapeXml(phone ?? '')}</PhoneNo><MobileNo>${escapeXml(phone ?? '')}</MobileNo><Email>${escapeXml(email ?? '')}</Email></Address>`;
}

function mondialRelayDelivery(order: ShippingLabelOrder, recipientPhone?: string): MondialRelayDelivery {
  const mr = carrierLabelSettings();
  if (
    mr.pointCourierCode &&
    mr.pointNetworkCode &&
    order.courier_code === mr.pointCourierCode &&
    order.network_code === mr.pointNetworkCode
  ) {
    if (!(recipientPhone ?? order.phone)?.trim()) {
      throw new ShippingLabelError(
        'label_generation_failed',
        'Mondial Relay Point Relais requires a recipient phone number.',
      );
    }
    const pickupId = order.pickup_point?.id?.trim();
    if (!pickupId)
      throw new ShippingLabelError(
        'pickup_point_missing',
        'The order has no pickup/locker reference for its selected network.',
      );
    // The browser widget gives the bare six-digit point ID, whereas the V2
    // shipment API requires the country-prefixed location (for example,
    // FR-39807). Keep a future widget/API value that is already prefixed.
    return {
      carrierCode: mr.pointCourierCode,
      mode: required(mr.pointDeliveryMode, 'pointDeliveryMode'),
      location: /^[A-Z]{2}-/i.test(pickupId) ? pickupId : `${order.country_code.toUpperCase()}-${pickupId}`,
      collectionMode: required(mr.collectionMode, 'collectionMode'),
      recipientEmailRequired: false,
    };
  }
  if (
    mr.homeCourierCode &&
    mr.homeNetworkCode &&
    order.courier_code === mr.homeCourierCode &&
    // Existing orders keep their immutable delivery-network snapshot. Accept
    // the previous code while those orders work through the fulfilment queue;
    // newly confirmed orders use the shared `home` network.
    (order.network_code === mr.homeNetworkCode || order.network_code === 'mondial-relay-home')
  ) {
    if (!(recipientPhone ?? order.phone)?.trim()) {
      throw new ShippingLabelError(
        'label_generation_failed',
        'Mondial Relay Home requires a recipient phone number.',
      );
    }
    return {
      carrierCode: mr.homeCourierCode,
      mode: required(mr.homeDeliveryMode, 'homeDeliveryMode'),
      location: '',
      collectionMode: required(mr.homeCollectionMode, 'homeCollectionMode'),
      recipientEmailRequired: true,
    };
  }
  throw new ShippingLabelError(
    'label_unsupported',
    'The selected courier/network does not support label generation.',
  );
}

/** Whether Shop can call a carrier API to print a shipping label for
 * this order. Manual couriers (e.g. Chronopost home) skip automated label
 * generation at `to_send` and rely on ops `set-tracking` instead. */
export function supportsAutomatedShippingLabel(
  order: Pick<ShippingLabelOrder, 'courier_code' | 'network_code'>,
): boolean {
  const mr = carrierLabelSettings();
  const isPoint =
    !!mr.pointCourierCode &&
    !!mr.pointNetworkCode &&
    order.courier_code === mr.pointCourierCode &&
    order.network_code === mr.pointNetworkCode;
  const isHome =
    !!mr.homeCourierCode &&
    !!mr.homeNetworkCode &&
    order.courier_code === mr.homeCourierCode &&
    (order.network_code === mr.homeNetworkCode || order.network_code === 'mondial-relay-home');
  return isPoint || isHome;
}

function mondialRelayRequest(
  order: ShippingLabelOrder,
  packet: ShippingPacket,
  delivery: MondialRelayDelivery,
  recipientEmail: string | null,
  recipientPhone?: string,
): string {
  const mr = carrierLabelSettings();
  validatePacket(packet);
  const sender = {
    name: required(mr.senderName, 'senderName'),
    line1: required(mr.senderLine1, 'senderLine1'),
    postalCode: required(mr.senderPostalCode, 'senderPostalCode'),
    city: required(mr.senderCity, 'senderCity'),
    countryCode: required(mr.senderCountryCode, 'senderCountryCode'),
    phone: required(mr.senderPhone, 'senderPhone'),
    email: required(mr.senderEmail, 'senderEmail'),
  };
  const login = required(mr.api2Login, 'api2Login');
  const password = required(mr.api2Password, 'api2Password');
  const customerId = required(mr.api2Enseigne, 'api2Enseigne');
  return `<?xml version="1.0" encoding="utf-8"?><ShipmentCreationRequest xmlns="http://www.example.org/Request"><Context><Login>${escapeXml(login)}</Login><Password>${escapeXml(password)}</Password><CustomerId>${escapeXml(customerId)}</CustomerId><Culture>fr-FR</Culture><VersionAPI>1.0</VersionAPI></Context><OutputOptions><OutputFormat>A4</OutputFormat><OutputType>PdfUrl</OutputType></OutputOptions><ShipmentsList><Shipment><OrderNo>${escapeXml(order.order_number.slice(0, 15))}</OrderNo><ParcelCount>1</ParcelCount><DeliveryMode Mode="${escapeXml(delivery.mode)}" Location="${escapeXml(delivery.location)}"/><CollectionMode Mode="${escapeXml(delivery.collectionMode)}" Location=""/><Parcels><Parcel><Content>Handmade pieces</Content><Length Value="${packet.size.length}" Unit="cm"/><Width Value="${packet.size.width}" Unit="cm"/><Depth Value="${packet.size.depth}" Unit="cm"/><Weight Value="${packet.weight}" Unit="gr"/></Parcel></Parcels><Sender>${addressXml(sender.name, sender.line1, null, sender.postalCode, sender.city, sender.countryCode, sender.phone, sender.email)}</Sender><Recipient>${addressXml(identityName(order.recipient_name, order.company_name), order.line1, order.line2, order.postal_code, order.city, order.country_code, recipientPhone ?? order.phone, recipientEmail, order.delivery_notes)}</Recipient></Shipment></ShipmentsList></ShipmentCreationRequest>`;
}

function isValidEmail(value: string | null): value is string {
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Gift snapshot lives on the order; shipping only needs the recipient email. */
function giftSnapshotReceiverEmail(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const enc = (raw as { enc?: unknown }).enc;
  if (typeof enc !== 'string') return null;
  try {
    const snap = decryptJsonPii<{ receiverEmail?: string | null }>(enc);
    const email = typeof snap?.receiverEmail === 'string' ? snap.receiverEmail.trim() : '';
    return email || null;
  } catch {
    return null;
  }
}

/**
 * Email Mondial Relay puts on the Recipient. Gift orders use the recipient's
 * confirm email from the snapshot, never the giver's account email.
 */
export function resolveMondialRelayRecipientEmail(
  order: Pick<ShippingLabelOrder, 'gift_snapshot' | 'guest_email' | 'user_id'>,
  accountEmail: string | null,
): string | null {
  const fromGift = giftSnapshotReceiverEmail(order.gift_snapshot);
  if (fromGift) return fromGift;
  if (order.user_id) return accountEmail;
  return order.guest_email;
}

export async function ensureShippingLabel(
  pool: pg.Pool,
  order: ShippingLabelOrder,
  packet: ShippingPacket,
  recipientPhone?: string,
): Promise<ShippingLabel> {
  // Two "to_send" requests for one order (a double click, two operators) both
  // found no stored label and each bought a Mondial Relay shipment. A session
  // lock, not a transaction, serializes them: the carrier call happens while it
  // is held and no transaction may stay open across a network call. The
  // waiter then finds the stored label and returns it.
  const lock = await pool.connect();
  try {
    await lock.query(`select pg_advisory_lock(87221, hashtext($1))`, [order.id]);
    return await ensureShippingLabelUnlocked(pool, order, packet, recipientPhone);
  } finally {
    const unlocked = await lock
      .query(`select pg_advisory_unlock(87221, hashtext($1))`, [order.id])
      .then(() => true)
      .catch(() => false);
    // A connection that could not unlock is destroyed, which drops its lock.
    lock.release(!unlocked);
  }
}

async function ensureShippingLabelUnlocked(
  pool: pg.Pool,
  order: ShippingLabelOrder,
  packet: ShippingPacket,
  recipientPhone?: string,
): Promise<ShippingLabel> {
  const { rows: storedRows } = await pool.query<{
    carrier_code: string;
    shipment_number: string | null;
    file_name: string | null;
  }>(
    // file_name is not null excludes a manually-recorded tracking-only row
    // (see setManualTrackingNumber) — that's not a real generated label, so
    // this must still go on to actually call the carrier rather than
    // short-circuiting on it.
    `select carrier_code, shipment_number, file_name from order_shipping_labels
     where order_id = $1 and file_name is not null`,
    [order.id],
  );
  const stored = storedRows[0];
  if (stored)
    return {
      carrierCode: stored.carrier_code,
      shipmentNumber: stored.shipment_number,
      fileName: stored.file_name!,
    };

  const mr = carrierLabelSettings();
  const delivery = mondialRelayDelivery(order, recipientPhone);
  // Gift orders: the recipient typed their email at confirm; Mondial Relay
  // must reach them, not the giver who paid. Guest orders keep guest_email.
  // Other signed-in orders use the account email.
  let accountEmail: string | null = null;
  if (order.user_id) {
    const { rows: userRows } = await pool.query<{ email: string | null }>(
      `select email from users where id = $1`,
      [order.user_id],
    );
    accountEmail = decryptPii(userRows[0]?.email ?? null);
  }
  const recipientEmail = resolveMondialRelayRecipientEmail(order, accountEmail);
  if (delivery.recipientEmailRequired && !isValidEmail(recipientEmail)) {
    throw new ShippingLabelError(
      'label_generation_failed',
      'Mondial Relay Home requires a valid recipient email address.',
    );
  }
  const apiUrl = required(mr.api2Url, 'api2Url');
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { accept: 'application/xml', 'content-type': 'text/xml' },
    body: mondialRelayRequest(order, packet, delivery, recipientEmail, recipientPhone),
  });
  const xml = await response.text();
  if (!response.ok)
    throw new ShippingLabelError('label_generation_failed', `Mondial Relay returned ${response.status}.`);
  const statusMessage = xmlStatusMessage(xml);
  const pdfUrl = xmlTag(xml, 'Output');
  if (!pdfUrl)
    throw new ShippingLabelError(
      'label_generation_failed',
      statusMessage ??
        `Mondial Relay returned no PDF URL${response.headers.get('content-type') ? ` (${response.headers.get('content-type')})` : ''}.`,
    );
  const pdfLocation = new URL(pdfUrl);
  if (pdfLocation.protocol !== 'http:' && pdfLocation.protocol !== 'https:') {
    throw new ShippingLabelError('label_generation_failed', 'Mondial Relay returned an unsafe PDF URL.');
  }
  if (pdfLocation.hostname !== 'mondialrelay.com' && !pdfLocation.hostname.endsWith('.mondialrelay.com')) {
    throw new ShippingLabelError('label_generation_failed', 'Mondial Relay returned an unsafe PDF URL.');
  }
  // Mondial Relay's V2 documentation still illustrates an HTTP PdfUrl.
  // Its host redirects to HTTPS, so upgrade it before following the
  // signed URL instead of either rejecting the documented response or
  // sending its token in clear text.
  pdfLocation.protocol = 'https:';
  const pdfResponse = await fetch(pdfLocation);
  if (!pdfResponse.ok)
    throw new ShippingLabelError(
      'label_generation_failed',
      `Mondial Relay PDF returned ${pdfResponse.status}.`,
    );
  const content = Buffer.from(await pdfResponse.arrayBuffer());
  if (!content.subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw new ShippingLabelError('label_generation_failed', 'Mondial Relay did not return a PDF.');
  const shipmentNumber = xmlAttribute(xml, 'Shipment', 'ShipmentNumber') ?? null;

  const fileName = `${order.order_number}.pdf`;
  const absolutePath = join(config.shipmentLabelDir, fileName);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);

  await pool.query(
    `insert into order_shipping_labels (order_id, carrier_code, shipment_number, file_name) values ($1, $2, $3, $4)`,
    [order.id, delivery.carrierCode, shipmentNumber, fileName],
  );
  return { carrierCode: delivery.carrierCode, shipmentNumber, fileName };
}

export async function getShippingLabel(pool: pg.Pool, orderId: string): Promise<ShippingLabel | undefined> {
  const { rows } = await pool.query<{
    carrier_code: string;
    shipment_number: string | null;
    file_name: string | null;
  }>(
    // file_name is not null excludes a manually-recorded tracking-only row
    // (see setManualTrackingNumber) — there is no PDF to download for it.
    `select osl.carrier_code, osl.shipment_number, osl.file_name
     from order_shipping_labels osl
     where osl.order_id = $1 and osl.file_name is not null`,
    [orderId],
  );
  const label = rows[0];
  return (
    label && {
      carrierCode: label.carrier_code,
      shipmentNumber: label.shipment_number,
      fileName: label.file_name!,
    }
  );
}

/** Absolute filesystem path for a ShippingLabel's PDF — callers (the
 * /sticker route) read the file themselves rather than this service
 * holding bytes in memory beyond a single request. */
export function shippingLabelPath(label: ShippingLabel): string {
  return join(config.shipmentLabelDir, label.fileName);
}

/** Ops override for `npm run order -- set-tracking` — records (or corrects)
 * a carrier tracking reference by hand, most commonly for an order that
 * reached to_send via `--skip-shipment-label` and so has no automated
 * shipment_number, but has since actually shipped by some other means with
 * its own real tracking reference (e.g. a label printed by hand through the
 * carrier's own portal). Upserts without touching any existing `file_name`,
 * and clears any cached tracing (see
 * shippingTracking.service.ts) since it would otherwise be stale data tied
 * to a now-superseded (or previously nonexistent) shipment reference. */
export async function setManualTrackingNumber(
  pool: pg.Pool,
  orderId: string,
  carrierCode: string,
  shipmentNumber: string,
): Promise<void> {
  await pool.query(
    `insert into order_shipping_labels (order_id, carrier_code, shipment_number)
     values ($1, $2, $3)
     on conflict (order_id) do update
       set carrier_code = excluded.carrier_code,
           shipment_number = excluded.shipment_number,
           tracking_events = null,
           tracking_fetched_at = null`,
    [orderId, carrierCode, shipmentNumber],
  );
}

export { requiresMondialRelayRecipientPhone };
