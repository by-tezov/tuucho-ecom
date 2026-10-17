import { createHmac, randomInt, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { generateOpaqueToken, hashOpaqueToken as hashToken } from '../../../platform/security/opaqueToken.js';
import { recordIdentityEvent } from './identityHistory.js';
import { decryptPii, emailLookupHash, encryptPii } from '../../../platform/security/piiCrypto.js';
import { scheduleAuthArtifactMaintenance } from './authArtifactMaintenance.js';
import { notifySendVolume } from '../../../platform/http/rateLimitSpy.js';

function hashOtp(code: string): string {
  return createHmac('sha256', Buffer.from(config.pii.lookupPepper, 'base64'))
    .update(`email-confirmation:${code.trim()}`)
    .digest('hex');
}

/** Cryptographically random 6-digit code (000000–999999), zero-padded. */
function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export interface IssuedEmailConfirmation {
  rawToken: string;
  otp: string;
}

/** Issues a token + OTP for a specific email address — registration
 * confirmation and a later email-change confirmation both go through this,
 * distinguished only by which address is passed in (see confirmEmailToken).
 * `ttlMs` defaults to the registration-confirmation TTL; email-change
 * callers pass config.emailChangeConfirmation.tokenTtlMs instead.
 * Older unused tokens for the same user are marked used so only the latest
 * link/OTP works. */
export async function issueEmailConfirmationToken(
  pool: pg.Pool,
  userId: string,
  email: string,
  ttlMs: number = config.emailConfirmation.tokenTtlMs,
): Promise<IssuedEmailConfirmation> {
  const rawToken = generateOpaqueToken();
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Serialize issuance for one account. Without the user-row lock, two
    // concurrent resend requests can both supersede the old token and then
    // insert two new live tokens.
    await client.query(`select id from users where id = $1 for update`, [userId]);
    await client.query(
      `update email_confirmation_tokens set used_at = now()
       where user_id = $1 and used_at is null`,
      [userId],
    );
    await client.query(
      `insert into email_confirmation_tokens
         (id, user_id, email, email_lookup, token_hash, otp_hash, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        userId,
        encryptPii(email),
        emailLookupHash(email),
        hashToken(rawToken),
        hashOtp(otp),
        expiresAt,
      ],
    );
    await client.query('commit');
    scheduleAuthArtifactMaintenance(pool);
    return { rawToken, otp };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type ConfirmEmailResult =
  | { status: 'verified'; userId: string }
  | { status: 'emailChanged'; userId: string; newEmail: string }
  | { status: 'alreadyVerified'; userId: string }
  | { status: 'invalid' };

interface TokenRow {
  user_id: string;
  email: string;
  failed_attempts: number;
}

interface UserEmailRow {
  email: string;
  pending_email: string | null;
  pending_email_lookup: string | null;
  email_verified_at: string | null;
}

function decryptTokenEmail(row: TokenRow): TokenRow {
  return { ...row, email: decryptPii(row.email)! };
}

function decryptUserEmails(row: UserEmailRow): {
  email: string;
  pending_email: string | null;
  pending_email_lookup: string | null;
  email_verified_at: string | null;
} {
  return {
    email: decryptPii(row.email)!,
    pending_email: decryptPii(row.pending_email),
    pending_email_lookup: row.pending_email_lookup,
    email_verified_at: row.email_verified_at,
  };
}

async function lockUserEmails(client: pg.PoolClient, userId: string) {
  const { rows } = await client.query<UserEmailRow>(
    `select email, pending_email, pending_email_lookup, email_verified_at
     from users where id = $1 for update`,
    [userId],
  );
  return rows[0] ? decryptUserEmails(rows[0]) : undefined;
}

/** Apply the account mutation in the same transaction that consumes the
 * token. This prevents a token from being burned while a concurrent pending
 * email change is swapped underneath it. */
async function applyFreshToken(client: pg.PoolClient, freshToken: TokenRow): Promise<ConfirmEmailResult> {
  const user = await lockUserEmails(client, freshToken.user_id);
  if (!user) return { status: 'invalid' };

  if (freshToken.email === user.email) {
    await client.query(
      `update users set email_verified_at = now(), updated_at = now() where id = $1 and email_verified_at is null`,
      [freshToken.user_id],
    );
    return { status: 'verified', userId: freshToken.user_id };
  }

  if (user.pending_email && freshToken.email === user.pending_email) {
    await client.query(
      `update users
       set email = pending_email,
           email_lookup = pending_email_lookup,
           pending_email = null,
           pending_email_lookup = null,
           email_verified_at = now(),
           updated_at = now()
       where id = $1`,
      [freshToken.user_id],
    );
    await recordIdentityEvent(client, {
      userId: freshToken.user_id,
      kind: 'email_changed',
      email: freshToken.email,
      previousEmail: user.email,
    });
    return { status: 'emailChanged', userId: freshToken.user_id, newEmail: freshToken.email };
  }

  return { status: 'invalid' };
}

/** A used credential is replay-only. It may explain that the same current
 * address is already verified, but it must never apply a pending change or
 * mutate the user: `used_at` also marks superseded and attempt-burned rows. */
async function applyUsedToken(client: pg.PoolClient, usedToken: TokenRow): Promise<ConfirmEmailResult> {
  if (usedToken.failed_attempts >= config.emailConfirmation.maxAttempts) {
    return { status: 'invalid' };
  }
  const user = await lockUserEmails(client, usedToken.user_id);
  if (!user) return { status: 'invalid' };

  if (usedToken.email === user.email && user.email_verified_at) {
    return { status: 'alreadyVerified', userId: usedToken.user_id };
  }
  return { status: 'invalid' };
}

/** If the token's email matches the user's current `email`, this is the
 * original registration confirmation. If it matches `pending_email`
 * instead, this completes an in-progress email change. Anything else (e.g.
 * the user changed their pending email again since this token was issued)
 * is treated as stale/invalid rather than silently applied.
 *
 * A re-click of an already-used link returns `alreadyVerified` (not
 * `invalid`) so the UI can tell first confirmation apart from a later
 * revisit — email clients/security scanners commonly prefetch a link, and
 * React StrictMode double-invokes the confirm effect in dev; the front
 * dedupes in-flight requests so those near-simultaneous pairs still see the
 * first `verified`/`emailChanged` response. */
export async function confirmEmailToken(pool: pg.Pool, rawToken: string): Promise<ConfirmEmailResult> {
  const hash = hashToken(rawToken);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<TokenRow>(
      `update email_confirmation_tokens set used_at = now()
       where token_hash = $1 and used_at is null and expires_at > now()
         and failed_attempts < $2
       returning user_id, email, failed_attempts`,
      [hash, config.emailConfirmation.maxAttempts],
    );
    const freshToken = rows[0] ? decryptTokenEmail(rows[0]) : undefined;
    const result = freshToken
      ? await applyFreshToken(client, freshToken)
      : await usedTokenResult(client, `token_hash = $1`, [hash]);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function usedTokenResult(
  client: pg.PoolClient,
  predicate: string,
  values: unknown[],
): Promise<ConfirmEmailResult> {
  const { rows } = await client.query<TokenRow>(
    `select user_id, email, failed_attempts
     from email_confirmation_tokens
     where ${predicate} and used_at is not null and expires_at > now()
     order by used_at desc
     limit 1`,
    values,
  );
  const usedToken = rows[0] ? decryptTokenEmail(rows[0]) : undefined;
  return usedToken ? applyUsedToken(client, usedToken) : { status: 'invalid' };
}

/** Confirm via 6-digit OTP + email (blind-index lookup). Same outcome
 * semantics as confirmEmailToken. */
export async function confirmEmailOtp(
  pool: pg.Pool,
  email: string,
  code: string,
): Promise<ConfirmEmailResult> {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return { status: 'invalid' };

  const lookup = emailLookupHash(email);
  const otpHash = hashOtp(normalized);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<TokenRow>(
      `update email_confirmation_tokens set used_at = now()
       where email_lookup = $1 and otp_hash = $2 and used_at is null and expires_at > now()
         and failed_attempts < $3
       returning user_id, email, failed_attempts`,
      [lookup, otpHash, config.emailConfirmation.maxAttempts],
    );
    const freshToken = rows[0] ? decryptTokenEmail(rows[0]) : undefined;
    if (freshToken) {
      const result = await applyFreshToken(client, freshToken);
      await client.query('commit');
      return result;
    }

    const replay = await usedTokenResult(client, `email_lookup = $1 and otp_hash = $2`, [lookup, otpHash]);
    if (replay.status === 'alreadyVerified') {
      await client.query('commit');
      return replay;
    }
    await incrementFailedAttempts(client, `email_lookup = $1`, [lookup]);
    await client.query('commit');
    return { status: 'invalid' };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function incrementFailedAttempts(
  client: pg.PoolClient,
  predicate: string,
  values: unknown[],
): Promise<void> {
  const maxParameter = values.length + 1;
  await client.query(
    `update email_confirmation_tokens
     set failed_attempts = failed_attempts + 1,
         used_at = case when failed_attempts + 1 >= $${maxParameter} then now() else used_at end
     where ${predicate} and used_at is null and expires_at > now()
       and failed_attempts < $${maxParameter}`,
    [...values, config.emailConfirmation.maxAttempts],
  );
}

/** Confirm via an emailed OTP-page token + 6-digit OTP. The token identifies
 * the address without exposing it in the URL, while the OTP remains required
 * to complete confirmation. */
export async function confirmEmailOtpToken(
  pool: pg.Pool,
  rawToken: string,
  code: string,
): Promise<ConfirmEmailResult> {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return { status: 'invalid' };

  const tokenHash = hashToken(rawToken);
  const otpHash = hashOtp(normalized);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<TokenRow>(
      `update email_confirmation_tokens set used_at = now()
       where token_hash = $1 and otp_hash = $2 and used_at is null and expires_at > now()
         and failed_attempts < $3
       returning user_id, email, failed_attempts`,
      [tokenHash, otpHash, config.emailConfirmation.maxAttempts],
    );
    const freshToken = rows[0] ? decryptTokenEmail(rows[0]) : undefined;
    if (freshToken) {
      const result = await applyFreshToken(client, freshToken);
      await client.query('commit');
      return result;
    }

    const replay = await usedTokenResult(client, `token_hash = $1 and otp_hash = $2`, [tokenHash, otpHash]);
    if (replay.status === 'alreadyVerified') {
      await client.query('commit');
      return replay;
    }
    await incrementFailedAttempts(client, `token_hash = $1`, [tokenHash]);
    await client.query('commit');
    return { status: 'invalid' };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Log-per-send (email_confirmation_sends), not a counter — checks the gap
 * since the last row instead of maintaining a counter+reset. */
export async function checkResendLimit(pool: pg.Pool, userId: string): Promise<boolean> {
  if (config.emailConfirmation.disableResendCooldown) return false;
  const { rows } = await pool.query<{ sent_at: string }>(
    `select sent_at from email_confirmation_sends where user_id = $1 order by sent_at desc limit 1`,
    [userId],
  );
  const lastSentAt = rows[0]?.sent_at;
  if (!lastSentAt) return false;
  return Date.now() - new Date(lastSentAt).getTime() < config.emailConfirmation.resendCooldownMs;
}

/** Logs the send and, in the same statement, counts the last 24 hours for
 * this account so `notifySendVolume` can tell the owner when one address is
 * being mailed far past anything a real customer does. The cooldown above
 * only catches a burst; this catches a caller pacing itself around it. */
export async function recordConfirmationSend(pool: pg.Pool, userId: string, email: string): Promise<void> {
  const { rows } = await pool.query<{ sent_today: string }>(
    `with inserted as (
       insert into email_confirmation_sends (id, user_id, email) values ($1, $2, $3)
     )
     select count(*)::text as sent_today
       from email_confirmation_sends
      where user_id = $2 and sent_at > now() - interval '1 day'`,
    [randomUUID(), userId, encryptPii(email)],
  );
  notifySendVolume({
    kind: 'rate_limit_email_confirmation',
    path: 'email_confirmation_send',
    method: null,
    userId,
    userEmail: email,
    sentToday: Number(rows[0]?.sent_today ?? 0) + 1,
  });
}
