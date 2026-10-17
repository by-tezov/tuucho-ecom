import type pg from 'pg';
import { expireLotRemaining, roundLoyaltyEuro } from './loyaltyLotLifecycle.js';

export const LOYALTY_MAINTENANCE_BATCH = 200;

export type LoyaltyLotExpiryRow = {
  id: string;
  user_id: string;
  remaining: string | number;
};

/**
 * Materialize lot expiry. Requires an open transaction on `client`.
 * Uses SKIP LOCKED + conditional UPDATE so concurrent expiry cannot double-burn.
 */
export async function materializeExpiredLots(
  client: pg.PoolClient,
  userId?: string,
  limit = LOYALTY_MAINTENANCE_BATCH,
): Promise<number> {
  const nowIso = new Date().toISOString();
  const params: unknown[] = [nowIso, limit];
  let userFilter = '';
  if (userId) {
    params.push(userId);
    userFilter = ` and user_id = $3`;
  }
  const { rows } = await client.query<LoyaltyLotExpiryRow>(
    `select id, user_id, remaining from loyalty_lots
      where status = 'active' and remaining > 0 and expires_at <= $1${userFilter}
      order by expires_at asc
      limit $2
      for update skip locked`,
    params,
  );
  let expiredTotal = 0;
  for (const lot of rows) {
    expiredTotal = roundLoyaltyEuro(expiredTotal + (await expireLotRemaining(client, lot, nowIso)));
  }
  return expiredTotal;
}
