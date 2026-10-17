/** A browser action must fail fast; lengthy retries hide broken flows. */
export const MAX_ACTION_TIMEOUT_MS = 15_000;

export function actionDeadline(): number {
  return Date.now() + MAX_ACTION_TIMEOUT_MS;
}

export function assertActionTimeout(timeoutMs: number, label = 'test action'): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_ACTION_TIMEOUT_MS) {
    throw new Error(`${label} timeout must be between 1ms and ${MAX_ACTION_TIMEOUT_MS}ms (got ${timeoutMs}ms).`);
  }
  return timeoutMs;
}
