import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { generateOpaqueToken, hashOpaqueToken as hashToken } from '../../../platform/security/opaqueToken.js';
import { scheduleAuthArtifactMaintenance } from '../../identity/application/authArtifactMaintenance.js';

export async function issuePasswordResetToken(pool: pg.Pool, userId: string): Promise<string> {
  const raw = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + config.passwordResetTokenTtlMs).toISOString();
  await pool.query(
    `insert into password_reset_tokens (id, user_id, token_hash, expires_at) values ($1, $2, $3, $4)`,
    [randomUUID(), userId, hashToken(raw), expiresAt],
  );
  scheduleAuthArtifactMaintenance(pool);
  return raw;
}

/** Marks the token used in the same query that checks it's valid, so a
 * token can never be raced into being consumed twice. */
export async function consumePasswordResetToken(
  pool: pg.Pool,
  rawToken: string,
): Promise<{ userId: string } | undefined> {
  const { rows } = await pool.query<{ user_id: string }>(
    `update password_reset_tokens set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now()
     returning user_id`,
    [hashToken(rawToken)],
  );
  return rows[0] ? { userId: rows[0].user_id } : undefined;
}

export type ResendLimitReason = 'day' | 'month';

/** Log-per-send (password_reset_sends), not a counter — same rolling-
 * window shape as emailConfirmation.service.ts's checkResendLimit.
 * POST /auth/request-password-reset never returns a distinguishable
 * response for "rate limited" vs "no such account" vs "sent" (it's
 * unauthenticated and deliberately always responds the same way to avoid
 * an account-enumeration oracle) — the caller checks this, and on a hit,
 * silently skips the send while still reporting success. */
export async function checkPasswordResetLimit(
  pool: pg.Pool,
  userId: string,
): Promise<ResendLimitReason | undefined> {
  const { rows } = await pool.query<{ last_day: string; last_month: string }>(
    `select
       count(*) filter (where sent_at > now() - interval '1 day') as last_day,
       count(*) filter (where sent_at > now() - interval '1 month') as last_month
     from password_reset_sends
     where user_id = $1`,
    [userId],
  );
  const counts = rows[0]!;
  if (Number(counts.last_day) >= config.passwordReset.limitDay) return 'day';
  if (Number(counts.last_month) >= config.passwordReset.limitMonth) return 'month';
  return undefined;
}

export async function recordPasswordResetSend(pool: pg.Pool, userId: string): Promise<void> {
  await pool.query(`insert into password_reset_sends (id, user_id) values ($1, $2)`, [randomUUID(), userId]);
}
