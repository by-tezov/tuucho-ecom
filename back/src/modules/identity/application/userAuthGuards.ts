import type pg from 'pg';
import { decryptPii } from '../../../platform/security/piiCrypto.js';
import type { UserRow } from './users.js';

export type PasswordCancelledReason = NonNullable<UserRow['password_cancelled_reason']>;

/** Sets a new password; any cancelled one (cancelPasswordOnInboxProof) is
 * forgotten with it. */
export async function updatePasswordHash(pool: pg.Pool, userId: string, passwordHash: string): Promise<void> {
  await pool.query(
    `update users set password_hash = $2, cancelled_password_hash = null, password_cancelled_at = null,
       password_cancelled_reason = null, updated_at = now() where id = $1`,
    [userId, passwordHash],
  );
}

/** Account pre-hijacking guard. Anyone can register an email+password account
 * for an address they do not own; the first time that account is claimed
 * through a path that proves inbox control (first social link from the sign-in
 * screen, or an OTP / manage-order sign-in while the email was never
 * verified), the password set by an unknown party is dropped and every
 * existing session is revoked. The old hash is kept only so a later password
 * login with it gets `password_cancelled` instead of `invalid_credentials`.
 * Returns the row as it now stands (unchanged when nothing was cancelled). */
export async function cancelPasswordOnInboxProof(
  db: pg.Pool | pg.PoolClient,
  user: UserRow,
  reason: PasswordCancelledReason,
): Promise<UserRow> {
  if (user.password_hash == null) return user;
  if (reason === 'email_verification' && user.email_verified_at != null) return user;
  const { rowCount } = await db.query(
    `update users
     set cancelled_password_hash = password_hash,
         password_hash = null,
         password_cancelled_at = now(),
         password_cancelled_reason = $2,
         updated_at = now()
     where id = $1 and password_hash is not null`,
    [user.id, reason],
  );
  if (!rowCount) return user;
  // Inline rather than token.ts's revokeAllUserRefreshTokens: token.ts already
  // imports this module.
  await db.query(`update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null`, [
    user.id,
  ]);
  return {
    ...user,
    password_hash: null,
    cancelled_password_hash: user.password_hash,
    password_cancelled_reason: reason,
  };
}

/** The four columns request authentication needs, with only the email
 * decrypted: runs on every authenticated request, where findUserById's
 * `select *` decrypted eight PII fields nobody read. */
export async function findAuthUserById(
  pool: pg.Pool | pg.PoolClient,
  id: string,
): Promise<Pick<UserRow, 'id' | 'email' | 'role' | 'status'> | undefined> {
  const { rows } = await pool.query<Pick<UserRow, 'id' | 'email' | 'role' | 'status'>>(
    `select id, email, role, status from users where id = $1`,
    [id],
  );
  const row = rows[0];
  return row ? { ...row, email: decryptPii(row.email)! } : undefined;
}
