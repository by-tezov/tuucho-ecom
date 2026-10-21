import type pg from 'pg';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** True when now is inside the configured burn-notice window before expiresAt. */
function isWithinBurnNoticeWindow(expiresAt: Date, burnNoticeWeeks: number, now = new Date()): boolean {
  const windowStartMs = expiresAt.getTime() - burnNoticeWeeks * 7 * MS_PER_DAY;
  return now.getTime() >= windowStartMs && now.getTime() < expiresAt.getTime();
}

export async function computeUserBurnNotice(
  db: pg.Pool | pg.PoolClient,
  userId: string,
  burnNoticeWeeks: number,
  now = new Date(),
): Promise<{ amount: number; expiresAt: string } | null> {
  const { rows } = await db.query<{ expires_at: string; total: string }>(
    `select expires_at, sum(remaining)::text as total
       from loyalty_lots
      where user_id = $1 and status = 'active' and remaining > 0
      group by expires_at
      order by expires_at asc`,
    [userId],
  );
  for (const row of rows) {
    const expiresAt = new Date(row.expires_at);
    if (!isWithinBurnNoticeWindow(expiresAt, burnNoticeWeeks, now)) continue;
    const amount = round2(Number(row.total));
    if (amount <= 0) continue;
    return { amount, expiresAt: row.expires_at };
  }
  return null;
}

export async function listUsersForBurnNoticeReminder(
  db: pg.Pool,
  burnNoticeWeeks: number,
  now = new Date(),
): Promise<Array<{ userId: string; atRisk: number; expiresAt: string }>> {
  const { rows } = await db.query<{ user_id: string; expires_at: string; total: string }>(
    `select user_id, expires_at, sum(remaining)::text as total
       from loyalty_lots
      where status = 'active' and remaining > 0
      group by user_id, expires_at
      having sum(remaining) > 0
      order by user_id, expires_at asc`,
  );
  const byUser = new Map<string, { amount: number; expiresAt: string }>();
  for (const row of rows) {
    const expiresAt = new Date(row.expires_at);
    if (!isWithinBurnNoticeWindow(expiresAt, burnNoticeWeeks, now)) continue;
    if (byUser.has(row.user_id)) continue;
    const amount = round2(Number(row.total));
    if (amount <= 0) continue;
    byUser.set(row.user_id, { amount, expiresAt: row.expires_at });
  }
  return [...byUser.entries()].map(([userId, entry]) => ({
    userId,
    atRisk: entry.amount,
    expiresAt: entry.expiresAt,
  }));
}

export const BURN_NOTICE_MS_PER_DAY = MS_PER_DAY;
