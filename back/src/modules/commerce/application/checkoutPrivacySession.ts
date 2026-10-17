import { randomBytes, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { generateOpaqueToken, hashOpaqueToken } from '../../../platform/security/opaqueToken.js';
import { decryptPii, encryptPii } from '../../../platform/security/piiCrypto.js';

export const CHECKOUT_SESSION_HEADER = 'x-checkout-session';
const KEY_BYTES = 32;
const EXPIRED_RETENTION = '7 days';
const CLEANUP_BATCH = 100;
const MAX_SESSION_PAYMENT_METHODS = 10;

interface SessionRow {
  id: string;
  token_hash: string;
  user_id: string | null;
  key_ciphertext: string;
  expires_at: Date | string;
  expired_at: Date | string | null;
}

export interface CheckoutPrivacySession {
  id: string;
  vaultKey: string;
  expiresAt: string;
}

class CheckoutPrivacySessionError extends Error {
  readonly code:
    'checkout_session_required' | 'checkout_session_expired' | 'checkout_session_audience_mismatch';

  constructor(
    code: 'checkout_session_required' | 'checkout_session_expired' | 'checkout_session_audience_mismatch',
  ) {
    super(code);
    this.code = code;
  }
}

function rawTokenFromRequest(req: Request): string | undefined {
  const value = req.get(CHECKOUT_SESSION_HEADER);
  return value && /^[a-f0-9]{64}$/i.test(value) ? value : undefined;
}

function sameAudience(row: SessionRow, userId: string | null): boolean {
  return row.user_id === userId || (row.user_id === null && userId !== null);
}

function unwrapKey(row: SessionRow): string {
  const raw = decryptPii(row.key_ciphertext);
  if (!raw || Buffer.from(raw, 'base64').length !== KEY_BYTES) {
    throw new Error('checkout_privacy_session_key_corrupt');
  }
  return raw;
}

async function expireSessionResources(client: pg.PoolClient, sessionId: string): Promise<void> {
  // Do not consume or detach rows here. A PaymentIntent opened just before
  // inactivity expiry must still be reconcilable by its webhook/finalize
  // path. Session binding makes these rows unavailable to every new tab or
  // session while the existing order pipeline can safely snapshot them.
  await client.query(
    `update carts
        set address_id = case when exists (
              select 1 from addresses a
               where a.id = carts.address_id and a.checkout_privacy_session_id = $1
            ) then null else address_id end,
            billing_address_id = case when exists (
              select 1 from addresses b
               where b.id = carts.billing_address_id and b.checkout_privacy_session_id = $1
            ) then null else billing_address_id end,
            payment_method_id = case when exists (
              select 1 from customer_card_retention r
               where r.user_id = carts.user_id
                 and r.stripe_payment_method_id = carts.payment_method_id
                 and r.checkout_privacy_session_id = $1
            ) then null else payment_method_id end,
            updated_at = now()
      where carts.is_active and (
        exists (select 1 from addresses a where a.id = carts.address_id and a.checkout_privacy_session_id = $1)
        or exists (select 1 from addresses b where b.id = carts.billing_address_id and b.checkout_privacy_session_id = $1)
        or exists (
          select 1 from customer_card_retention r
           where r.user_id = carts.user_id
             and r.stripe_payment_method_id = carts.payment_method_id
             and r.checkout_privacy_session_id = $1
        )
      )`,
    [sessionId],
  );
  await client.query(
    `update checkout_privacy_sessions
        set expired_at = coalesce(expired_at, now()), updated_at = now()
      where id = $1`,
    [sessionId],
  );
}

async function createSession(
  client: pg.PoolClient,
  userId: string | null,
): Promise<CheckoutPrivacySession & { token: string }> {
  const id = randomUUID();
  const token = generateOpaqueToken();
  const vaultKey = randomBytes(KEY_BYTES).toString('base64');
  const wrapped = encryptPii(vaultKey);
  if (!wrapped) throw new Error('checkout_privacy_session_key_wrap_failed');
  const expiresAt = new Date(Date.now() + config.checkoutPrivacySessionIdleTtlMs);
  await client.query(
    `insert into checkout_privacy_sessions
       (id, token_hash, user_id, key_ciphertext, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [id, hashOpaqueToken(token), userId, wrapped, expiresAt.toISOString()],
  );
  return { id, token, vaultKey, expiresAt: expiresAt.toISOString() };
}

async function cleanupStaleSessions(client: pg.PoolClient, excludedTokenHash?: string): Promise<void> {
  await client.query(
    `with stale as (
       select id
         from checkout_privacy_sessions
        where expires_at < now() - $1::interval
          and ($2::text is null or token_hash <> $2)
        order by expires_at
        limit $3
     )
     delete from checkout_privacy_sessions s
      using stale
      where s.id = stale.id`,
    [EXPIRED_RETENTION, excludedTokenHash ?? null, CLEANUP_BATCH],
  );
}

/** Resume the presented tab session or atomically replace an expired/mismatched one. */
export async function startCheckoutPrivacySession(
  pool: pg.Pool,
  req: Request,
  userId: string | null,
): Promise<CheckoutPrivacySession & { token: string; resumed: boolean; expired: boolean }> {
  const rawToken = rawTokenFromRequest(req);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await cleanupStaleSessions(client, rawToken ? hashOpaqueToken(rawToken) : undefined);
    let expired = false;
    if (rawToken) {
      const { rows } = await client.query<SessionRow>(
        `select * from checkout_privacy_sessions where token_hash = $1 for update`,
        [hashOpaqueToken(rawToken)],
      );
      const row = rows[0];
      if (row && sameAudience(row, userId)) {
        const isExpired = !!row.expired_at || new Date(row.expires_at).getTime() <= Date.now();
        if (!isExpired) {
          const expiresAt = new Date(Date.now() + config.checkoutPrivacySessionIdleTtlMs);
          await client.query(
            `update checkout_privacy_sessions
                set user_id = coalesce(user_id, $2), last_activity_at = now(), expires_at = $3, updated_at = now()
              where id = $1`,
            [row.id, userId, expiresAt.toISOString()],
          );
          await client.query('commit');
          return {
            id: row.id,
            token: rawToken,
            vaultKey: unwrapKey(row),
            expiresAt: expiresAt.toISOString(),
            resumed: true,
            expired: false,
          };
        }
        expired = true;
        await expireSessionResources(client, row.id);
      }
    }
    const created = await createSession(client, userId);
    await client.query('commit');
    return { ...created, resumed: false, expired };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function requireCheckoutPrivacySession(
  pool: pg.Pool,
  req: Request,
  userId: string | null,
  touch = false,
  allowAuthenticatedBearerWithoutAuth = false,
): Promise<CheckoutPrivacySession> {
  const rawToken = rawTokenFromRequest(req);
  if (!rawToken) throw new CheckoutPrivacySessionError('checkout_session_required');
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<SessionRow>(
      `select * from checkout_privacy_sessions where token_hash = $1 for update`,
      [hashOpaqueToken(rawToken)],
    );
    const row = rows[0];
    if (!row) throw new CheckoutPrivacySessionError('checkout_session_required');
    if (
      !sameAudience(row, userId) &&
      !(allowAuthenticatedBearerWithoutAuth && userId === null && row.user_id !== null)
    ) {
      // Distinct from a genuine idle timeout: the token is still live, it
      // just no longer belongs to this tab's current audience (typically a
      // login/logout boundary — see the "Login upgrades..." comment below).
      // The frontend must not show its "expired after 30 minutes" copy for
      // this — see checkoutPrivacySession.ts on the front for that split.
      throw new CheckoutPrivacySessionError('checkout_session_audience_mismatch');
    }
    if (row.expired_at || new Date(row.expires_at).getTime() <= Date.now()) {
      await expireSessionResources(client, row.id);
      await client.query('commit');
      throw new CheckoutPrivacySessionError('checkout_session_expired');
    }
    let expiresAt = new Date(row.expires_at);
    if (touch) {
      expiresAt = new Date(Date.now() + config.checkoutPrivacySessionIdleTtlMs);
      await client.query(
        `update checkout_privacy_sessions
            set user_id = coalesce(user_id, $2), last_activity_at = now(), expires_at = $3, updated_at = now()
          where id = $1`,
        [row.id, userId, expiresAt.toISOString()],
      );
    } else if (row.user_id === null && userId !== null) {
      // Login upgrades the same guest tab to an account audience even for a
      // read that does not extend the idle deadline. The bearer must never
      // remain usable as a guest after it has crossed that boundary.
      await client.query(
        `update checkout_privacy_sessions
            set user_id = $2, updated_at = now()
          where id = $1`,
        [row.id, userId],
      );
    }
    await client.query('commit');
    return { id: row.id, vaultKey: unwrapKey(row), expiresAt: expiresAt.toISOString() };
  } catch (error) {
    if (!(error instanceof CheckoutPrivacySessionError && error.code === 'checkout_session_expired')) {
      await client.query('rollback');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function registerSessionPaymentMethod(
  pool: pg.Pool,
  sessionId: string,
  paymentMethodId: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select id from checkout_privacy_sessions where id = $1 for update`, [sessionId]);
    const existing = await client.query(
      `select 1 from checkout_privacy_session_payment_methods
        where session_id = $1 and stripe_payment_method_id = $2`,
      [sessionId, paymentMethodId],
    );
    if (existing.rowCount) {
      await client.query('commit');
      return true;
    }
    const count = await client.query<{ count: string }>(
      `select count(*)::text as count
         from checkout_privacy_session_payment_methods
        where session_id = $1`,
      [sessionId],
    );
    if (Number(count.rows[0]?.count ?? 0) >= MAX_SESSION_PAYMENT_METHODS) {
      await client.query('commit');
      return false;
    }
    await client.query(
      `insert into checkout_privacy_session_payment_methods (session_id, stripe_payment_method_id)
       values ($1, $2)`,
      [sessionId, paymentMethodId],
    );
    await client.query('commit');
    return true;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function isSessionPaymentMethod(
  pool: pg.Pool,
  sessionId: string,
  paymentMethodId: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ present: boolean }>(
    `select exists(
       select 1 from checkout_privacy_session_payment_methods
        where session_id = $1 and stripe_payment_method_id = $2
     ) as present`,
    [sessionId, paymentMethodId],
  );
  return rows[0]?.present === true;
}

export function sendCheckoutPrivacySessionError(res: import('express').Response, error: unknown): boolean {
  if (!(error instanceof CheckoutPrivacySessionError)) return false;
  res.status(error.code === 'checkout_session_expired' ? 401 : 409).json({
    success: false,
    error: { code: error.code },
  });
  return true;
}
