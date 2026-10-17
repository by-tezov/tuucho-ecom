import { pool } from '../../../db/pool.js';
import { timingDummyPasswordHash, verifyPassword } from '../../identity/application/password.js';
import { isCurrentlyLocked, recordFailedLogin } from '../../identity/application/loginAttempts.js';
import type { UserRow } from '../../identity/application/users.js';

const INVALID_CREDENTIALS = { success: false, error: { code: 'invalid_credentials' } } as const;

/** Password check shared by /login and /login-or-register, for an existing,
 * non-deleted, non-locked account. Returns the refusal to send, or null when
 * the password is right.
 *
 * While the per-account failed-login window is active every password attempt
 * is refused with the same `401 invalid_credentials` as an unknown email, the
 * right password included: otherwise the window never slows a guesser down
 * (a hit still logged in) and a 423 told anyone the address has an account.
 * The owner keeps OTP and social sign-in as recovery paths, which are not
 * blocked by this window.
 *
 * A password cancelled by cancelPasswordOnInboxProof answers
 * `password_cancelled` only when the cancelled password itself is typed, so
 * the message reaches the person who knew it and nobody else. */
export async function checkAccountPassword(
  user: UserRow,
  password: string,
): Promise<{ status: number; body: object } | null> {
  if (await isCurrentlyLocked(pool, user.id)) {
    await verifyPassword(await timingDummyPasswordHash(), password);
    return { status: 401, body: INVALID_CREDENTIALS };
  }

  if (!user.password_hash) {
    const cancelledMatch = user.cancelled_password_hash
      ? await verifyPassword(user.cancelled_password_hash, password)
      : await verifyPassword(await timingDummyPasswordHash(), password).then(() => false);
    if (cancelledMatch) {
      return {
        status: 401,
        body: {
          success: false,
          error: { code: 'password_cancelled', reason: user.password_cancelled_reason ?? 'social_link' },
        },
      };
    }
    await recordFailedLogin(pool, user.id);
    return { status: 401, body: INVALID_CREDENTIALS };
  }

  if (!(await verifyPassword(user.password_hash, password))) {
    await recordFailedLogin(pool, user.id);
    return { status: 401, body: INVALID_CREDENTIALS };
  }
  return null;
}
