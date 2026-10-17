import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { roundLoyaltyEuro } from './loyaltyLotLifecycle.js';

/**
 * Spent portion of this order’s earn lot already used on later checkouts
 * (amount − remaining), in euro. Used to retain cash on return reimbursement.
 */
export async function computeOrderEarnRetention(
  db: pg.Pool | pg.PoolClient,
  orderId: string,
): Promise<{ unusedEuro: number; spentEuro: number; earnEuro: number }> {
  const { rows } = await db.query<{ amount: string; remaining: string }>(
    `select amount, remaining from loyalty_lots
      where order_id = $1 and source = 'order'
      limit 1`,
    [orderId],
  );
  const lot = rows[0];
  if (!lot) {
    const { rows: orderRows } = await db.query<{ loyalty_earn: string; loyalty_earn_status: string }>(
      `select loyalty_earn, loyalty_earn_status from orders where id = $1`,
      [orderId],
    );
    const earn = roundLoyaltyEuro(Number(orderRows[0]?.loyalty_earn ?? 0));
    if (orderRows[0]?.loyalty_earn_status === 'granted' && earn > 0) {
      // Lot missing (e.g. fully consumed then lot row deleted — should not happen);
      // treat full earn as spent for retention.
      return { unusedEuro: 0, spentEuro: earn, earnEuro: earn };
    }
    return { unusedEuro: 0, spentEuro: 0, earnEuro: earn };
  }
  const earnEuro = roundLoyaltyEuro(Number(lot.amount));
  const unusedEuro = roundLoyaltyEuro(Number(lot.remaining));
  const spentEuro = roundLoyaltyEuro(Math.max(0, earnEuro - unusedEuro));
  return { unusedEuro, spentEuro, earnEuro };
}

/** Reverse only the unused remaining on this order’s earn lot. Idempotent. */
export async function reverseUnusedOrderEarn(client: pg.PoolClient, orderId: string): Promise<number> {
  const { rows: existing } = await client.query<{ id: string }>(
    `select id from loyalty_ledger where order_id = $1 and kind = 'earn_reversal' limit 1`,
    [orderId],
  );
  if (existing[0]) return 0;

  const { rows } = await client.query<{
    id: string;
    user_id: string;
    remaining: string;
    amount: string;
  }>(
    `select id, user_id, remaining, amount from loyalty_lots
      where order_id = $1 and source = 'order'
      for update`,
    [orderId],
  );
  const lot = rows[0];
  if (!lot) {
    // No lot (never granted or already gone) — still record a zero-amount marker
    // only when earn was granted so heal cannot recreate.
    const { rows: orderRows } = await client.query<{
      user_id: string | null;
      loyalty_granted_at: string | null;
      loyalty_earn: string;
    }>(`select user_id, loyalty_granted_at, loyalty_earn from orders where id = $1 for update`, [orderId]);
    const order = orderRows[0];
    if (!order?.loyalty_granted_at || !order.user_id) return 0;
    await client.query(
      `insert into loyalty_ledger (id, user_id, kind, amount, order_id, reason, created_at)
       values ($1, $2, 'earn_reversal', 0, $3, 'return_unused_none', now())
       on conflict (order_id) where (kind = 'earn_reversal' and order_id is not null) do nothing`,
      [randomUUID(), order.user_id, orderId],
    );
    return 0;
  }

  const unused = roundLoyaltyEuro(Number(lot.remaining));
  if (unused > 0) {
    await client.query(
      `update loyalty_lots
          set remaining = 0,
              status = case when status = 'active' then 'depleted' else status end,
              updated_at = now()
        where id = $1`,
      [lot.id],
    );
  }
  await client.query(
    `insert into loyalty_ledger (id, user_id, kind, amount, lot_id, order_id, reason, created_at)
     values ($1, $2, 'earn_reversal', $3, $4, $5, 'return_unused', now())
     on conflict (order_id) where (kind = 'earn_reversal' and order_id is not null) do nothing`,
    [randomUUID(), lot.user_id, -unused, lot.id, orderId],
  );
  return unused;
}
