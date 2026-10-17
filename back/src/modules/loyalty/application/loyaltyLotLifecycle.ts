import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export function roundLoyaltyEuro(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Expire one lot’s current remaining (must already be locked). Idempotent
 * expire ledger via unique (lot_id) where kind = expire. */
export async function expireLotRemaining(
  client: pg.PoolClient,
  lot: { id: string; user_id: string; remaining: string | number },
  nowIso: string,
  reason?: string,
): Promise<number> {
  const remaining = roundLoyaltyEuro(Number(lot.remaining));
  if (remaining <= 0) {
    await client.query(
      `update loyalty_lots
          set status = 'expired', expired_at = coalesce(expired_at, $2::timestamptz),
              remaining = 0, updated_at = now()
        where id = $1 and status <> 'expired'`,
      [lot.id, nowIso],
    );
    return 0;
  }
  const { rowCount } = await client.query(
    `update loyalty_lots
        set status = 'expired', expired_at = $2, remaining = 0, updated_at = now()
      where id = $1 and remaining > 0`,
    [lot.id, nowIso],
  );
  if ((rowCount ?? 0) === 0) return 0;
  await client.query(
    `insert into loyalty_ledger (id, user_id, kind, amount, lot_id, reason, created_at)
     values ($1, $2, 'expire', $3, $4, $5, now())
     on conflict (lot_id) where (kind = 'expire' and lot_id is not null) do nothing`,
    [randomUUID(), lot.user_id, -remaining, lot.id, reason ?? null],
  );
  return remaining;
}

/** Restore an allocation onto a lot; if the lot is past expires_at, expire
 * that restored remainder in the same step so remaining never sits on expired. */
export async function restoreLotAllocation(
  client: pg.PoolClient,
  lotId: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  const { rows } = await client.query<{
    id: string;
    user_id: string;
    remaining: string;
    expires_at: string;
    status: string;
  }>(`select id, user_id, remaining, expires_at, status from loyalty_lots where id = $1 for update`, [lotId]);
  const lot = rows[0];
  if (!lot) return;
  const nowIso = new Date().toISOString();
  const pastDue = new Date(lot.expires_at).getTime() <= Date.now();
  if (pastDue) {
    await client.query(
      `update loyalty_lots
          set remaining = least(amount, remaining + $2), updated_at = now()
        where id = $1`,
      [lotId, amount],
    );
    const { rows: refreshed } = await client.query<{ remaining: string; user_id: string }>(
      `select remaining, user_id from loyalty_lots where id = $1`,
      [lotId],
    );
    const rem = refreshed[0];
    if (rem) {
      await expireLotRemaining(client, { id: lotId, user_id: rem.user_id, remaining: rem.remaining }, nowIso);
    }
    return;
  }
  await client.query(
    `update loyalty_lots
        set remaining = least(amount, remaining + $2),
            status = case when status = 'depleted' then 'active' else status end,
            updated_at = now()
      where id = $1`,
    [lotId, amount],
  );
}
