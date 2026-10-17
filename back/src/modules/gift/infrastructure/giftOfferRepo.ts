import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { decryptPii, emailLookupHash, encryptPii } from '../../../platform/security/piiCrypto.js';
import type { PickupPoint } from '../../customers/addresses/application/addresses.js';
import type { Language } from '../../../utils/language.js';
import { isLanguage } from '../../../utils/language.js';
import type { GiftStatus } from '../domain/statuses.js';
import { isGiftStatus } from '../domain/statuses.js';
import { parseGiftShareCardStyle, type GiftShareCardStyle } from '../domain/shareCardStyle.js';

export interface GiftOfferRow {
  id: string;
  status: GiftStatus;
  giverToken: string;
  receiverToken: string;
  giverEmail: string;
  giverDisplayName: string;
  giverUserId: string | null;
  receiverName: string;
  /** Null until the recipient confirms with an email. */
  receiverEmail: string | null;
  giverComment: string | null;
  shareCardStyle: GiftShareCardStyle;
  maxSets: number | null;
  maxBudget: number | null;
  allowAccessories: boolean;
  maxAccessoryBudget: number | null;
  hideReceiverPrices: boolean;
  gdprAcceptedAt: Date;
  gdprVersion: string;
  language: Language;
  offerExpiresAt: Date | null;
  holdExpiresAt: Date | null;
  payByAt: Date | null;
  receiverVisibleUntil: Date | null;
  orderId: string | null;
  cartId: string | null;
  stockReservationId: string | null;
  assignedCourierCode: string | null;
  pinHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GiftDestinationInput {
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  deliveryNotes: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
  courierCode: string;
  networkCodes: string[];
  pickupPoints: Record<string, PickupPoint>;
}

export interface GiftDestinationRow extends GiftDestinationInput {
  offerId: string;
}

interface OfferDbRow {
  id: string;
  status: string;
  giver_token_enc: string;
  receiver_token_enc: string;
  giver_email: string;
  giver_display_name: string;
  giver_user_id: string | null;
  receiver_name: string;
  receiver_email: string | null;
  giver_comment: string | null;
  share_card_style: string;
  max_sets: number | null;
  max_budget: string | null;
  allow_accessories: boolean;
  max_accessory_budget: string | null;
  hide_receiver_prices: boolean;
  gdpr_accepted_at: Date | string;
  gdpr_version: string;
  language: string;
  offer_expires_at: Date | string | null;
  hold_expires_at: Date | string | null;
  pay_by_at: Date | string | null;
  receiver_visible_until: Date | string | null;
  order_id: string | null;
  cart_id: string | null;
  stock_reservation_id: string | null;
  assigned_courier_code: string | null;
  pin_hash: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function asDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function mapOffer(row: OfferDbRow): GiftOfferRow {
  const status = isGiftStatus(row.status) ? row.status : 'expired';
  const language = isLanguage(row.language) ? row.language : 'fr';
  return {
    id: row.id,
    status,
    giverToken: decryptPii(row.giver_token_enc) ?? '',
    receiverToken: decryptPii(row.receiver_token_enc) ?? '',
    giverEmail: decryptPii(row.giver_email) ?? '',
    giverDisplayName: decryptPii(row.giver_display_name) ?? '',
    giverUserId: row.giver_user_id,
    receiverName: decryptPii(row.receiver_name) ?? '',
    receiverEmail: decryptPii(row.receiver_email),
    giverComment: decryptPii(row.giver_comment),
    shareCardStyle: parseGiftShareCardStyle(row.share_card_style) ?? 'pamsurin',
    maxSets: row.max_sets,
    maxBudget: row.max_budget == null ? null : Number(row.max_budget),
    allowAccessories: row.allow_accessories,
    maxAccessoryBudget: row.max_accessory_budget == null ? null : Number(row.max_accessory_budget),
    hideReceiverPrices: row.hide_receiver_prices,
    gdprAcceptedAt: asDate(row.gdpr_accepted_at) ?? new Date(),
    gdprVersion: row.gdpr_version,
    language,
    offerExpiresAt: asDate(row.offer_expires_at),
    holdExpiresAt: asDate(row.hold_expires_at),
    payByAt: asDate(row.pay_by_at),
    receiverVisibleUntil: asDate(row.receiver_visible_until),
    orderId: row.order_id,
    cartId: row.cart_id,
    stockReservationId: row.stock_reservation_id,
    assignedCourierCode: row.assigned_courier_code,
    pinHash: row.pin_hash ? row.pin_hash.trim() : null,
    createdAt: asDate(row.created_at) ?? new Date(),
    updatedAt: asDate(row.updated_at) ?? new Date(),
  };
}

const OFFER_COLUMNS = `id, status, giver_token_enc, receiver_token_enc, giver_email, giver_display_name,
  giver_user_id, receiver_name, receiver_email, giver_comment, share_card_style, max_sets, max_budget,
  allow_accessories, max_accessory_budget, hide_receiver_prices,
  gdpr_accepted_at, gdpr_version, language, offer_expires_at, hold_expires_at, pay_by_at,
  receiver_visible_until, order_id, cart_id, stock_reservation_id, assigned_courier_code,
  pin_hash, created_at, updated_at`;

export async function insertGiftOffer(
  db: pg.Pool | pg.PoolClient,
  input: {
    id: string;
    status: GiftStatus;
    giverEmail: string;
    giverDisplayName: string;
    giverUserId: string | null;
    receiverName: string;
    giverComment: string;
    shareCardStyle: GiftShareCardStyle;
    maxSets: number | null;
    maxBudget: number | null;
    allowAccessories: boolean;
    maxAccessoryBudget: number | null;
    hideReceiverPrices: boolean;
    giverTokenHash: string;
    receiverTokenHash: string;
    giverToken: string;
    receiverToken: string;
    pinHash: string;
    gdprVersion: string;
    language: Language;
    offerExpiresAt: Date | null;
  },
): Promise<GiftOfferRow> {
  const { rows } = await db.query<OfferDbRow>(
    `insert into gift_offers (
       id, status, giver_email, giver_email_lookup, giver_display_name, giver_user_id,
       receiver_name, giver_comment, max_sets, max_budget,
       allow_accessories, max_accessory_budget, hide_receiver_prices, giver_token_hash, receiver_token_hash,
       giver_token_enc, receiver_token_enc, pin_hash, gdpr_accepted_at, gdpr_version, language, offer_expires_at,
       share_card_style
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now(), $19, $20, $21, $22
     ) returning ${OFFER_COLUMNS}`,
    [
      input.id,
      input.status,
      encryptPii(input.giverEmail),
      emailLookupHash(input.giverEmail),
      encryptPii(input.giverDisplayName),
      input.giverUserId,
      encryptPii(input.receiverName),
      encryptPii(input.giverComment),
      input.maxSets,
      input.maxBudget,
      input.allowAccessories,
      input.maxAccessoryBudget,
      input.hideReceiverPrices,
      input.giverTokenHash,
      input.receiverTokenHash,
      encryptPii(input.giverToken),
      encryptPii(input.receiverToken),
      input.pinHash,
      input.gdprVersion,
      input.language,
      input.offerExpiresAt,
      input.shareCardStyle,
    ],
  );
  return mapOffer(rows[0]!);
}

export async function findOfferByGiverTokenHash(
  db: pg.Pool | pg.PoolClient,
  tokenHash: string,
): Promise<GiftOfferRow | undefined> {
  const { rows } = await db.query<OfferDbRow>(
    `select ${OFFER_COLUMNS} from gift_offers where giver_token_hash = $1`,
    [tokenHash],
  );
  return rows[0] ? mapOffer(rows[0]) : undefined;
}

export async function findOfferByReceiverTokenHash(
  db: pg.Pool | pg.PoolClient,
  tokenHash: string,
): Promise<GiftOfferRow | undefined> {
  const { rows } = await db.query<OfferDbRow>(
    `select ${OFFER_COLUMNS} from gift_offers where receiver_token_hash = $1`,
    [tokenHash],
  );
  return rows[0] ? mapOffer(rows[0]) : undefined;
}

export async function findOfferById(
  db: pg.Pool | pg.PoolClient,
  id: string,
): Promise<GiftOfferRow | undefined> {
  const { rows } = await db.query<OfferDbRow>(`select ${OFFER_COLUMNS} from gift_offers where id = $1`, [id]);
  return rows[0] ? mapOffer(rows[0]) : undefined;
}

export async function findOfferByCartId(
  db: pg.Pool | pg.PoolClient,
  cartId: string,
): Promise<GiftOfferRow | undefined> {
  const { rows } = await db.query<OfferDbRow>(`select ${OFFER_COLUMNS} from gift_offers where cart_id = $1`, [
    cartId,
  ]);
  return rows[0] ? mapOffer(rows[0]) : undefined;
}

export async function lockOfferById(client: pg.PoolClient, id: string): Promise<GiftOfferRow | undefined> {
  const { rows } = await client.query<OfferDbRow>(
    `select ${OFFER_COLUMNS} from gift_offers where id = $1 for update`,
    [id],
  );
  return rows[0] ? mapOffer(rows[0]) : undefined;
}

/** Non-converted offers past purge_after_days. Never deletes ordered rows. */
export async function findPurgeCandidateIds(
  client: pg.PoolClient,
  purgeAfterDays: number,
  limit: number,
): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `select id from gift_offers
     where status in ('cancelled', 'expired')
       and order_id is null
       and created_at <= now() - ($1 || ' days')::interval
     order by created_at
     limit $2
     for update skip locked`,
    [purgeAfterDays, limit],
  );
  return rows.map((row) => row.id);
}

/** Cascade-deletes the offer and child rows. FK to carts/orders is SET NULL. */
export async function deleteOfferById(client: pg.PoolClient, id: string): Promise<void> {
  await client.query(`delete from gift_offers where id = $1`, [id]);
}

export async function listOpenOffersForGiverUser(
  db: pg.Pool | pg.PoolClient,
  userId: string,
): Promise<GiftOfferRow[]> {
  const { rows } = await db.query<OfferDbRow>(
    `select ${OFFER_COLUMNS} from gift_offers
     where giver_user_id = $1
       and status in ('selecting', 'awaiting_payment', 'paying')
     order by created_at desc`,
    [userId],
  );
  return rows.map(mapOffer);
}

/** Serializes everything that counts a giver's open gift carts against
 * maxOpenPromisesPerGiver and then adds one (create, open-pay, receiver
 * confirm), for the rest of the caller's transaction. */
export async function lockGiverPromises(client: pg.PoolClient, userId: string): Promise<void> {
  await client.query(`select pg_advisory_xact_lock(87222, hashtext($1))`, [userId]);
}

export async function countOpenGiftCartsForUser(
  db: pg.Pool | pg.PoolClient,
  userId: string,
): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `select count(*)::text as count from carts where user_id = $1 and kind = 'gift'`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function updateOfferFields(
  db: pg.Pool | pg.PoolClient,
  id: string,
  patch: {
    status?: GiftStatus;
    giverUserId?: string | null;
    offerExpiresAt?: Date | null;
    holdExpiresAt?: Date | null;
    payByAt?: Date | null;
    receiverVisibleUntil?: Date | null;
    orderId?: string | null;
    cartId?: string | null;
    stockReservationId?: string | null;
    assignedCourierCode?: string | null;
    pinHash?: string;
    receiverName?: string;
    receiverEmail?: string;
    giverComment?: string;
    shareCardStyle?: GiftShareCardStyle;
  },
): Promise<GiftOfferRow> {
  const assignments = ['updated_at = now()'];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };
  if (patch.status !== undefined) add('status', patch.status);
  if (patch.giverUserId !== undefined) add('giver_user_id', patch.giverUserId);
  if (patch.offerExpiresAt !== undefined) add('offer_expires_at', patch.offerExpiresAt);
  if (patch.holdExpiresAt !== undefined) add('hold_expires_at', patch.holdExpiresAt);
  if (patch.payByAt !== undefined) add('pay_by_at', patch.payByAt);
  if (patch.receiverVisibleUntil !== undefined) add('receiver_visible_until', patch.receiverVisibleUntil);
  if (patch.orderId !== undefined) add('order_id', patch.orderId);
  if (patch.cartId !== undefined) add('cart_id', patch.cartId);
  if (patch.stockReservationId !== undefined) add('stock_reservation_id', patch.stockReservationId);
  if (patch.assignedCourierCode !== undefined) add('assigned_courier_code', patch.assignedCourierCode);
  if (patch.pinHash !== undefined) add('pin_hash', patch.pinHash);
  if (patch.receiverName !== undefined) add('receiver_name', encryptPii(patch.receiverName));
  if (patch.receiverEmail !== undefined) {
    add('receiver_email', encryptPii(patch.receiverEmail));
    add('receiver_email_lookup', emailLookupHash(patch.receiverEmail));
  }
  if (patch.giverComment !== undefined) add('giver_comment', encryptPii(patch.giverComment));
  if (patch.shareCardStyle !== undefined) add('share_card_style', patch.shareCardStyle);
  values.push(id);
  const { rows } = await db.query<OfferDbRow>(
    `update gift_offers set ${assignments.join(', ')} where id = $${values.length} returning ${OFFER_COLUMNS}`,
    values,
  );
  return mapOffer(rows[0]!);
}

export async function upsertGiftDestination(
  db: pg.Pool | pg.PoolClient,
  offerId: string,
  destination: GiftDestinationInput,
): Promise<GiftDestinationRow> {
  await db.query(
    `insert into gift_destinations (
       offer_id, recipient_name, company_name, line1, line2, delivery_notes,
       postal_code, city, country_code, phone, courier_code, network_codes, pickup_points
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)
     on conflict (offer_id) do update set
       recipient_name = excluded.recipient_name,
       company_name = excluded.company_name,
       line1 = excluded.line1,
       line2 = excluded.line2,
       delivery_notes = excluded.delivery_notes,
       postal_code = excluded.postal_code,
       city = excluded.city,
       country_code = excluded.country_code,
       phone = excluded.phone,
       courier_code = excluded.courier_code,
       network_codes = excluded.network_codes,
       pickup_points = excluded.pickup_points,
       updated_at = now()`,
    [
      offerId,
      encryptPii(destination.recipientName),
      encryptPii(destination.companyName),
      encryptPii(destination.line1),
      encryptPii(destination.line2),
      encryptPii(destination.deliveryNotes),
      encryptPii(destination.postalCode),
      encryptPii(destination.city),
      destination.countryCode,
      encryptPii(destination.phone),
      destination.courierCode,
      JSON.stringify(destination.networkCodes),
      JSON.stringify(destination.pickupPoints),
    ],
  );
  return { offerId, ...destination };
}

export async function getGiftDestination(
  db: pg.Pool | pg.PoolClient,
  offerId: string,
): Promise<GiftDestinationRow | undefined> {
  const { rows } = await db.query<{
    offer_id: string;
    recipient_name: string | null;
    company_name: string | null;
    line1: string;
    line2: string | null;
    delivery_notes: string | null;
    postal_code: string;
    city: string;
    country_code: string;
    phone: string | null;
    courier_code: string;
    network_codes: unknown;
    pickup_points: unknown;
  }>(`select * from gift_destinations where offer_id = $1`, [offerId]);
  const row = rows[0];
  if (!row) return undefined;
  return {
    offerId: row.offer_id,
    recipientName: decryptPii(row.recipient_name),
    companyName: decryptPii(row.company_name),
    line1: decryptPii(row.line1) ?? '',
    line2: decryptPii(row.line2),
    deliveryNotes: decryptPii(row.delivery_notes),
    postalCode: decryptPii(row.postal_code) ?? '',
    city: decryptPii(row.city) ?? '',
    countryCode: row.country_code,
    phone: decryptPii(row.phone),
    courierCode: row.courier_code,
    networkCodes: Array.isArray(row.network_codes) ? (row.network_codes as string[]) : [],
    pickupPoints:
      row.pickup_points && typeof row.pickup_points === 'object'
        ? (row.pickup_points as Record<string, PickupPoint>)
        : {},
  };
}

export async function insertLockSession(
  db: pg.Pool | pg.PoolClient,
  offerId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<{ id: string; expiresAt: Date }> {
  const id = randomUUID();
  await db.query(
    `insert into gift_lock_sessions (id, offer_id, token_hash, expires_at) values ($1, $2, $3, $4)`,
    [id, offerId, tokenHash, expiresAt],
  );
  return { id, expiresAt };
}

/** Scoped down on purpose: the lock token minted alongside a receiver's full
 * token (see POST /gift/receiver/:token/session) is what a locked-out tab
 * re-sends from every other page to check whether the lock still makes
 * sense — it must never be able to read items/addresses/pricing the way the
 * receiver token can, only this one status field, so a page that isn't the
 * gift page itself never has to hold onto the powerful token. */
export async function findLockSessionStatus(
  db: pg.Pool | pg.PoolClient,
  tokenHash: string,
): Promise<GiftStatus | null> {
  const { rows } = await db.query<{ status: GiftStatus }>(
    `select o.status
       from gift_lock_sessions s
       join gift_offers o on o.id = s.offer_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash],
  );
  return rows[0]?.status ?? null;
}

export async function tryInsertReminderSend(
  db: pg.Pool | pg.PoolClient,
  offerId: string,
  template: string,
  day: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `insert into gift_reminder_sends (id, offer_id, template, day)
     values ($1, $2, $3, $4::date)
     on conflict (offer_id, template, day) do nothing`,
    [randomUUID(), offerId, template, day],
  );
  return (rowCount ?? 0) > 0;
}
