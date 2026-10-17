import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export type GiftPinRole = 'giver' | 'receiver';

export async function insertPinSession(
  db: pg.Pool | pg.PoolClient,
  offerId: string,
  role: GiftPinRole,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await db.query(
    `insert into gift_pin_sessions (id, offer_id, role, token_hash, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [randomUUID(), offerId, role, tokenHash, expiresAt.toISOString()],
  );
}

export async function findValidPinSession(
  db: pg.Pool | pg.PoolClient,
  offerId: string,
  role: GiftPinRole,
  tokenHash: string,
): Promise<boolean> {
  const { rows } = await db.query<{ ok: number }>(
    `select 1 as ok from gift_pin_sessions
     where offer_id = $1 and role = $2 and token_hash = $3 and expires_at > now()
     limit 1`,
    [offerId, role, tokenHash],
  );
  return rows.length > 0;
}
