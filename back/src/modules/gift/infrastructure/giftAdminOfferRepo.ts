import type pg from 'pg';
import { decryptPii } from '../../../platform/security/piiCrypto.js';
import type { GiftStatus } from '../domain/statuses.js';
import { isGiftStatus, LIVE_GIFT_STATUSES } from '../domain/statuses.js';

export interface AdminGiftOfferListRow {
  id: string;
  status: GiftStatus;
  giverEmail: string;
  giverDisplayName: string;
  receiverName: string;
  receiverEmail: string | null;
  maxSets: number | null;
  maxBudget: number | null;
  allowAccessories: boolean;
  maxAccessoryBudget: number | null;
  offerExpiresAt: Date | null;
  holdExpiresAt: Date | null;
  payByAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminOfferDbRow {
  id: string;
  status: string;
  giver_email: string;
  giver_display_name: string;
  receiver_name: string;
  receiver_email: string | null;
  max_sets: number | null;
  max_budget: string | null;
  allow_accessories: boolean;
  max_accessory_budget: string | null;
  offer_expires_at: Date | string | null;
  hold_expires_at: Date | string | null;
  pay_by_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function asDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function mapAdminOffer(row: AdminOfferDbRow): AdminGiftOfferListRow {
  const status = isGiftStatus(row.status) ? row.status : 'expired';
  return {
    id: row.id,
    status,
    giverEmail: decryptPii(row.giver_email) ?? '',
    giverDisplayName: decryptPii(row.giver_display_name) ?? '',
    receiverName: decryptPii(row.receiver_name) ?? '',
    receiverEmail: decryptPii(row.receiver_email),
    maxSets: row.max_sets,
    maxBudget: row.max_budget == null ? null : Number(row.max_budget),
    allowAccessories: row.allow_accessories,
    maxAccessoryBudget: row.max_accessory_budget == null ? null : Number(row.max_accessory_budget),
    offerExpiresAt: asDate(row.offer_expires_at),
    holdExpiresAt: asDate(row.hold_expires_at),
    payByAt: asDate(row.pay_by_at),
    createdAt: asDate(row.created_at) ?? new Date(),
    updatedAt: asDate(row.updated_at) ?? new Date(),
  };
}

export async function listActiveGiftOffers(
  db: pg.Pool | pg.PoolClient,
  page: number,
  pageSize: number,
): Promise<{ rows: AdminGiftOfferListRow[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const statuses = [...LIVE_GIFT_STATUSES];
  const { rows: countRows } = await db.query<{ total: number }>(
    `select count(*)::int as total from gift_offers where status = any($1::text[])`,
    [statuses],
  );
  const { rows } = await db.query<AdminOfferDbRow>(
    `select id, status, giver_email, giver_display_name, receiver_name, receiver_email,
            max_sets, max_budget, allow_accessories, max_accessory_budget,
            offer_expires_at, hold_expires_at, pay_by_at, created_at, updated_at
       from gift_offers
      where status = any($1::text[])
      order by created_at desc
      limit $2 offset $3`,
    [statuses, pageSize, offset],
  );
  return {
    total: countRows[0]?.total ?? 0,
    rows: rows.map(mapAdminOffer),
  };
}
