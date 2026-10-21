import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { CUSTOMER_SELF_LOCK_REASON, type AccountLockInput } from '../domain/accountLock.js';
import { generateOpaqueToken, hashOpaqueToken as hashToken } from '../../../platform/security/opaqueToken.js';
import { revokeAllUserRefreshTokens } from '../../../platform/security/token.js';

export type { AccountLockInput, AccountLockSource } from '../domain/accountLock.js';
export {
  CUSTOMER_SELF_LOCK_REASON,
  OPS_DEFAULT_LOCK_REASON,
  normalizeLockReason,
} from '../domain/accountLock.js';

/** Sent to the OLD address on an email-change request (see account.routes.ts's
 * /change-email) — "if this wasn't you, click here". Deliberately a
 * different mechanism from accountUnlock.service.ts's step-up tokens (which
 * scope a single already-authenticated action) and from
 * loginAttempts.service.ts's temporary failed-login lockout (which
 * auto-expires and never touches `status`): this one requires no session at
 * all (the real owner may not even be able to log in as themselves anymore)
 * and, once consumed, stays locked until an operator reverses it. */
export async function issueAccountLockToken(pool: pg.Pool, userId: string): Promise<string> {
  const raw = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + config.accountSecurityLock.tokenTtlMs).toISOString();
  await pool.query(
    `insert into account_lock_tokens (id, user_id, token_hash, expires_at) values ($1, $2, $3, $4)`,
    [randomUUID(), userId, hashToken(raw), expiresAt],
  );
  return raw;
}

/** Shared by every durable lock entry point — flips status to 'locked', stores
 * metadata, and revokes every active session in one go. */
async function applyLock(pool: pg.Pool, userId: string, input: AccountLockInput): Promise<void> {
  await pool.query(
    `update users
        set status = 'locked',
            locked_at = now(),
            lock_reason = $2,
            lock_source = $3,
            locked_by_user_id = $4,
            updated_at = now()
      where id = $1`,
    [userId, input.reason, input.source, input.lockedByUserId ?? null],
  );
  await revokeAllUserRefreshTokens(pool, userId);
}

/** Consumes the token and locks the account — see applyLock. No self-service
 * unlock exists; only POST /operation/accounts/:idOrEmail/unlock (ops-token
 * gated, see operation.routes.ts) reverses this. */
export async function consumeAccountLockToken(
  pool: pg.Pool,
  rawToken: string,
): Promise<{ userId: string } | undefined> {
  const { rows } = await pool.query<{ user_id: string }>(
    `update account_lock_tokens set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now()
     returning user_id`,
    [hashToken(rawToken)],
  );
  const row = rows[0];
  if (!row) return undefined;
  await applyLock(pool, row.user_id, {
    reason: CUSTOMER_SELF_LOCK_REASON,
    source: 'customer',
  });
  return { userId: row.user_id };
}

/** Operator-initiated lock — admin UI, ops API, or `npm run user -- lock`.
 * Same applyLock as the token-based self-service path; only the trigger differs. */
export async function lockAccountByOperator(
  pool: pg.Pool,
  userId: string,
  input: AccountLockInput,
): Promise<void> {
  await applyLock(pool, userId, input);
}

/** Operator-only reversal — see the route's own doc comment for why this
 * has no customer-facing equivalent. */
export async function unlockAccount(pool: pg.Pool, userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `update users
        set status = 'active',
            locked_at = null,
            lock_reason = null,
            lock_source = null,
            locked_by_user_id = null,
            updated_at = now()
      where id = $1 and status = 'locked'
      returning id`,
    [userId],
  );
  return rows.length > 0;
}
