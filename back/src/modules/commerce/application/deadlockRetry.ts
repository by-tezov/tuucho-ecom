/**
 * Retries a transaction that Postgres aborted as a deadlock victim.
 *
 * Checkout reservations lock the buyer, then vouchers, then stock. Two
 * customers reserving overlapping stock at the same moment can be ordered
 * differently by Postgres and one is chosen as the victim (SQLSTATE 40P01).
 * That is an expected outcome under concurrency, not a failure: the losing
 * transaction rolled back cleanly and simply has to run again.
 *
 * Only 40P01 is retried. Any other error is a real failure and is rethrown
 * immediately, because retrying it would repeat whatever went wrong.
 *
 * The attempt limit is small on purpose: a genuine lock-ordering bug would
 * deadlock every time, and retrying it forever would hide that behind latency
 * instead of surfacing it.
 */
const DEADLOCK_DETECTED = '40P01';
const DEFAULT_MAX_ATTEMPTS = 3;

export function isDeadlock(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === DEADLOCK_DETECTED;
}

export async function withDeadlockRetry<T>(
  run: () => Promise<T>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isDeadlock(error) || attempt === maxAttempts) throw error;
    }
  }
  // Unreachable: the loop either returns or throws on its final attempt.
  throw new Error('withDeadlockRetry: exhausted without result');
}
