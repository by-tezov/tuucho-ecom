import { createHmac, randomInt, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { notifySendVolume } from '../../../platform/http/rateLimitSpy.js';
import { emailLookupHash } from '../../../platform/security/piiCrypto.js';
import type { Language } from '../../../utils/language.js';
import type { UnlockAction } from './accountUnlock.js';
import { scheduleAuthArtifactMaintenance } from './authArtifactMaintenance.js';

/** HMAC-SHA256 with the PII lookup pepper so a leaked otp_hash table is not
 * a 1e6 offline brute of the 6-digit space. Domain-separated from email_lookup. */
function hashOtp(code: string): string {
  return createHmac('sha256', Buffer.from(config.pii.lookupPepper, 'base64'))
    .update(`auth-otp:${code.trim()}`)
    .digest('hex');
}

/** Floor so success and failure take the same minimum wall time — hides the
 * cheap HMAC compare and makes unthrottled guessing tedious. 0 disables. */
export async function waitAuthOtpVerifyDelay(startedAt: number): Promise<void> {
  const remaining = config.authOtp.verifyDelayMs - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

/** Cryptographically random 6-digit code (000000–999999), zero-padded. */
function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export type AuthOtpPurpose = 'signup' | 'login' | 'unlock' | 'social_link';

export type IssueAuthOtpResult = { ok: true; otp: string } | { ok: false };

export interface AuthOtpRow {
  user_id: string | null;
  purpose: AuthOtpPurpose;
  gdpr_consent_version: string | null;
  language: string | null;
  unlock_action: string | null;
}

export interface IssueAuthOtpInput {
  email: string;
  purpose: AuthOtpPurpose;
  userId?: string | null;
  gdprConsentVersion?: string | null;
  language?: Language | null;
  unlockAction?: UnlockAction | null;
}

/** Atomically reserves one identity send, supersedes the previous live code,
 * and issues the replacement. The transaction-scoped advisory lock also
 * covers passwordless signup, where there is no user row available to lock.
 * This prevents concurrent requests from exceeding the rolling send cap or
 * leaving more than one live OTP for the same identity and purpose. */
export async function issueAuthOtp(pool: pg.Pool, input: IssueAuthOtpInput): Promise<IssueAuthOtpResult> {
  const otp = generateOtp();
  const lookup = emailLookupHash(input.email);
  const expiresAt = new Date(Date.now() + config.authOtp.tokenTtlMs).toISOString();
  const unlockAction = input.unlockAction ?? null;
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Two-int lock + hashtext: LWS preprod/prod is Postgres 10, which has
    // no hashtextextended (PG 11+). Same shape as cart.service.ts (87215).
    await client.query(`select pg_advisory_xact_lock(87216, hashtext($1))`, [
      `auth-otp:${lookup}:${input.purpose}`,
    ]);
    const limited = await checkAuthOtpLimit(
      client,
      input.purpose,
      input.userId ? { userId: input.userId } : { emailLookup: lookup },
    );
    if (limited) {
      await client.query('commit');
      return { ok: false };
    }
    await client.query(
      `update auth_otp_tokens set used_at = now()
       where email_lookup = $1 and purpose = $2 and used_at is null
         and ($3::text is null or unlock_action is not distinct from $3)`,
      [lookup, input.purpose, unlockAction],
    );
    await client.query(
      `insert into auth_otp_tokens
         (id, email_lookup, user_id, purpose, otp_hash, gdpr_consent_version, language, unlock_action, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        lookup,
        input.userId ?? null,
        input.purpose,
        hashOtp(otp),
        input.gdprConsentVersion ?? null,
        input.language ?? null,
        unlockAction,
        expiresAt,
      ],
    );
    const { rows: volumeRows } = await client.query<{ sent_today: string }>(
      `with inserted as (
         insert into auth_otp_sends (id, email_lookup, user_id, purpose) values ($1, $2, $3, $4)
       )
       select count(*)::text as sent_today
         from auth_otp_sends
        where purpose = $4
          and sent_at > now() - interval '1 day'
          and ($3::uuid is null and email_lookup = $2 or user_id = $3)`,
      [randomUUID(), lookup, input.userId ?? null, input.purpose],
    );
    await client.query('commit');
    // Counted inside the same statement as the insert, reported after the
    // commit so a spy failure can never roll back an OTP that was sent.
    notifySendVolume({
      kind: 'rate_limit_otp_email',
      path: `auth_otp:${input.purpose}`,
      method: null,
      userId: input.userId ?? null,
      userEmail: input.email,
      sentToday: Number(volumeRows[0]?.sent_today ?? 0) + 1,
    });
    scheduleAuthArtifactMaintenance(pool);
    return { ok: true, otp };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Marks the matching unused, unexpired OTP used in the same query that
 * checks it, so a code can never be raced into being consumed twice. A
 * miss increments `failed_attempts` on the live row and burns it once
 * `AUTH_OTP_MAX_ATTEMPTS` is reached (same cap as login lockout by default). */
export async function consumeAuthOtp(
  pool: pg.Pool,
  email: string,
  code: string,
  purpose: AuthOtpPurpose,
  options?: { userId?: string; unlockAction?: UnlockAction },
): Promise<AuthOtpRow | undefined> {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return undefined;

  const lookup = emailLookupHash(email);
  const otpHash = hashOtp(normalized);
  const maxAttempts = config.authOtp.maxAttempts;
  const userId = options?.userId ?? null;
  const unlockAction = options?.unlockAction ?? null;
  const { rows } = await pool.query<AuthOtpRow>(
    `update auth_otp_tokens set used_at = now()
     where email_lookup = $1 and otp_hash = $2 and purpose = $3
       and used_at is null and expires_at > now()
       and failed_attempts < $6
       and ($4::uuid is null or user_id = $4)
       and ($5::text is null or unlock_action is not distinct from $5)
     returning user_id, purpose, gdpr_consent_version, language, unlock_action`,
    [lookup, otpHash, purpose, userId, unlockAction, maxAttempts],
  );
  if (rows[0]) return rows[0];

  await pool.query(
    `update auth_otp_tokens
     set failed_attempts = failed_attempts + 1,
         used_at = case
           when failed_attempts + 1 >= $5 then now()
           else used_at
         end
     where email_lookup = $1 and purpose = $2
       and used_at is null and expires_at > now()
       and failed_attempts < $5
       and ($3::uuid is null or user_id = $3)
       and ($4::text is null or unlock_action is not distinct from $4)`,
    [lookup, purpose, userId, unlockAction, maxAttempts],
  );
  return undefined;
}

/** Log-per-send (auth_otp_sends), not a counter — same last-sent-at gap
 * shape as emailConfirmation.service.ts's checkResendLimit. Counted per
 * purpose so login OTP usage cannot block an unlock OTP (or signup). */
async function checkAuthOtpLimit(
  pool: pg.Pool | pg.PoolClient,
  purpose: AuthOtpPurpose,
  scope: { userId: string } | { emailLookup: string },
): Promise<boolean> {
  if (config.authOtp.disableCooldown) return false;
  const { rows } =
    'userId' in scope
      ? await pool.query<{ sent_at: string }>(
          `select sent_at from auth_otp_sends where user_id = $1 and purpose = $2 order by sent_at desc limit 1`,
          [scope.userId, purpose],
        )
      : await pool.query<{ sent_at: string }>(
          `select sent_at from auth_otp_sends where email_lookup = $1 and purpose = $2 order by sent_at desc limit 1`,
          [scope.emailLookup, purpose],
        );
  const lastSentAt = rows[0]?.sent_at;
  if (!lastSentAt) return false;
  return Date.now() - new Date(lastSentAt).getTime() < config.authOtp.cooldownMs;
}
