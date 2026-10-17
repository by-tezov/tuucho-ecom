import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type pg from 'pg';
import { config } from '../../config/env.js';
import { generateOpaqueToken, hashOpaqueToken as hashToken } from './opaqueToken.js';
import { parseDurationMs } from '../../utils/duration.js';
import { resolveLoginLocation } from '../network/geoLocation.js';
import { recordConnection } from '../../modules/identity/application/users.js';
import { scheduleAuthArtifactMaintenance } from '../../modules/identity/application/authArtifactMaintenance.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  /** Present only when an administrator is acting as another account. */
  impersonatorId?: string;
}

const ACCESS_TOKEN_AUDIENCE = 'tezov-ecommerce-api';
const ACCESS_TOKEN_TYPE = 'access';

/** Short-lived, stateless — never checked against the DB, so it's never
 * individually revocable; that's what the refresh token below is for. A
 * ~15min blast radius after logout / password change / password-reset /
 * deletion is intentional and accepted: refresh tokens are revoked
 * immediately; access JWTs expire with `JWT_ACCESS_TOKEN_TTL` rather than
 * hitting the DB on every request. */
export function signAccessToken(user: AccessTokenPayload): string {
  return jwt.sign(
    {
      email: user.email,
      tokenType: ACCESS_TOKEN_TYPE,
      ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
    },
    config.jwt.secret,
    {
      algorithm: 'HS256',
      issuer: config.apiBaseUrl,
      audience: ACCESS_TOKEN_AUDIENCE,
      subject: user.sub,
      expiresIn: config.jwt.accessTokenTtl as jwt.SignOptions['expiresIn'],
    },
  );
}

/** ISO timestamp for the API response body — separate from the JWT's own
 * internal `exp` claim, which jsonwebtoken derives from the same
 * accessTokenTtl string independently. Falls back to a 15-minute default in
 * the (should-never-happen) case the configured TTL string doesn't parse,
 * since env.ts's requiredDurationMs would already have thrown at startup
 * for a genuinely malformed value. */
export function accessTokenExpiresAt(): string {
  const ttlMs = parseDurationMs(config.jwt.accessTokenTtl) ?? 15 * 60_000;
  return new Date(Date.now() + ttlMs).toISOString();
}

export function verifyAccessToken(token: string): AccessTokenPayload | undefined {
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
      issuer: config.apiBaseUrl,
      audience: ACCESS_TOKEN_AUDIENCE,
    });
    if (
      typeof decoded === 'string' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.email !== 'string' ||
      decoded.tokenType !== ACCESS_TOKEN_TYPE ||
      (decoded.impersonatorId !== undefined && typeof decoded.impersonatorId !== 'string')
    )
      return undefined;
    return {
      sub: decoded.sub,
      email: decoded.email,
      ...(decoded.impersonatorId ? { impersonatorId: decoded.impersonatorId } : {}),
    };
  } catch {
    return undefined;
  }
}

export interface RefreshTokenMeta {
  ip: string | undefined;
  userAgent: string | undefined;
}

export interface IssuedRefreshToken {
  raw: string;
  expiresAt: string;
  /** Always null at issue time: geo-IP is written async onto the row.
   * Spy emails resolve location themselves after the login response. */
  location: string | null;
}

function ttlMsFor(rememberMe: boolean): number {
  return rememberMe ? config.refreshToken.ttlRememberMs : config.refreshToken.ttlSessionMs;
}

/** Starts a brand new rotation family — called at register/login. The raw
 * token is what goes in the httpOnly cookie; only its sha256 hash is ever
 * persisted, same spirit as a password hash. Geo-IP for login_location is
 * filled asynchronously after insert so the login response is not blocked
 * on the lookup; listRecentLogins may briefly show a null location until
 * the update lands. */
export async function createRefreshToken(
  pool: pg.Pool,
  userId: string,
  rememberMe: boolean,
  meta: RefreshTokenMeta,
): Promise<IssuedRefreshToken> {
  const raw = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + ttlMsFor(rememberMe)).toISOString();
  const tokenId = randomUUID();
  await pool.query(
    `insert into refresh_tokens (id, user_id, token_hash, family_id, remember_me, expires_at, created_by_ip, user_agent, login_location)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      tokenId,
      userId,
      hashToken(raw),
      randomUUID(),
      rememberMe,
      expiresAt,
      meta.ip ?? null,
      meta.userAgent ?? null,
      null,
    ],
  );
  void resolveLoginLocation(meta.ip)
    .then(async (location) => {
      if (!location) return;
      await pool.query(`update refresh_tokens set login_location = $2 where id = $1`, [tokenId, location]);
    })
    .catch((error) => {
      console.error('[auth] login location lookup failed', error);
    });
  await recordConnection(pool, userId);
  scheduleAuthArtifactMaintenance(pool);
  return { raw, expiresAt, location: null };
}

export type RotateResult =
  // previousIssuedAt: when the presented token was issued (last session activity).
  | { status: 'ok'; raw: string; expiresAt: string; rememberMe: boolean; userId: string; previousIssuedAt: string }
  | { status: 'invalid' }
  | { status: 'reused'; userId: string };

interface RefreshTokenRow {
  id: string;
  user_id: string;
  family_id: string;
  remember_me: boolean;
  unexpired: boolean;
  revoked_at: string | null;
  created_at: string;
}

/** Verifies + rotates a presented refresh token in one step (called from
 * both /auth/refresh and the start of /auth/login's "already have a valid
 * session" path isn't a thing — this is refresh-only). A hash that matches
 * an already-revoked row means the token was already rotated once before
 * and is being replayed — that's the signal an attacker has a copy, so the
 * whole family gets killed rather than just this one token. */
export async function rotateRefreshToken(
  pool: pg.Pool,
  presentedRawToken: string,
  meta: RefreshTokenMeta,
): Promise<RotateResult> {
  const presentedHash = hashToken(presentedRawToken);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<RefreshTokenRow>(
      `select id, user_id, family_id, remember_me, expires_at > now() as unexpired, revoked_at, created_at
       from refresh_tokens where token_hash = $1 for update`,
      [presentedHash],
    );
    const row = rows[0];
    if (!row) {
      await client.query('commit');
      return { status: 'invalid' };
    }

    if (row.revoked_at !== null) {
      await client.query(
        `update refresh_tokens set revoked_at = now() where family_id = $1 and revoked_at is null`,
        [row.family_id],
      );
      await client.query('commit');
      return { status: 'reused', userId: row.user_id };
    }

    if (!row.unexpired) {
      await client.query('commit');
      return { status: 'invalid' };
    }

    const raw = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + ttlMsFor(row.remember_me)).toISOString();
    const newId = randomUUID();
    await client.query(
      `insert into refresh_tokens (id, user_id, token_hash, family_id, remember_me, expires_at, created_by_ip, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        newId,
        row.user_id,
        hashToken(raw),
        row.family_id,
        row.remember_me,
        expiresAt,
        meta.ip ?? null,
        meta.userAgent ?? null,
      ],
    );
    await client.query(`update refresh_tokens set revoked_at = now(), replaced_by = $1 where id = $2`, [
      newId,
      row.id,
    ]);
    await recordConnection(client, row.user_id);
    await client.query('commit');

    const previousIssuedAt = new Date(row.created_at).toISOString();
    return { status: 'ok', raw, expiresAt, rememberMe: row.remember_me, userId: row.user_id, previousIssuedAt };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeRefreshToken(pool: pg.Pool, rawToken: string): Promise<void> {
  await pool.query(
    `update refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null`,
    [hashToken(rawToken)],
  );
}

/** Called on password reset/change and account-deletion request — kills
 * every session for this user, not just the one making the request. */
export async function revokeAllUserRefreshTokens(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
): Promise<void> {
  await pool.query(`update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null`, [
    userId,
  ]);
}

export interface RecentLogin {
  createdAt: string;
  ip: string | null;
  location: string | null;
  userAgent: string | null;
}

/** Account page's "recent logins" block. Every /auth/refresh rotation
 * inserts a new row in the same family_id chain (see rotateRefreshToken
 * above) — surfacing those would flood this list with routine background
 * token refreshes, not actual sign-ins. Instead this takes only each
 * family's earliest row (the one createRefreshToken made at register/
 * login): a row's id never appears as another row's replaced_by unless it
 * was itself replaced by a rotation, so "never someone else's replaced_by
 * target" identifies the genesis row of each family. limit <= 0 (see
 * RECENT_LOGINS_DISPLAY_COUNT) just returns nothing — the frontend hides
 * the block entirely on an empty list. */
export async function listRecentLogins(pool: pg.Pool, userId: string, limit: number): Promise<RecentLogin[]> {
  if (limit <= 0) return [];
  const { rows } = await pool.query<{
    created_at: string;
    created_by_ip: string | null;
    user_agent: string | null;
    login_location: string | null;
  }>(
    `select created_at, created_by_ip, user_agent, login_location
     from refresh_tokens
     where user_id = $1
       and id not in (select replaced_by from refresh_tokens where replaced_by is not null)
     order by created_at desc
     limit $2`,
    [userId, limit],
  );
  return rows.map((row) => ({
    createdAt: row.created_at,
    ip: row.created_by_ip,
    location: row.login_location,
    userAgent: row.user_agent,
  }));
}
