import type pg from 'pg';
import type { GiftPinRole } from './giftPinRepo.js';

export interface GiftPinAttemptRow {
  failedCount: number;
  nextAllowedAt: Date | null;
}

// timestamptz columns come back as raw strings (see src/db/pool.ts type parsers).
function asDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}


/**
 * Serialize PIN verify/fail under a row lock so parallel guesses cannot race
 * past the throttle counter. Ensures a row exists, then locks it.
 */
export async function lockPinAttempts(
  db: pg.PoolClient,
  offerId: string,
  role: GiftPinRole,
): Promise<GiftPinAttemptRow> {
  await db.query(
    `insert into gift_pin_attempts (offer_id, role, failed_count, next_allowed_at, updated_at)
     values ($1, $2, 0, null, now())
     on conflict (offer_id, role) do nothing`,
    [offerId, role],
  );
  const { rows } = await db.query<{ failed_count: number; next_allowed_at: Date | string | null }>(
    `select failed_count, next_allowed_at
       from gift_pin_attempts
      where offer_id = $1 and role = $2
      for update`,
    [offerId, role],
  );
  const row = rows[0]!;
  return {
    failedCount: row.failed_count,
    nextAllowedAt: asDate(row.next_allowed_at),
  };
}

export async function recordPinFailure(
  db: pg.Pool | pg.PoolClient,
  offerId: string,
  role: GiftPinRole,
  nextAllowedAt: Date | null,
): Promise<GiftPinAttemptRow> {
  const { rows } = await db.query<{ failed_count: number; next_allowed_at: Date | string | null }>(
    `insert into gift_pin_attempts (offer_id, role, failed_count, next_allowed_at, updated_at)
     values ($1, $2, 1, $3, now())
     on conflict (offer_id, role) do update
        set failed_count = gift_pin_attempts.failed_count + 1,
            next_allowed_at = excluded.next_allowed_at,
            updated_at = now()
     returning failed_count, next_allowed_at`,
    [offerId, role, nextAllowedAt],
  );
  const row = rows[0]!;
  return {
    failedCount: row.failed_count,
    nextAllowedAt: asDate(row.next_allowed_at),
  };
}

export async function clearPinAttempts(
  db: pg.Pool | pg.PoolClient,
  offerId: string,
  role: GiftPinRole,
): Promise<void> {
  await db.query(`delete from gift_pin_attempts where offer_id = $1 and role = $2`, [offerId, role]);
}
