import { randomUUID } from 'node:crypto';
import { SUPER_ADMIN_ROLE } from '../../identity/domain/staffPermissions.js';
import type pg from 'pg';
import { pricedItemLineKey } from '../domain/pricedLineKey.js';
import { config } from '../../../config/env.js';
import { emailsByUserIds } from '../../identity/application/users.js';
import { computeUserBurnNotice } from './burnNotice.js';
import { expireLotRemaining, restoreLotAllocation, roundLoyaltyEuro } from './loyaltyLotLifecycle.js';
import { LOYALTY_MAINTENANCE_BATCH, materializeExpiredLots } from './loyaltyExpiry.js';
import type { VoucherOfferType } from '../../vouchers/application/vouchers.js';
export { computeOrderEarnRetention, reverseUnusedOrderEarn } from './loyaltyEarnClawback.js';
export { materializeExpiredLots } from './loyaltyExpiry.js';
export {
  DEFAULT_LOT_DURATION_MONTHS,
  expiresAtFromGrantedAt,
  isLotDurationMonths,
  LOT_DURATION_MONTH_OPTIONS,
  nextExpiryDateAfter,
  parisLocalToUtc,
} from '../domain/expiryCalendar.js';
import { expiresAtFromGrantedAt, nextExpiryDateAfter } from '../domain/expiryCalendar.js';
import { recordAdminActivity } from '../../activity/application/recordAdminActivity.js';
import type { AuthenticatedUser } from '../../../types.js';

export type LoyaltySettingsSnapshot = {
  valuePer100: number;
  lotDurationMonths: number;
  burnNoticeWeeks: number;
  reminderIntervalDays: number;
  updatedAt: string | null;
};

export type LoyaltyLedgerKind =
  'earn' | 'spend' | 'spend_refund' | 'expire' | 'credit_manual' | 'uncredit_manual' | 'earn_reversal';

function isPoolClient(db: pg.Pool | pg.PoolClient): db is pg.PoolClient {
  return typeof (db as pg.PoolClient).release === 'function';
}

export type LoyaltyPricingLine = {
  lineKey: string;
  productType: string;
  origin: 'user' | 'rule';
  lineTotal: number;
  loyaltyMultiplier: number;
};

export type LoyaltyPricingInput = {
  lines: LoyaltyPricingLine[];
  merchandiseSubtotal: number;
  rulesItemDiscount: number;
  voucherItemDiscount: number;
  voucherShippingDiscount: number;
  shippingFee: number;
  applyLoyalty: boolean;
  userId: string | null;
  voucherOfferType: VoucherOfferType | null;
  availableBalance?: number;
};

export type LoyaltyPricingResult = {
  loyaltyCredit: number;
  loyaltyEarn: number;
  earnStatus: 'pending' | 'void';
  incompatibleWithVoucher: boolean;
};

export type LoyaltyWalletSummary = {
  /** Always true. The programme is not a Boutique switch. */
  enabled: boolean;
  /** Always true. Earn, grant, and reminders always run. */
  earningEnabled: boolean;
  available: number;
  atRisk: number;
  atRiskExpiresAt: string | null;
  burnNoticeAmount: number | null;
  burnNoticeExpiresAt: string | null;
  carried: number;
  coming: number;
  burned: number;
  nextSettlementDate: string;
};

function round2(value: number): number {
  return roundLoyaltyEuro(value);
}

export function getLoyaltySettings(): LoyaltySettingsSnapshot {
  return {
    valuePer100: config.loyalty.valuePer100,
    lotDurationMonths: config.loyalty.lotDurationMonths,
    burnNoticeWeeks: config.loyalty.burnNoticeWeeks,
    reminderIntervalDays: config.loyalty.reminderIntervalDays,
    updatedAt: null,
  };
}

/** Splits `amount` across lines in proportion to their weight, the last line
 * taking the rounding remainder. Each share is clamped to [0, weight], so a
 * line never gets more discount than it has left (the remainder used to go
 * negative when weights and the denominator came from different bases). */
function allocateByWeight(
  paid: ReadonlyArray<{ lineKey: string; weight: number }>,
  amount: number,
): Map<string, number> {
  const map = new Map<string, number>();
  const total = round2(paid.reduce((sum, line) => sum + line.weight, 0));
  if (total <= 0 || amount <= 0) return map;
  const capped = Math.min(amount, total);
  let allocated = 0;
  for (let i = 0; i < paid.length; i++) {
    const line = paid[i]!;
    const raw = i === paid.length - 1 ? capped - allocated : (line.weight / total) * capped;
    const share = round2(Math.min(line.weight, Math.max(0, raw)));
    map.set(line.lineKey, share);
    allocated = round2(allocated + share);
  }
  return map;
}

function paidUserLines(lines: LoyaltyPricingLine[]): LoyaltyPricingLine[] {
  return lines.filter((l) => l.origin === 'user' && l.lineTotal > 0);
}

export function computeLoyaltyPricing(
  input: LoyaltyPricingInput,
  settings: LoyaltySettingsSnapshot,
): LoyaltyPricingResult {
  const merchandiseAfterRules = round2(input.merchandiseSubtotal - input.rulesItemDiscount);
  const hasVoucher =
    input.voucherOfferType != null || input.voucherItemDiscount > 0 || input.voucherShippingDiscount > 0;
  const incompatible = hasVoucher && input.applyLoyalty;
  const canApplyCredit =
    input.applyLoyalty && input.userId && !hasVoucher && (input.availableBalance ?? 0) > 0;

  const capBase = Math.max(0, merchandiseAfterRules - input.voucherItemDiscount);
  const maxByCap = capBase;
  const preCreditTotal = round2(
    merchandiseAfterRules + input.shippingFee - input.voucherItemDiscount - input.voucherShippingDiscount,
  );
  const loyaltyCredit = canApplyCredit
    ? round2(Math.min(input.availableBalance ?? 0, maxByCap, Math.max(0, preCreditTotal)))
    : 0;

  // Earn base per line, in pricing order: volume remise, then voucher, then
  // loyalty credit (docs/schema/07-loyalty.md). Earn follows the price the
  // shopper pays, not the gross sous-total.
  const paid = paidUserLines(input.lines);
  const rulesByLine = allocateByWeight(
    paid.map((l) => ({ lineKey: l.lineKey, weight: l.lineTotal })),
    input.rulesItemDiscount,
  );
  const afterRules = (l: LoyaltyPricingLine) =>
    Math.max(0, round2(l.lineTotal - (rulesByLine.get(l.lineKey) ?? 0)));
  const voucherByLine = allocateByWeight(
    paid.map((l) => ({ lineKey: l.lineKey, weight: afterRules(l) })),
    input.voucherItemDiscount,
  );
  const afterVoucher = (l: LoyaltyPricingLine) =>
    Math.max(0, round2(afterRules(l) - (voucherByLine.get(l.lineKey) ?? 0)));
  const loyaltyByLine = allocateByWeight(
    paid.map((l) => ({ lineKey: l.lineKey, weight: afterVoucher(l) })),
    loyaltyCredit,
  );

  let weightedEligible = 0;
  for (const line of paid) {
    const afterLoyalty = Math.max(0, afterVoucher(line) - (loyaltyByLine.get(line.lineKey) ?? 0));
    if (afterLoyalty <= 0) continue;
    weightedEligible = round2(weightedEligible + afterLoyalty * line.loyaltyMultiplier);
  }

  const loyaltyEarn = round2((weightedEligible * settings.valuePer100) / 100);
  return {
    loyaltyCredit,
    loyaltyEarn,
    // Persist pending whenever there is earn to grant later (account verify,
    // or guest claim then verify). Amount is the order snapshot; status gates grant.
    earnStatus: loyaltyEarn > 0 ? 'pending' : 'void',
    incompatibleWithVoucher: incompatible,
  };
}

/**
 * Release held loyalty past reservation TTL. Caller must hold an open
 * transaction. Bounded by SKIP LOCKED batch.
 */
async function releaseExpiredLoyaltyHolds(
  client: pg.PoolClient,
  userId?: string,
  limit = LOYALTY_MAINTENANCE_BATCH,
): Promise<number> {
  const params: unknown[] = [limit];
  let userFilter = '';
  if (userId) {
    params.push(userId);
    userFilter = ` and user_id = $2`;
  }
  const { rows } = await client.query<{ id: string; reservation_id: string }>(
    `select id, reservation_id from loyalty_holds
      where state = 'held' and expires_at <= now()${userFilter}
      order by expires_at asc
      limit $1
      for update skip locked`,
    params,
  );
  for (const hold of rows) {
    await releaseLoyaltyHold(client, hold.reservation_id);
  }
  return rows.length;
}

/** Sweep expired holds then expire due lots for one user (or all) inside `client`. */
async function maintainLoyaltyForClient(
  client: pg.PoolClient,
  userId?: string,
): Promise<{ holdsReleased: number; expiredTotal: number }> {
  let holdsReleased = 0;
  let expiredTotal = 0;
  for (;;) {
    const n = await releaseExpiredLoyaltyHolds(client, userId);
    holdsReleased += n;
    if (n < LOYALTY_MAINTENANCE_BATCH) break;
  }
  for (;;) {
    const n = await materializeExpiredLots(client, userId);
    expiredTotal = round2(expiredTotal + n);
    if (n <= 0) break;
  }
  return { holdsReleased, expiredTotal };
}

async function withLoyaltyTransaction<T>(
  db: pg.Pool | pg.PoolClient,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (isPoolClient(db)) return fn(db);
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function getAvailableBalance(db: pg.Pool | pg.PoolClient, userId: string): Promise<number> {
  return withLoyaltyTransaction(db, async (client) => {
    await maintainLoyaltyForClient(client, userId);
    const { rows } = await client.query<{ total: string }>(
      `select coalesce(sum(remaining), 0)::text as total
         from loyalty_lots
        where user_id = $1 and status = 'active' and remaining > 0`,
      [userId],
    );
    return round2(Number(rows[0]?.total ?? 0));
  });
}

/** Normalize legacy void earn rows once an order can be granted. */
async function prepareOrderEarnForGrant(client: pg.PoolClient, orderId: string): Promise<void> {
  await client.query(
    `update orders
        set loyalty_earn_status = 'pending', updated_at = now()
      where id = $1
        and loyalty_earn_status = 'void'
        and loyalty_earn > 0
        and loyalty_granted_at is null
        and status = 'received'
        and admin_verified_at is not null`,
    [orderId],
  );
}

async function grantDueOrderEarnsForUserClient(client: pg.PoolClient, userId: string): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    `select id from orders o
      where o.user_id = $1
        and o.status = 'received'
        and o.admin_verified_at is not null
        and o.loyalty_earn > 0
        and o.loyalty_granted_at is null
        and o.loyalty_earn_status in ('pending', 'void')
        and not exists (
          select 1 from loyalty_ledger l
           where l.order_id = o.id and l.kind = 'earn_reversal'
        )
      order by confirmed_at asc, created_at asc`,
    [userId],
  );
  let granted = 0;
  for (const row of rows) {
    await prepareOrderEarnForGrant(client, row.id);
    if (await grantPendingOrderEarn(client, row.id)) granted += 1;
  }
  return granted;
}

/** Grants every received+verified order earn still due for one account,
 * inside the caller's transaction. */
export async function grantDueOrderEarnsForUserInTransaction(
  client: pg.PoolClient,
  userId: string,
): Promise<number> {
  return grantDueOrderEarnsForUserClient(client, userId);
}

export async function getWalletSummary(db: pg.Pool, userId: string): Promise<LoyaltyWalletSummary> {
  return withLoyaltyTransaction(db, async (client) => {
    await maintainLoyaltyForClient(client, userId);
    // Heal legacy guest confirms that stored earn as void, then were verified /
    // claimed without creating a lot (wallet stayed at 0 while order UI still
    // showed the earn amount). Skip orders that already have earn_reversal.
    await grantDueOrderEarnsForUserClient(client, userId);
    const settings = getLoyaltySettings();
    const nextSettlement = nextExpiryDateAfter(settings.lotDurationMonths);
    const nextIso = nextSettlement.toISOString();

    const { rows: availRows } = await client.query<{ total: string }>(
      `select coalesce(sum(remaining), 0)::text as total from loyalty_lots
        where user_id = $1 and status = 'active' and remaining > 0`,
      [userId],
    );
    const available = round2(Number(availRows[0]?.total ?? 0));

    const { rows: atRiskRows } = await client.query<{ total: string }>(
      `select coalesce(sum(remaining), 0)::text as total from loyalty_lots
        where user_id = $1 and status = 'active' and remaining > 0 and expires_at = $2`,
      [userId, nextIso],
    );
    const atRisk = round2(Number(atRiskRows[0]?.total ?? 0));

    const { rows: carriedRows } = await client.query<{ total: string }>(
      `select coalesce(sum(remaining), 0)::text as total from loyalty_lots
        where user_id = $1 and status = 'active' and remaining > 0 and expires_at > $2`,
      [userId, nextIso],
    );
    const carried = round2(Number(carriedRows[0]?.total ?? 0));

    const { rows: comingRows } = await client.query<{ total: string }>(
      `select coalesce(sum(loyalty_earn), 0)::text as total from orders o
        where o.user_id = $1 and o.loyalty_earn_status = 'pending' and o.status <> 'cancelled'
          and not exists (
            select 1 from loyalty_ledger l
             where l.order_id = o.id and l.kind = 'earn_reversal'
          )`,
      [userId],
    );
    const coming = round2(Number(comingRows[0]?.total ?? 0));

    const { rows: burnedRows } = await client.query<{ total: string }>(
      `select coalesce(sum(amount - remaining), 0)::text as total from loyalty_lots
        where user_id = $1 and status = 'expired'`,
      [userId],
    );
    const burned = round2(Number(burnedRows[0]?.total ?? 0));

    const burnNotice = await computeUserBurnNotice(client, userId, settings.burnNoticeWeeks);

    return {
      enabled: true,
      earningEnabled: true,
      available,
      atRisk,
      atRiskExpiresAt: atRisk > 0 ? nextIso : null,
      burnNoticeAmount: burnNotice?.amount ?? null,
      burnNoticeExpiresAt: burnNotice?.expiresAt ?? null,
      carried,
      coming,
      burned,
      nextSettlementDate: nextIso,
    };
  });
}

export async function grantPendingOrderEarn(client: pg.PoolClient, orderId: string): Promise<boolean> {
  await prepareOrderEarnForGrant(client, orderId);
  const { rows } = await client.query<{
    id: string;
    user_id: string | null;
    loyalty_earn: string;
    loyalty_earn_status: string;
    loyalty_granted_at: string | null;
    status: string;
    admin_verified_at: string | null;
  }>(
    `select id, user_id, loyalty_earn, loyalty_earn_status, loyalty_granted_at,
            status, admin_verified_at
       from orders where id = $1 for update`,
    [orderId],
  );
  const order = rows[0];
  if (!order || !order.user_id || order.status !== 'received' || !order.admin_verified_at) {
    return false;
  }
  if (order.loyalty_granted_at || order.loyalty_earn_status === 'granted') {
    return false;
  }
  const earn = round2(Number(order.loyalty_earn));
  // Legacy guest confirms stored amount with status void (no account yet).
  // Once claimed + verified, that void still means "not granted" when amount > 0.
  if (earn <= 0 || (order.loyalty_earn_status !== 'pending' && order.loyalty_earn_status !== 'void')) {
    if (earn <= 0 && order.loyalty_earn_status === 'pending') {
      await client.query(`update orders set loyalty_earn_status = 'void', updated_at = now() where id = $1`, [
        orderId,
      ]);
    }
    return false;
  }
  const grantedAt = new Date();
  const settings = getLoyaltySettings();
  const expiresAt = expiresAtFromGrantedAt(grantedAt, settings.lotDurationMonths);
  const lotId = randomUUID();
  try {
    await client.query(
      `insert into loyalty_lots (
         id, user_id, source, order_id, amount, remaining, granted_at, expires_at, status
       ) values ($1, $2, 'order', $3, $4, $4, $5, $6, 'active')`,
      [lotId, order.user_id, orderId, earn, grantedAt.toISOString(), expiresAt.toISOString()],
    );
  } catch (error) {
    // Unique order earn lot — concurrent heal/verify already created it.
    if ((error as { code?: string }).code === '23505') return false;
    throw error;
  }
  await client.query(
    `insert into loyalty_ledger (id, user_id, kind, amount, lot_id, order_id, created_at)
     values ($1, $2, 'earn', $3, $4, $5, now())
     on conflict (order_id) where (kind = 'earn' and order_id is not null) do nothing`,
    [randomUUID(), order.user_id, earn, lotId, orderId],
  );
  await client.query(
    `update orders
        set loyalty_earn_status = 'granted', loyalty_granted_at = now(), updated_at = now()
      where id = $1`,
    [orderId],
  );
  return true;
}

export async function voidPendingOrderEarn(client: pg.PoolClient, orderId: string): Promise<void> {
  await client.query(
    `update orders
        set loyalty_earn_status = 'void', updated_at = now()
      where id = $1 and loyalty_earn_status = 'pending'`,
    [orderId],
  );
}

type LotSlice = { id: string; remaining: number; expires_at: string; granted_at: string };

async function selectLotsFifo(
  client: pg.PoolClient,
  userId: string,
  amount: number,
): Promise<Array<{ lotId: string; amount: number }>> {
  await maintainLoyaltyForClient(client, userId);
  const { rows } = await client.query<LotSlice>(
    `select id, remaining::float8 as remaining, expires_at, granted_at
       from loyalty_lots
      where user_id = $1 and status = 'active' and remaining > 0
      order by expires_at asc, granted_at asc
      for update`,
    [userId],
  );
  let left = amount;
  const out: Array<{ lotId: string; amount: number }> = [];
  for (const row of rows) {
    if (left <= 0) break;
    const take = round2(Math.min(row.remaining, left));
    if (take <= 0) continue;
    out.push({ lotId: row.id, amount: take });
    left = round2(left - take);
  }
  if (left > 0.001) throw new Error('insufficient_loyalty_balance');
  return out;
}

export async function createLoyaltyHold(
  client: pg.PoolClient,
  userId: string,
  reservationId: string,
  amount: number,
  expiresAt: Date,
): Promise<string | null> {
  if (amount <= 0) return null;
  const slices = await selectLotsFifo(client, userId, amount);
  const holdId = randomUUID();
  await client.query(
    `insert into loyalty_holds (id, user_id, reservation_id, amount, state, expires_at)
     values ($1, $2, $3, $4, 'held', $5)`,
    [holdId, userId, reservationId, amount, expiresAt.toISOString()],
  );
  if (slices.length > 0) {
    await client.query(
      `insert into loyalty_hold_allocations (hold_id, lot_id, amount)
       select $1, unnest($2::uuid[]), unnest($3::numeric[])`,
      [holdId, slices.map((slice) => slice.lotId), slices.map((slice) => slice.amount)],
    );
    await client.query(
      `update loyalty_lots l
          set remaining = l.remaining - s.amount,
              status = case when l.remaining - s.amount <= 0 then 'depleted' else l.status end,
              updated_at = now()
         from (
           select unnest($1::uuid[]) as lot_id, unnest($2::numeric[]) as amount
         ) s
        where l.id = s.lot_id`,
      [slices.map((slice) => slice.lotId), slices.map((slice) => slice.amount)],
    );
  }
  return holdId;
}

export async function releaseLoyaltyHold(client: pg.PoolClient, reservationId: string): Promise<void> {
  const { rows: holds } = await client.query<{ id: string }>(
    `select id from loyalty_holds where reservation_id = $1 and state = 'held' for update`,
    [reservationId],
  );
  if (holds.length === 0) return;
  const holdIds = holds.map((hold) => hold.id);
  const { rows: allocs } = await client.query<{ lot_id: string; amount: string }>(
    `select lot_id, amount from loyalty_hold_allocations where hold_id = any($1::uuid[])`,
    [holdIds],
  );
  // Restore per lot (expiry side-effects stay correct via restoreLotAllocation).
  for (const alloc of allocs) {
    await restoreLotAllocation(client, alloc.lot_id, Number(alloc.amount));
  }
  await client.query(
    `update loyalty_holds set state = 'released', updated_at = now()
      where id = any($1::uuid[]) and state = 'held'`,
    [holdIds],
  );
}

export async function consumeLoyaltyHold(
  client: pg.PoolClient,
  reservationId: string,
  orderId: string,
  userId: string,
): Promise<boolean> {
  const { rows: holds } = await client.query<{ id: string; amount: string }>(
    `select id, amount
       from loyalty_holds
      where reservation_id = $1
        and user_id = $2
        and state = 'held'
        and expires_at > now()
      for update`,
    [reservationId, userId],
  );
  const hold = holds[0];
  if (!hold) return false;
  const amount = Number(hold.amount);
  const { rows: allocs } = await client.query<{ lot_id: string; amount: string }>(
    `select lot_id, amount from loyalty_hold_allocations where hold_id = $1`,
    [hold.id],
  );
  for (const alloc of allocs) {
    await client.query(
      `insert into loyalty_ledger (id, user_id, kind, amount, lot_id, order_id, created_at)
       values ($1, $2, 'spend', $3, $4, $5, now())`,
      [randomUUID(), userId, -Number(alloc.amount), alloc.lot_id, orderId],
    );
  }
  await client.query(
    `update loyalty_holds set state = 'consumed', order_id = $2, updated_at = now() where id = $1`,
    [hold.id, orderId],
  );
  if (amount > 0 && allocs.length === 0) return false;
  return true;
}

/** Restore loyalty debited by a now-cancelled order. Unique (order_id, lot_id)
 * spend_refund makes retries idempotent. Restored amount that lands after
 * expires_at is expired in the same step (no spendable zombie on expired lots). */
export async function refundConsumedLoyaltyForOrder(client: pg.PoolClient, orderId: string): Promise<void> {
  const { rows: existing } = await client.query<{ id: string }>(
    `select id from loyalty_ledger where order_id = $1 and kind = 'spend_refund' limit 1`,
    [orderId],
  );
  if (existing[0]) return;

  const { rows: spends } = await client.query<{
    user_id: string;
    lot_id: string | null;
    amount: string;
  }>(
    `select user_id, lot_id, amount
       from loyalty_ledger
      where order_id = $1 and kind = 'spend'
      order by created_at, id
      for update`,
    [orderId],
  );
  for (const spend of spends) {
    const restored = -Number(spend.amount);
    if (restored <= 0) continue;
    if (spend.lot_id) {
      await restoreLotAllocation(client, spend.lot_id, restored);
    }
    await client.query(
      `insert into loyalty_ledger (id, user_id, kind, amount, lot_id, order_id, created_at)
       values ($1, $2, 'spend_refund', $3, $4, $5, now())
       on conflict (order_id, lot_id)
         where (kind = 'spend_refund' and order_id is not null and lot_id is not null)
         do nothing`,
      [randomUUID(), spend.user_id, restored, spend.lot_id, orderId],
    );
  }
}

async function resolveAdminActor(
  client: pg.PoolClient,
  actorUserId: string,
  actorEmail?: string | null,
): Promise<AuthenticatedUser> {
  let email = actorEmail?.trim() || '';
  if (!email) {
    const { rows } = await client.query<{ email: string }>(`select email from users where id = $1`, [actorUserId]);
    email = rows[0]?.email ?? '';
  }
  return { id: actorUserId, email, role: SUPER_ADMIN_ROLE };
}

export async function manualCreditLot(
  client: pg.PoolClient,
  userId: string,
  amount: number,
  reason: string,
  actorUserId: string,
  actorEmail?: string | null,
): Promise<void> {
  if (amount <= 0) throw new Error('invalid_amount');
  const grantedAt = new Date();
  const settings = getLoyaltySettings();
  const expiresAt = expiresAtFromGrantedAt(grantedAt, settings.lotDurationMonths);
  const lotId = randomUUID();
  await client.query(
    `insert into loyalty_lots (
       id, user_id, source, amount, remaining, granted_at, expires_at, status
     ) values ($1, $2, 'manual', $3, $3, $4, $5, 'active')`,
    [lotId, userId, amount, grantedAt.toISOString(), expiresAt.toISOString()],
  );
  await client.query(
    `insert into loyalty_ledger (id, user_id, kind, amount, reason, actor_user_id, lot_id, created_at)
     values ($1, $2, 'credit_manual', $3, $4, $5, $6, now())`,
    [randomUUID(), userId, amount, reason, actorUserId, lotId],
  );
  const actor = await resolveAdminActor(client, actorUserId, actorEmail);
  await recordAdminActivity(client, actor, {
    category: 'loyalty',
    action: 'loyalty.credit_manual',
    summary: `Credit manuel de ${amount} EUR`,
    targetType: 'user',
    targetId: userId,
    detail: { userId, amount, reason, lotId },
  });
}

export async function manualUncredit(
  client: pg.PoolClient,
  userId: string,
  amount: number,
  reason: string,
  actorUserId: string,
  actorEmail?: string | null,
): Promise<void> {
  if (amount <= 0) throw new Error('invalid_amount');
  await maintainLoyaltyForClient(client, userId);
  const slices = await selectLotsFifo(client, userId, amount);
  let total = 0;
  for (const slice of slices) {
    total = round2(total + slice.amount);
    await client.query(
      `update loyalty_lots set remaining = remaining - $2, updated_at = now() where id = $1`,
      [slice.lotId, slice.amount],
    );
    const { rows } = await client.query<{ remaining: string }>(
      `select remaining from loyalty_lots where id = $1`,
      [slice.lotId],
    );
    const rem = Number(rows[0]?.remaining ?? 0);
    if (rem <= 0) {
      await client.query(`update loyalty_lots set status = 'depleted', updated_at = now() where id = $1`, [
        slice.lotId,
      ]);
    }
  }
  await client.query(
    `insert into loyalty_ledger (id, user_id, kind, amount, reason, actor_user_id, created_at)
     values ($1, $2, 'uncredit_manual', $3, $4, $5, now())`,
    [randomUUID(), userId, -total, reason, actorUserId],
  );
  const actor = await resolveAdminActor(client, actorUserId, actorEmail);
  await recordAdminActivity(client, actor, {
    category: 'loyalty',
    action: 'loyalty.uncredit_manual',
    summary: `Decredit manuel de ${total} EUR`,
    targetType: 'user',
    targetId: userId,
    detail: { userId, amount: total, reason },
  });
}

export type LoyaltyLedgerEntry = {
  id: string;
  kind: LoyaltyLedgerKind;
  amount: number;
  reason: string | null;
  orderId: string | null;
  orderNumber: string | null;
  createdAt: string;
};

export async function listLedger(
  db: pg.Pool,
  userId: string,
  page: number,
  pageSize: number,
): Promise<{ entries: LoyaltyLedgerEntry[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const { rows: countRows } = await db.query<{ count: string }>(
    `select count(*)::text as count from loyalty_ledger where user_id = $1`,
    [userId],
  );
  const total = Number(countRows[0]?.count ?? 0);
  const { rows } = await db.query<{
    id: string;
    kind: LoyaltyLedgerKind;
    amount: string;
    reason: string | null;
    order_id: string | null;
    order_number: string | null;
    created_at: string;
  }>(
    `select l.id, l.kind, l.amount, l.reason, l.order_id, o.order_number, l.created_at
       from loyalty_ledger l
       left join orders o on o.id = l.order_id
      where l.user_id = $1
      order by l.created_at desc
      limit $2 offset $3`,
    [userId, pageSize, offset],
  );
  return {
    total,
    entries: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      amount: Number(r.amount),
      reason: r.reason,
      orderId: r.order_id,
      orderNumber: r.order_number,
      createdAt: r.created_at,
    })),
  };
}

export type LoyaltyManualOp = {
  id: string;
  kind: 'credit_manual' | 'uncredit_manual';
  amount: number;
  reason: string | null;
  createdAt: string;
  userId: string;
  userEmail: string;
  actorUserId: string | null;
  actorEmail: string | null;
};

export async function listManualAdjustments(
  db: pg.Pool,
  page: number,
  pageSize: number,
): Promise<{ entries: LoyaltyManualOp[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const { rows: countRows } = await db.query<{ count: string }>(
    `select count(*)::text as count from loyalty_ledger
      where kind in ('credit_manual', 'uncredit_manual')`,
  );
  const total = Number(countRows[0]?.count ?? 0);
  const { rows } = await db.query<{
    id: string;
    kind: 'credit_manual' | 'uncredit_manual';
    amount: string;
    reason: string | null;
    created_at: string;
    user_id: string;
    actor_user_id: string | null;
  }>(
    `select id, kind, amount, reason, created_at, user_id, actor_user_id
       from loyalty_ledger
      where kind in ('credit_manual', 'uncredit_manual')
      order by created_at desc
      limit $1 offset $2`,
    [pageSize, offset],
  );
  const emailById = await emailsByUserIds(
    db,
    rows.flatMap((row) => [row.user_id, ...(row.actor_user_id ? [row.actor_user_id] : [])]),
  );
  return {
    total,
    entries: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      amount: Number(row.amount),
      reason: row.reason,
      createdAt: row.created_at,
      userId: row.user_id,
      userEmail: emailById.get(row.user_id) ?? row.user_id,
      actorUserId: row.actor_user_id,
      actorEmail: row.actor_user_id ? (emailById.get(row.actor_user_id) ?? row.actor_user_id) : null,
    })),
  };
}

export type LoyaltyAdminStats = {
  totalOutstanding: number;
  pendingGrant: number;
  atRiskBeforeNextMarch: number;
  usersWithBalance: number;
  minAvailable: number | null;
  averageAvailable: number | null;
  maxAvailable: number | null;
};

export async function getLoyaltyAdminStats(db: pg.Pool): Promise<LoyaltyAdminStats> {
  await withLoyaltyTransaction(db, (client) => maintainLoyaltyForClient(client));
  const settings = getLoyaltySettings();
  const nextExpiry = nextExpiryDateAfter(settings.lotDurationMonths).toISOString();

  const { rows: outRows } = await db.query<{ total: string }>(
    `select coalesce(sum(remaining), 0)::text as total from loyalty_lots
      where status = 'active' and remaining > 0`,
  );
  const { rows: pendingRows } = await db.query<{ total: string }>(
    `select coalesce(sum(loyalty_earn), 0)::text as total from orders
      where loyalty_earn_status = 'pending' and status <> 'cancelled'`,
  );
  const { rows: atRiskRows } = await db.query<{ total: string }>(
    `select coalesce(sum(remaining), 0)::text as total from loyalty_lots
      where status = 'active' and remaining > 0 and expires_at = $1`,
    [nextExpiry],
  );
  const { rows: userRows } = await db.query<{ count: string }>(
    `select count(distinct user_id)::text as count from loyalty_lots
      where status = 'active' and remaining > 0`,
  );
  const { rows: aggRows } = await db.query<{ min: string | null; avg: string | null; max: string | null }>(
    `select min(balance)::text as min, avg(balance)::text as avg, max(balance)::text as max
       from (
         select user_id, sum(remaining) as balance
           from loyalty_lots
          where status = 'active' and remaining > 0
          group by user_id
          having sum(remaining) > 0
       ) balances`,
  );

  const agg = aggRows[0];
  return {
    totalOutstanding: round2(Number(outRows[0]?.total ?? 0)),
    pendingGrant: round2(Number(pendingRows[0]?.total ?? 0)),
    atRiskBeforeNextMarch: round2(Number(atRiskRows[0]?.total ?? 0)),
    usersWithBalance: Number(userRows[0]?.count ?? 0),
    minAvailable: agg?.min != null ? round2(Number(agg.min)) : null,
    averageAvailable: agg?.avg != null ? round2(Number(agg.avg)) : null,
    maxAvailable: agg?.max != null ? round2(Number(agg.max)) : null,
  };
}

export async function releaseLoyaltyHoldsForUser(client: pg.PoolClient, userId: string): Promise<void> {
  const { rows } = await client.query<{ reservation_id: string }>(
    `select reservation_id from loyalty_holds where user_id = $1 and state = 'held'`,
    [userId],
  );
  for (const row of rows) {
    await releaseLoyaltyHold(client, row.reservation_id);
  }
}

export async function buildLoyaltyPricingForCheckout(
  client: pg.Pool | pg.PoolClient,
  params: {
    userId: string | null;
    applyLoyalty: boolean;
    items: Array<{
      line: {
        product_id: string | null;
        product_type: string;
        shape_key: string;
        length_key: string;
        size: string;
        origin: 'user' | 'rule';
        loyalty_multiplier?: number;
        composition_id?: string;
      };
      lineTotal: number;
    }>;
    merchandiseSubtotal: number;
    rulesItemDiscount: number;
    voucherItemDiscount: number;
    voucherShippingDiscount: number;
    shippingFee: number;
    voucherOfferType: VoucherOfferType | null;
  },
): Promise<LoyaltyPricingResult> {
  const settings = getLoyaltySettings();
  const availableBalance =
    params.userId && params.applyLoyalty ? await getAvailableBalance(client, params.userId) : 0;
  return computeLoyaltyPricing(
    {
      lines: params.items.map(({ line, lineTotal }) => ({
        lineKey: pricedItemLineKey(line),
        productType: line.product_type,
        origin: line.origin,
        lineTotal,
        loyaltyMultiplier: line.loyalty_multiplier ?? 1,
      })),
      merchandiseSubtotal: params.merchandiseSubtotal,
      rulesItemDiscount: params.rulesItemDiscount,
      voucherItemDiscount: params.voucherItemDiscount,
      voucherShippingDiscount: params.voucherShippingDiscount,
      shippingFee: params.shippingFee,
      applyLoyalty: params.applyLoyalty,
      userId: params.userId,
      voucherOfferType: params.voucherOfferType,
      availableBalance,
    },
    settings,
  );
}

/** Write off spendable credit before hard-delete. Ledger rows survive with
 * user_id nulled by ON DELETE SET NULL; lots are removed by CASCADE. */
export async function writeOffWalletBeforeAccountDeletion(
  client: pg.PoolClient,
  userId: string,
): Promise<number> {
  await maintainLoyaltyForClient(client, userId);
  const { rows } = await client.query<{ id: string; remaining: string; user_id: string }>(
    `select id, remaining::text as remaining, user_id from loyalty_lots
      where user_id = $1 and status = 'active' and remaining > 0
      for update`,
    [userId],
  );
  let writtenOff = 0;
  const nowIso = new Date().toISOString();
  for (const lot of rows) {
    writtenOff = round2(writtenOff + (await expireLotRemaining(client, lot, nowIso, 'account_deletion')));
  }
  return writtenOff;
}

export async function processLoyaltyExpiry(
  pool: pg.Pool,
): Promise<{ holdsReleased: number; expiredTotal: number }> {
  return withLoyaltyTransaction(pool, (client) => maintainLoyaltyForClient(client));
}
