import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from 'patchright/test';
import { pool } from '../../../src/db/pool.js';
import { E2E_ACCESSORY_UIDS, E2E_LENGTH, E2E_PRODUCT_UIDS, E2E_SHAPES } from './catalog.js';
import {
  apiJson,
  pickPurchasableVariant,
  testCourierCode,
  uniqueEmail,
  type PurchasableVariant,
} from './api.js';
import { opsRequest } from './ops.js';
import { waitForMail, type DevMail } from './mail.js';
import { testGiftPin } from './env.js';

export interface GiftErrorBody {
  success?: boolean;
  error?: {
    code?: string;
    max?: number;
    min?: number;
    field?: string;
    retryAfterSec?: number;
    retryAt?: string;
    failedCount?: number;
    throttled?: boolean;
  };
}

export interface GiftClocks {
  offerExpiresAt?: string | null;
  holdExpiresAt?: string | null;
  payByAt?: string | null;
  receiverVisibleUntil?: string | null;
}

export interface GiftPortal {
  success?: boolean;
  id?: string;
  status?: string;
  checkEmail?: boolean;
  offerId?: string;
  receiverUrl?: string | null;
  giverDisplayName?: string;
  receiverName?: string;
  receiverEmail?: string | null;
  giverComment?: string | null;
  maxSets?: number | null;
  maxBudget?: number | null;
  allowAccessories?: boolean;
  maxAccessoryBudget?: number | null;
  hideReceiverPrices?: boolean;
  cartId?: string | null;
  orderId?: string | null;
  remaining?: {
    remainingSlots?: number | null;
    remainingBudget?: number | null;
    remainingAccessoryBudget?: number | null;
  };
  clocks?: GiftClocks;
  items?: Array<{
    productId?: string;
    quantity?: number;
    unitPrice?: number;
    price?: number;
    packKey?: string;
    productType?: string;
  }>;
  shareCard?: { receiverUrl?: string; receiverToken?: string; qrDataUri?: string } | null;
  destination?: { line1?: string; courierCode?: string } | null;
}

export const JULIE_DESTINATION = {
  recipientName: 'Julie Test',
  line1: '12 rue des Fleurs',
  postalCode: '75011',
  city: 'Paris',
  countryCode: 'FR',
  phone: '+33601020305',
  courierCode: testCourierCode,
  networkCodes: ['home'],
  pickupPoints: {},
};

export async function seedOpenGiftCarts(userId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await pool.query(
      `insert into carts (id, user_id, name, kind, is_active)
       values ($1, $2, $3, 'gift', false)`,
      [randomUUID(), userId, `gift-fill-${i}`],
    );
  }
}

export const TEST_GIFT_PIN = testGiftPin;

export function createOfferBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    giverEmail: uniqueEmail('marc'),
    giverDisplayName: 'Marc',
    receiverName: 'Julie',
    giverComment: 'Pour toi',
    maxBudget: 120,
    hideReceiverPrices: true,
    language: 'fr',
    gdprConsent: { accepted: true },
    accessPin: TEST_GIFT_PIN,
    shareCardStyle: 'anniversaire',
    ...overrides,
  };
}

export async function createGiftOffer(
  request: APIRequestContext,
  body: Record<string, unknown>,
  opts: { token?: string; expectedStatus?: number | number[] } = {},
): Promise<{ status: number; body: GiftPortal & GiftErrorBody }> {
  return apiJson<GiftPortal & GiftErrorBody>(request, 'POST', '/gift/offers', {
    token: opts.token,
    data: body,
    expectedStatus: opts.expectedStatus ?? 201,
  });
}

export function extractGiftGiverToken(html: string): string {
  const decoded = html.replaceAll('&#x3D;', '=').replaceAll('&amp;', '&');
  const match = decoded.match(/\/gift\/giver\/([A-Fa-f0-9]{64})/i);
  if (!match?.[1]) throw new Error('no gift giver token in mail HTML');
  return match[1];
}

export function extractGiftReceiverToken(html: string): string {
  const decoded = html.replaceAll('&#x3D;', '=').replaceAll('&amp;', '&');
  const match = decoded.match(/\/gift\/(?!giver\/)([A-Fa-f0-9]{64})/i);
  if (!match?.[1]) throw new Error('no gift receiver token in mail HTML');
  return match[1];
}

export async function putReceiverItem(
  request: APIRequestContext,
  receiverToken: string,
  variant: PurchasableVariant,
  quantity: number,
  expectedStatus: number | number[] = 200,
): Promise<{ status: number; body: GiftPortal & GiftErrorBody }> {
  return apiJson<GiftPortal & GiftErrorBody>(request, 'PUT', `/gift/${receiverToken}/items`, {
    data: {
      productId: variant.productId,
      shapeKey: variant.shapeKey,
      lengthKey: variant.lengthKey,
      size: variant.size,
      quantity,
    },
    expectedStatus,
  });
}

export async function putJulieDestination(
  request: APIRequestContext,
  receiverToken: string,
): Promise<GiftPortal> {
  const { body } = await apiJson<GiftPortal>(request, 'PUT', `/gift/${receiverToken}/destination`, {
    data: JULIE_DESTINATION,
    expectedStatus: 200,
  });
  return body;
}

export async function confirmReceiver(
  request: APIRequestContext,
  receiverToken: string,
  email = 'julie.receiver@example.com',
): Promise<GiftPortal> {
  const { body } = await apiJson<GiftPortal>(request, 'POST', `/gift/${receiverToken}/confirm`, {
    data: { email },
    expectedStatus: 200,
  });
  return body;
}

export async function seedReceiverChoice(
  request: APIRequestContext,
  receiverToken: string,
  quantity = 1,
  email = 'julie.receiver@example.com',
): Promise<{ variant: PurchasableVariant; summary: GiftPortal }> {
  const variant = await pickPurchasableVariant(request);
  await putReceiverItem(request, receiverToken, variant, quantity);
  await putJulieDestination(request, receiverToken);
  const summary = await confirmReceiver(request, receiverToken, email);
  return { variant, summary };
}

export async function forceOfferTimestamp(
  offerId: string,
  column: 'offer_expires_at' | 'hold_expires_at' | 'pay_by_at' | 'receiver_visible_until',
  at: Date,
): Promise<void> {
  await pool.query(`update gift_offers set ${column} = $2, updated_at = now() where id = $1`, [
    offerId,
    at.toISOString(),
  ]);
}

export async function expireGiftHold(offerId: string): Promise<void> {
  const past = new Date(Date.now() - 60_000);
  await pool.query(
    `update stock_reservations sr
     set expires_at = $2
     from gift_offers go
     where go.id = $1 and sr.id = go.stock_reservation_id`,
    [offerId, past.toISOString()],
  );
  await forceOfferTimestamp(offerId, 'hold_expires_at', past);
}

export async function waitForGiftShareMail(email: string, sinceMs: number): Promise<DevMail> {
  return waitForMail({
    kind: 'user',
    toIncludes: email,
    subjectIncludes: 'Carte cadeau',
    sinceMs,
  });
}

export async function waitForGiftPromiseMail(email: string, sinceMs: number): Promise<DevMail> {
  return waitForMail({
    kind: 'user',
    toIncludes: email,
    subjectIncludes: 'a confirmé son choix',
    sinceMs,
  });
}

export async function waitForGiftCancelledMail(email: string, sinceMs: number): Promise<DevMail> {
  return waitForMail({
    kind: 'user',
    toIncludes: email,
    subjectIncludes: 'Cadeau non payé',
    sinceMs,
  });
}

export async function processGiftCron(): Promise<Record<string, unknown>> {
  const { status, json } = await opsRequest('POST', '/operation/process-gift');
  if (status !== 200) {
    throw new Error(`process-gift failed ${status}: ${JSON.stringify(json)}`);
  }
  return json;
}

export async function countOrdersForOffer(offerId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::text as n from orders where gift_offer_id = $1`,
    [offerId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function countGiftCarts(userId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::text as n from carts where user_id = $1 and kind = 'gift'`,
    [userId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function giftHoldState(offerId: string): Promise<{ purpose: string; state: string } | null> {
  const { rows } = await pool.query<{ purpose: string; state: string }>(
    `select sr.purpose, sr.state
     from gift_offers go
     join stock_reservations sr on sr.id = go.stock_reservation_id
     where go.id = $1`,
    [offerId],
  );
  return rows[0] ?? null;
}

export async function giftHoldProductUids(offerId: string): Promise<string[]> {
  const { rows } = await pool.query<{ product_uid: string }>(
    `select p.product_uid
       from gift_offers go
       join stock_reservation_items sri on sri.reservation_id = go.stock_reservation_id
       join products p on p.id = sri.product_id
      where go.id = $1
      order by p.product_uid`,
    [offerId],
  );
  return rows.map((row) => row.product_uid);
}

export async function collectPublicFeedProductUids(
  request: APIRequestContext,
): Promise<string[]> {
  const uids: string[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < 40; page += 1) {
    const query = new URLSearchParams({ limit: '60', stock: 'in' });
    if (cursor) query.set('cursor', cursor);
    const { body } = await apiJson<{
      items?: Array<{ productUid?: string }>;
      nextCursor?: string | null;
    }>(request, 'GET', `/gallery/feed?${query.toString()}`, {
      expectedStatus: 200,
    });
    for (const item of body.items ?? []) {
      if (item.productUid) uids.push(item.productUid);
    }
    if (!body.nextCursor) break;
    cursor = body.nextCursor;
  }
  return uids;
}

export async function collectReceiverFeedProductUids(
  request: APIRequestContext,
  receiverToken: string,
): Promise<string[]> {
  const uids: string[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < 40; page += 1) {
    const query = new URLSearchParams({ limit: '60' });
    if (cursor) query.set('cursor', cursor);
    const { body } = await apiJson<{
      items?: Array<{ productUid?: string }>;
      nextCursor?: string | null;
    }>(request, 'GET', `/gift/${receiverToken}/gallery/feed?${query.toString()}`, {
      expectedStatus: 200,
    });
    for (const item of body.items ?? []) {
      if (item.productUid) uids.push(item.productUid);
    }
    if (!body.nextCursor) break;
    cursor = body.nextCursor;
  }
  return uids;
}

export async function loadGiverPortal(
  request: APIRequestContext,
  giverToken: string,
): Promise<GiftPortal> {
  const { body } = await apiJson<GiftPortal>(request, 'GET', `/gift/giver/${giverToken}`, {
    expectedStatus: 200,
  });
  return body;
}

export async function accessoryProductId(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from products where product_uid = $1`,
    [E2E_ACCESSORY_UIDS.GLUE_DOSES],
  );
  if (!rows[0]) throw new Error('missing E2E glue accessory product');
  return rows[0].id;
}

export function accessoryPutBody(productId: string): { productId: string; packKey: string; quantity: number } {
  return { productId, packKey: 'x5', quantity: 1 };
}

export async function oosNailVariant(): Promise<PurchasableVariant> {
  const { rows } = await pool.query<{ id: string }>(`select id from products where product_uid = $1`, [
    E2E_PRODUCT_UIDS.OOS,
  ]);
  if (!rows[0]) throw new Error('missing E2E OOS nail product');
  return {
    productId: rows[0].id,
    productUid: E2E_PRODUCT_UIDS.OOS,
    shapeKey: E2E_SHAPES[0],
    lengthKey: E2E_LENGTH,
    size: 'M',
  };
}
