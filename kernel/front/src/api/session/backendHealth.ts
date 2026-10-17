import { shopConfig } from '../../config/env';

export type BackendStatus = 'up' | 'down';

const CHECK_TIMEOUT_MS = 5_000;
/** Only while `down` — probe until /healthz recovers, then stop. Idle `up`
 * browsing never uses this timer. */
const RECOVERY_POLL_MS = 15_000;
/** A single failed probe is more often shared-hosting jitter (a slow
 * request, a cold Passenger start) than the backend actually being gone —
 * the backend's own healthz-monitor cron (CRON.md) waits for 3 consecutive
 * misses before it even considers restarting anything. Require the same
 * before telling the whole site "down". */
const MAX_ATTEMPTS = 3;
/** Randomized so retries don't land in lockstep with whatever caused the
 * first miss (e.g. several tabs/requests probing at once). */
const RETRY_DELAY_MIN_MS = 500;
const RETRY_DELAY_MAX_MS = 1_500;

let status: BackendStatus = 'up';
const listeners = new Set<(next: BackendStatus) => void>();
let inFlight: Promise<BackendStatus> | null = null;
let recoveryTimer: number | null = null;

function stopRecoveryPoll(): void {
  if (recoveryTimer === null) return;
  window.clearInterval(recoveryTimer);
  recoveryTimer = null;
}

function startRecoveryPoll(): void {
  if (recoveryTimer !== null) return;
  recoveryTimer = window.setInterval(() => {
    void checkBackendHealth();
  }, RECOVERY_POLL_MS);
}

function publish(next: BackendStatus): void {
  if (next === status) return;
  status = next;
  if (next === 'down') startRecoveryPoll();
  else stopRecoveryPoll();
  for (const listener of listeners) listener(status);
}

export function getBackendStatus(): BackendStatus {
  return status;
}

export function subscribeBackendStatus(listener: (next: BackendStatus) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randomRetryDelay(): number {
  return RETRY_DELAY_MIN_MS + Math.random() * (RETRY_DELAY_MAX_MS - RETRY_DELAY_MIN_MS);
}

async function probeOnce(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(`${shopConfig.apiBaseUrl}/healthz`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Probe GET /healthz (no DB/auth) and publish up/down. Coalesces concurrent
 * callers onto one in-flight probe. Used on route changes, to confirm a
 * suspicious API failure, and on the recovery timer while already down.
 * Uses raw fetch (not apiFetch) to avoid recursion. Retries up to
 * MAX_ATTEMPTS times with a randomized delay before publishing 'down' — see
 * MAX_ATTEMPTS's comment. Any attempt succeeding publishes 'up' immediately. */
export function checkBackendHealth(): Promise<BackendStatus> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (await probeOnce()) {
          publish('up');
          return 'up';
        }
        if (attempt < MAX_ATTEMPTS) await sleep(randomRetryDelay());
      }
      publish('down');
      return 'down';
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** True for failures that often mean the process/proxy is gone, not a
 * normal validation/auth error. */
export function isSuspiciousBackendHttpStatus(statusCode: number): boolean {
  return statusCode >= 500 || statusCode === 0;
}
