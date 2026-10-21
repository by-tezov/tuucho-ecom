import type pg from 'pg';
import { config } from '../../../config/env.js';
import { notifyRateLimited } from '../../../platform/http/rateLimitSpy.js';

/** All "is it locked / how long" comparisons happen in SQL (`lockout_until
 * > now()`), never by parsing the driver's returned string into a JS Date —
 * see db/pool.ts's type-parser override for why that round-trip is unsafe
 * here. */
export async function isCurrentlyLocked(pool: pg.Pool, userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ locked: boolean }>(
    `select lockout_until > now() as locked from users where id = $1`,
    [userId],
  );
  return rows[0]?.locked ?? false;
}

/** Increments the failed-attempt counter and, once it reaches the
 * configured max, sets a lockout window — computed as a SQL interval
 * (make_interval) rather than a JS-side now+ms timestamp, for the same
 * raw-string-timestamp reason as isCurrentlyLocked above.
 *
 * Spy mail for `rate_limit_login_lockout` fires only on the transition
 * into a locked window (first trip or re-lock after expiry), not on later
 * 423 retries while already locked. */
export async function recordFailedLogin(pool: pg.Pool, userId: string): Promise<void> {
  const wasLocked = await isCurrentlyLocked(pool, userId);
  const lockoutSeconds = config.login.lockoutDurationMs / 1000;
  const { rows } = await pool.query<{ failed_login_attempts: number; now_locked: boolean }>(
    `update users
     set failed_login_attempts = failed_login_attempts + 1,
         lockout_until = case
           when failed_login_attempts + 1 >= $2 then now() + make_interval(secs => $3)
           else lockout_until
         end
     where id = $1
     returning failed_login_attempts, lockout_until > now() as now_locked`,
    [userId, config.login.maxFailedAttempts, lockoutSeconds],
  );
  const nowLocked = rows[0]?.now_locked ?? false;
  if (!wasLocked && nowLocked) {
    notifyRateLimited({
      kind: 'rate_limit_login_lockout',
      userId,
      path: 'login_lockout',
      method: null,
    });
  }
}

export async function resetFailedLogin(pool: pg.Pool, userId: string): Promise<void> {
  await pool.query(`update users set failed_login_attempts = 0, lockout_until = null where id = $1`, [
    userId,
  ]);
}
