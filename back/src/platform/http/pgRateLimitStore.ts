/** Postgres-backed express-rate-limit store shared across API processes. */
import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import { pool } from '../../db/pool.js';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let cleanupTimer: NodeJS.Timeout | null = null;
let cleanupInFlight = false;

function ensureCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    if (cleanupInFlight) return;
    cleanupInFlight = true;
    void pool
      .query(`DELETE FROM rate_limit_buckets WHERE reset_at <= NOW()`)
      .catch(() => undefined)
      .finally(() => {
        cleanupInFlight = false;
      });
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();
}

/**
 * One store instance per rate limiter so `init` can keep that limiter's
 * `windowMs`. All instances share the `rate_limit_buckets` table; each store
 * prefixes keys (express-rate-limit does not) so limiters do not collide.
 */
export function createPgRateLimitStore(prefix: string): Store {
  let windowMs = 60_000;
  ensureCleanupTimer();

  const fullKey = (key: string): string => `${prefix}${key}`;

  return {
    localKeys: false,
    prefix,
    init(options: Options): void {
      windowMs = options.windowMs;
    },
    async get(key: string): Promise<ClientRateLimitInfo | undefined> {
      const { rows } = await pool.query<{ hits: number; reset_at: string }>(
        `SELECT hits, reset_at::text AS reset_at
           FROM rate_limit_buckets
          WHERE key = $1 AND reset_at > NOW()`,
        [fullKey(key)],
      );
      const row = rows[0];
      if (!row) return undefined;
      return { totalHits: row.hits, resetTime: new Date(row.reset_at) };
    },
    async increment(key: string): Promise<ClientRateLimitInfo> {
      const { rows } = await pool.query<{ hits: number; reset_at: string }>(
        `INSERT INTO rate_limit_buckets (key, hits, reset_at)
         VALUES ($1, 1, now() + make_interval(secs => $2::double precision / 1000.0))
         ON CONFLICT (key) DO UPDATE
           SET hits = CASE
                 WHEN rate_limit_buckets.reset_at <= NOW() THEN 1
                 ELSE rate_limit_buckets.hits + 1
               END,
               reset_at = CASE
                 WHEN rate_limit_buckets.reset_at <= NOW()
                   THEN now() + make_interval(secs => $2::double precision / 1000.0)
                 ELSE rate_limit_buckets.reset_at
               END
         RETURNING hits, reset_at::text AS reset_at`,
        [fullKey(key), windowMs],
      );
      const row = rows[0]!;
      return { totalHits: row.hits, resetTime: new Date(row.reset_at) };
    },
    async decrement(key: string): Promise<void> {
      await pool.query(
        `UPDATE rate_limit_buckets
            SET hits = GREATEST(hits - 1, 0)
          WHERE key = $1 AND reset_at > NOW()`,
        [fullKey(key)],
      );
    },
    async resetKey(key: string): Promise<void> {
      await pool.query(`DELETE FROM rate_limit_buckets WHERE key = $1`, [fullKey(key)]);
    },
  };
}
