import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { generateOpaqueToken, hashOpaqueToken as hashToken } from '../../../platform/security/opaqueToken.js';

export type UnlockAction =
  'profile' | 'email' | 'password' | 'deletion' | 'google' | 'facebook' | 'apple' | 'social';

/** The account page unlocks Google, Facebook, and Apple together, from one
 * button on the "Connexion sociale" block — so one step-up issues one
 * 'social' token that any provider's link/unlink route accepts.
 * 'google'/'facebook'/'apple' remain valid on their own for a token issued
 * before that block existed (and for the standalone per-provider blocks). */
export function socialUnlockActions(provider: 'google' | 'facebook' | 'apple'): UnlockAction[] {
  return [provider, 'social'];
}

/** A caller may accept more than one action for the same token — see
 * socialUnlockActions. Never widened here: the list is always explicit. */
function asActionList(action: UnlockAction | UnlockAction[]): UnlockAction[] {
  return Array.isArray(action) ? action : [action];
}

export interface IssuedUnlockToken {
  token: string;
  expiresAt: string;
}

/** Step-up re-authentication: a password re-entry (verified by the caller
 * before this is invoked) is exchanged for a short-lived, single-use token
 * scoped to one account-settings action — see consumeUnlockToken below. */
export async function issueUnlockToken(
  pool: pg.Pool,
  userId: string,
  action: UnlockAction,
): Promise<IssuedUnlockToken> {
  const raw = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + config.accountUnlock.tokenTtlMs).toISOString();
  await pool.query(
    `insert into account_unlock_tokens (id, user_id, action, token_hash, expires_at) values ($1, $2, $3, $4, $5)`,
    [randomUUID(), userId, action, hashToken(raw), expiresAt],
  );
  return { token: raw, expiresAt };
}

/** Non-consuming check — used when /account/link-google returns a choice
 * dialog so the unlock token remains valid for /link-google/complete. */
export async function isUnlockTokenValid(
  pool: pg.Pool,
  userId: string,
  action: UnlockAction | UnlockAction[],
  rawToken: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `select id from account_unlock_tokens
     where token_hash = $1 and user_id = $2 and action = any($3::text[]) and used_at is null and expires_at > now()`,
    [hashToken(rawToken), userId, asActionList(action)],
  );
  return rows.length > 0;
}

/** Atomic consume, same race-safe shape as confirmEmailToken — scoped by
 * user_id AND action so a token can never unlock a different section, and
 * never be replayed by (or against) a different user. */
export async function consumeUnlockToken(
  pool: pg.Pool,
  userId: string,
  action: UnlockAction | UnlockAction[],
  rawToken: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `update account_unlock_tokens set used_at = now()
     where token_hash = $1 and user_id = $2 and action = any($3::text[]) and used_at is null and expires_at > now()
     returning id`,
    [hashToken(rawToken), userId, asActionList(action)],
  );
  return rows.length > 0;
}
