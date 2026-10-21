import { createHmac, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../../config/env.js';
import { type OrderItemRow, type OrderRow, type OrderStatus } from '../../domain/order.js';
import {
  computeFullOrderSnapshotHash,
  computeOrderContentHash,
  fullOrderSnapshot,
} from '../orderIntegrity.js';
import { encryptOrderSnapshot } from '../../infrastructure/revisionStorage.js';

export const REVISION_ELIGIBLE_STATUSES = new Set<OrderStatus>(['confirmed', 'in_preparation']);

export interface OrderRevisionLockInfo {
  lockToken: string;
  lockUntil: string;
  ttlSeconds: number;
}

export function lockTtlSeconds(): number {
  return Math.round(config.orderRevisionLockTtlMs / 1000);
}

export function lockUntilFromNow(): Date {
  return new Date(Date.now() + config.orderRevisionLockTtlMs);
}

export function isLockActive(order: OrderRow, now = new Date()): boolean {
  return !!order.revision_lock_until && new Date(order.revision_lock_until).getTime() > now.getTime();
}

/** True when lock columns are set (active or expired-but-uncleared). */
export function hasRevisionLock(order: OrderRow): boolean {
  return !!order.revision_lock_token;
}

export function isLockStale(order: OrderRow, now = new Date()): boolean {
  return hasRevisionLock(order) && !isLockActive(order, now);
}

function remainingLockMinutes(lockUntil: string, now = new Date()): number {
  return Math.max(1, Math.ceil((new Date(lockUntil).getTime() - now.getTime()) / 60_000));
}

/** Human-readable ops refusal when set-status hits an active customer edit lock. */
export function revisionLockRefusalMessage(order: OrderRow): string {
  const until = order.revision_lock_until!;
  const minutes = remainingLockMinutes(until);
  return (
    `Order ${order.order_number} is being edited by the customer. ` +
    `Status changes are blocked until the customer saves/closes the edit, ` +
    `or until you pass --bypass-lock-edit after contacting them ` +
    `(lock expires at ${new Date(until).toISOString()}, in about ${minutes} minute${minutes === 1 ? '' : 's'}).`
  );
}

/** Ops refusal when lock TTL elapsed but columns were never cleared. */
export function revisionLockStaleRefusalMessage(order: OrderRow): string {
  const until = order.revision_lock_until;
  const untilPart = until ? ` (expired at ${new Date(until).toISOString()})` : '';
  return (
    `Order ${order.order_number} still has an uncleared customer edit lock${untilPart}. ` +
    `Contact the customer, or pass --bypass-lock-edit to clear the lock and continue.`
  );
}

export async function clearRevisionLockColumns(
  client: pg.Pool | pg.PoolClient,
  orderId: string,
): Promise<void> {
  await client.query(`update orders set ${clearLockSql()}, updated_at = now() where id = $1`, [orderId]);
}

export function computeChainedContentHash(
  previousHash: string,
  order: OrderRow,
  items: OrderItemRow[],
): string {
  const snapshotHash = computeOrderContentHash(order, items);
  return createHmac('sha256', config.jwt.secret)
    .update(previousHash + snapshotHash)
    .digest('hex');
}

export async function latestRevisionNumber(client: pg.PoolClient, orderId: string): Promise<number> {
  const { rows } = await client.query<{ n: number | null }>(
    `select max(revision_number) as n from order_revisions where order_id = $1`,
    [orderId],
  );
  return rows[0]?.n ?? 0;
}

export function revisionLimitReached(latestRevisionNumber: number): boolean {
  return latestRevisionNumber >= config.orderRevisionMax;
}

export async function saveOrderSnapshot(
  client: pg.PoolClient,
  order: OrderRow,
  items: OrderItemRow[],
  revisionNumber: number,
): Promise<void> {
  if (!order.content_hash) throw new Error(`Missing content hash for order ${order.id} snapshot`);
  const snapshot = fullOrderSnapshot(order, items);
  await client.query(
    `insert into order_snapshots (id, order_id, revision_number, content_hash, snapshot_hash, snapshot)
     values ($1, $2, $3, $4, $5, $6::jsonb)
     on conflict (order_id, revision_number) do nothing`,
    [
      randomUUID(),
      order.id,
      revisionNumber,
      order.content_hash,
      computeFullOrderSnapshotHash(snapshot),
      JSON.stringify(encryptOrderSnapshot(snapshot)),
    ],
  );
}

export async function orderHasInvoice(client: pg.Pool | pg.PoolClient, orderId: string): Promise<boolean> {
  const { rows } = await client.query(`select 1 from order_invoices where order_id = $1 limit 1`, [orderId]);
  return rows.length > 0;
}

export function clearLockSql(): string {
  return `revision_lock_token = null, revision_lock_until = null,
          revision_lock_user_id = null, revision_lock_baseline_hash = null`;
}
