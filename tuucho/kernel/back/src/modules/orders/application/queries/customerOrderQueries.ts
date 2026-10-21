import { timingSafeEqual } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../../config/env.js';
import { markGuestOrderManageTokensUsed } from '../guestOrderManage.js';
import { grantDueOrderEarnsForUserInTransaction } from '../../../plugins/application/pluginBridges.js';
import { decryptPii, emailLookupHash } from '../../../../platform/security/piiCrypto.js';
import { type OrderItemRow, type OrderRow, type OrderStatus } from '../../domain/order.js';
import type { OrderRevisionKind, OrderRevisionRequestedBy } from '../../domain/orderRevision.js';
import { formatIntegrityToken } from '../orderIntegrity.js';
import { attachItems, decryptOrderRow } from '../../infrastructure/orderRows.js';
import { decryptRevisionDiff } from '../../infrastructure/revisionStorage.js';

export async function revisionCountsByOrderId(
  pool: pg.Pool,
  orderIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const id of orderIds) counts.set(id, 0);
  if (orderIds.length === 0) return counts;
  const { rows } = await pool.query<{ order_id: string; n: string }>(
    `select order_id, count(*)::text as n from order_revisions
     where order_id = any($1::uuid[])
     group by order_id`,
    [orderIds],
  );
  for (const row of rows) counts.set(row.order_id, Number(row.n));
  return counts;
}

export interface OrderRevisionRow {
  id: string;
  order_id: string;
  revision_number: number;
  kind: OrderRevisionKind;
  diff: unknown;
  total_before: string;
  total_after: string;
  requested_by: OrderRevisionRequestedBy;
  /** Resolved from the immutable preceding snapshot when listing. */
  previous_content_hash: string | null;
  content_hash: string;
  created_at: string;
}

export type ListOrderRevisionsResult =
  { ok: true; revisions: OrderRevisionRow[] } | { ok: false; reason: 'not_found' };

export async function listRevisionsForUser(
  pool: pg.Pool,
  userId: string,
  orderId: string,
): Promise<ListOrderRevisionsResult> {
  const { rows: orderRows } = await pool.query<{ id: string }>(
    `select id from orders where id = $1 and user_id = $2`,
    [orderId, userId],
  );
  if (!orderRows[0]) return { ok: false, reason: 'not_found' };
  const { rows } = await pool.query<OrderRevisionRow>(
    `select * from order_revisions where order_id = $1 order by revision_number asc`,
    [orderId],
  );
  const { rows: snapshots } = await pool.query<{ revision_number: number; content_hash: string }>(
    `select revision_number, content_hash from order_snapshots where order_id = $1`,
    [orderId],
  );
  const hashByRevision = new Map(
    snapshots.map((snapshot) => [snapshot.revision_number, snapshot.content_hash]),
  );
  return {
    ok: true,
    revisions: rows.map((row, index) => ({
      ...row,
      // Legacy rows have no snapshot record. The preceding revision's chain
      // head is still exact from revision 2 onward; revision 1 stays null
      // when its original confirm-time hash was never retained.
      previous_content_hash:
        hashByRevision.get(row.revision_number - 1) ?? rows[index - 1]?.content_hash ?? null,
      diff: decryptRevisionDiff(row.diff),
    })),
  };
}

const ACTIVE_STATUSES: OrderStatus[] = [
  'confirmed',
  'in_preparation',
  'to_send',
  'sent',
  'disponible',
  'need_review',
  'return_review',
];
const HISTORY_STATUSES: OrderStatus[] = ['received', 'cancelled'];

export const ORDER_LIST_LIMIT_MIN = 20;
export const ORDER_LIST_LIMIT_MAX = 50;
export const ORDER_LIST_LIMIT_DEFAULT = 30;

export function clampOrderListLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) return ORDER_LIST_LIMIT_DEFAULT;
  return Math.min(ORDER_LIST_LIMIT_MAX, Math.max(ORDER_LIST_LIMIT_MIN, Math.trunc(n)));
}

/** Opaque cursor: `${confirmed_at}|${id}` (confirmed_at may be empty). */
export function encodeOrderListCursor(order: Pick<OrderRow, 'id' | 'confirmed_at'>): string {
  return Buffer.from(`${order.confirmed_at ?? ''}|${order.id}`, 'utf8').toString('base64url');
}

export function decodeOrderListCursor(raw: unknown): { confirmedAt: string | null; id: string } | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const decoded = Buffer.from(raw.trim(), 'base64url').toString('utf8');
    const sep = decoded.lastIndexOf('|');
    if (sep < 0) return null;
    const confirmedAt = decoded.slice(0, sep) || null;
    const id = decoded.slice(sep + 1);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { confirmedAt, id };
  } catch {
    return null;
  }
}

export async function listForUser(
  pool: pg.Pool,
  userId: string,
  scope: 'active' | 'history',
  options: { limit?: number; cursor?: string | null } = {},
): Promise<{
  rows: { order: OrderRow; items: OrderItemRow[] }[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const statuses = scope === 'history' ? HISTORY_STATUSES : ACTIVE_STATUSES;
  const limit = clampOrderListLimit(options.limit);
  const cursor = decodeOrderListCursor(options.cursor);
  const params: unknown[] = [userId, statuses];
  let cursorSql = '';
  if (cursor) {
    params.push(cursor.confirmedAt, cursor.id);
    cursorSql = ` and (
      confirmed_at < coalesce($3::timestamptz, '-infinity'::timestamptz)
      or (
        confirmed_at = coalesce($3::timestamptz, '-infinity'::timestamptz)
        and id < $4::uuid
      )
    )`;
  }
  params.push(limit + 1);
  const limitIndex = params.length;
  const { rows: orders } = await pool.query<OrderRow>(
    `select * from orders
     where user_id = $1 and status = any($2::text[])${cursorSql}
     -- confirmed_at is NOT NULL, so no coalesce: the plain column lets
     -- orders_user_confirmed_idx serve this order directly.
     order by confirmed_at desc, id desc
     limit $${limitIndex}`,
    params,
  );
  const hasMore = orders.length > limit;
  const page = hasMore ? orders.slice(0, limit) : orders;
  const decrypted = page.map(decryptOrderRow);
  const itemsByOrder = await attachItems(pool, decrypted);
  const rows = decrypted.map((order) => ({ order, items: itemsByOrder.get(order.id) ?? [] }));
  const last = rows[rows.length - 1]?.order;
  return {
    rows,
    nextCursor: hasMore && last ? encodeOrderListCursor(last) : null,
    hasMore,
  };
}

export async function getForUser(
  pool: pg.Pool,
  userId: string,
  orderId: string,
): Promise<{ order: OrderRow; items: OrderItemRow[] } | undefined> {
  const { rows } = await pool.query<OrderRow>(`select * from orders where id = $1 and user_id = $2`, [
    orderId,
    userId,
  ]);
  const order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
  if (!order) return undefined;
  const itemsByOrder = await attachItems(pool, [order]);
  return { order, items: itemsByOrder.get(order.id) ?? [] };
}

export interface GuestOrderCandidate {
  id: string;
  orderNumber: string;
  total: number;
  status: OrderStatus;
}

function sameEmail(left: string | null, right: string): boolean {
  return left?.trim().toLowerCase() === right.trim().toLowerCase();
}

/** Oldest `confirmed_at` still eligible for the integrity-code claim flow.
 * See config.guestOrderClaimWindowMs (GUEST_ORDER_CLAIM_WINDOW) for why this
 * is a separate window from the emailed manage-order link's TTL. */
function guestClaimCutoff(): string {
  return new Date(Date.now() - config.guestOrderClaimWindowMs).toISOString();
}

/** Every guest order still open to re-integration. Three conditions, and each
 * one is load-bearing:
 *
 * - `guest_email is not null` excludes orders orphaned by an account deletion.
 *   Those carry `owner_deleted_at` and a null `guest_email` by construction
 *   (see 1787380000000), so they can never be offered to anyone again — not
 *   even to a new account created at the same address. Permanent by design.
 * - `guest_email_lookup = $lookup` is the blind index doing the matching in
 *   SQL. It replaces decrypting every guest order in the table and comparing
 *   in JavaScript.
 * - `confirmed_at >= $cutoff` bounds the offer to GUEST_ORDER_CLAIM_WINDOW. */
function claimableGuestOrderSql(alias: string, lookupIndex: number, cutoffIndex: number): string {
  return `${alias}.user_id is null
      and ${alias}.guest_email is not null
      and ${alias}.guest_email_lookup = $${lookupIndex}
      and ${alias}.confirmed_at >= $${cutoffIndex}`;
}

async function assignGuestOrderOwnership(
  client: pg.PoolClient,
  orderId: string,
  userId: string,
): Promise<boolean> {
  const { rowCount } = await client.query(
    `update orders
        set user_id = $2, guest_email = null, guest_email_lookup = null, updated_at = now()
      where id = $1 and user_id is null and guest_email is not null`,
    [orderId, userId],
  );
  if ((rowCount ?? 0) > 0) {
    await client.query(`delete from guest_order_dismissals where order_id = $1`, [orderId]);
    await markGuestOrderManageTokensUsed(client, [orderId]);
    // Received+verified guest orders may have been verified before claim;
    // credit every due earn for this account now that user_id is set.
    await grantDueOrderEarnsForUserInTransaction(client, userId);
    return true;
  }
  return false;
}

/** Attach every still-unlinked guest order whose checkout email matches.
 * `forceOrderId` is attached even if this account previously dismissed it
 * (the manage-order click is inbox proof for that specific mail). Other
 * matching leftovers skip a prior dismiss. Independent account creation
 * must not call this. */
export async function attachUnlinkedGuestOrdersForEmail(
  client: pg.PoolClient,
  userId: string,
  email: string,
  forceOrderId?: string,
): Promise<string[]> {
  const { rows } = await client.query<Pick<OrderRow, 'id'>>(
    `select o.id
     from orders o
     where ${claimableGuestOrderSql('o', 3, 4)}
       and not exists (
         select 1 from guest_order_dismissals d
         where d.user_id = $1 and d.order_id = o.id and o.id is distinct from $2::uuid
       )
     order by o.confirmed_at desc, o.created_at desc`,
    [userId, forceOrderId ?? null, emailLookupHash(email), guestClaimCutoff()],
  );
  const attached: string[] = [];
  for (const row of rows) {
    if (await assignGuestOrderOwnership(client, row.id, userId)) attached.push(row.id);
  }
  return attached;
}

/** One-shot backfill for orders that predate the `guest_email_lookup` column
 * (migration 1787380000001). The value is an HMAC of the plaintext address and
 * LWS's Postgres has no pgcrypto, so it cannot be computed in SQL — this runs
 * from POST /operation/database-migrate straight after the migration, and is a
 * cheap no-op on every later call. Batched so a large table cannot hold one
 * statement open for long. */
export async function backfillGuestEmailLookups(pool: pg.Pool, batchSize = 500): Promise<number> {
  let filled = 0;
  for (;;) {
    const { rows } = await pool.query<Pick<OrderRow, 'id' | 'guest_email'>>(
      `select id, guest_email from orders
        where guest_email is not null and guest_email_lookup is null
        limit $1`,
      [batchSize],
    );
    if (rows.length === 0) return filled;

    const ids: string[] = [];
    const lookups: string[] = [];
    for (const row of rows) {
      const email = decryptPii(row.guest_email);
      if (!email) continue;
      ids.push(row.id);
      lookups.push(emailLookupHash(email));
    }
    if (ids.length === 0) return filled;

    await pool.query(
      `update orders o
          set guest_email_lookup = source.lookup
         from (select unnest($1::uuid[]) as id, unnest($2::text[]) as lookup) as source
        where o.id = source.id`,
      [ids, lookups],
    );
    filled += ids.length;
    if (rows.length < batchSize) return filled;
  }
}

function integrityTokenMatches(contentHash: string | null, submitted: string): boolean {
  if (!contentHash) return false;
  if (!/^[a-f0-9]{4}(?:-[a-f0-9]{4}){3}$/i.test(submitted.trim())) return false;
  const expected = formatIntegrityToken(contentHash);
  const actual = submitted.trim().toUpperCase();
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

/** Guest orders this account may re-integrate, matched on the blind index
 * rather than by decrypting the table (see claimableGuestOrderSql for what
 * each condition is doing, including why an order orphaned by an account
 * deletion can never appear here). */
export async function listClaimableGuestOrders(
  pool: pg.Pool,
  userId: string,
  email: string,
): Promise<GuestOrderCandidate[]> {
  const { rows } = await pool.query<Pick<OrderRow, 'id' | 'order_number' | 'total' | 'status'>>(
    `select o.id, o.order_number, o.total, o.status
     from orders o
     where ${claimableGuestOrderSql('o', 2, 3)}
       and o.content_hash is not null
       and not exists (
         select 1 from guest_order_dismissals d where d.user_id = $1 and d.order_id = o.id
       )
     order by o.confirmed_at desc, o.created_at desc`,
    [userId, emailLookupHash(email), guestClaimCutoff()],
  );
  return rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    total: Number(row.total),
    status: row.status,
  }));
}

export type ClaimGuestOrderResult = 'claimed' | 'not_found' | 'invalid_integrity_token';

export async function claimGuestOrder(
  pool: pg.Pool,
  userId: string,
  email: string,
  orderId: string,
  integrityToken: string,
): Promise<ClaimGuestOrderResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<OrderRow>(
      `select * from orders o where o.id = $1 and ${claimableGuestOrderSql('o', 2, 3)} for update`,
      [orderId, emailLookupHash(email), guestClaimCutoff()],
    );
    const order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
    if (!order || !sameEmail(order.guest_email, email)) {
      await client.query('rollback');
      return 'not_found';
    }
    if (!integrityTokenMatches(order.content_hash, integrityToken)) {
      await client.query('rollback');
      return 'invalid_integrity_token';
    }
    await assignGuestOrderOwnership(client, orderId, userId);
    await client.query('commit');
    return 'claimed';
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function dismissGuestOrder(
  pool: pg.Pool,
  userId: string,
  email: string,
  orderId: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<OrderRow>(
      `select * from orders o where o.id = $1 and ${claimableGuestOrderSql('o', 2, 3)} for update`,
      [orderId, emailLookupHash(email), guestClaimCutoff()],
    );
    const order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
    if (!order || !sameEmail(order.guest_email, email)) {
      await client.query('rollback');
      return false;
    }
    await client.query(
      `insert into guest_order_dismissals (user_id, order_id) values ($1, $2) on conflict do nothing`,
      [userId, orderId],
    );
    await client.query('commit');
    return true;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
