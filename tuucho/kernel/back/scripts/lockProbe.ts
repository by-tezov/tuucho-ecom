/** Network lock stress probe — storms cache-busted front images and/or
 * GET /operation/lock-probe with concurrency controls, dual-stack probes,
 * and a metrics report under <outputDir>/test/lock/<stamp>/.
 *
 * Invoked via: npm run test -- lock [--image] [--api] ... --dev|--preprod|--prod
 * Optional queue on top of --concurrency: npm run test -- lock --queue 15 --preprod
 * Optional pacing on top of --queue: npm run test -- lock --queue 15 --pace "each:150 between:250" --preprod
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import type { Mode } from './envFile.js';
import { loadOpsToken, loadPublicEnv } from './envFile.js';
import { log } from './cliOutput.js';
import { outputRoot } from '../src/config/shopPaths.js';

const execFileAsync = promisify(execFile);

function lockLog(...args: unknown[]): void {
  log(false, ...args);
}

export type LockProbeArgs = {
  root: string;
  mode: Mode;
  image: boolean;
  api: boolean;
  concurrency: number;
  total: number;
  bytes: number;
  durationSec: number;
  rampSec: number;
  /** Caps actual in-flight network requests via a queue layered on top of
   * --concurrency/--ramp — a request only counts against this cap once it
   * starts, and freeing a slot (success or failure) admits the next queued
   * one, same semantics as kernel/front's galleryImageGate.ts. Lets
   * --concurrency model "arrival" pressure (e.g. many cards mounting at
   * once) while this models the shipped front-end fix's actual outbound
   * cap. undefined/omitted = disabled (today's behaviour: --concurrency
   * alone governs actual network concurrency). */
  queueLimit?: number;
  /** Paces requests on top of --queue/--concurrency — see parseThrottle's
   * doc comment for exact semantics. undefined/omitted = no extra pacing
   * (today's behaviour: launch as fast as --concurrency/--queue allow). */
  throttle?: ThrottleOpts;
  /** Override env URL_FRONTEND_BASE (isolated --dev stack). */
  frontBaseUrl?: string;
  /** Override env URL_API_BASE (isolated --dev stack). */
  apiBaseUrl?: string;
};

export type ThrottleOpts = {
  /** Minimum ms between launching one request and the next — paces the raw
   * launch rate regardless of --queue/--concurrency. */
  eachMs?: number;
  /** After every `packetSize` requests are launched, pause this many ms
   * before launching any more — models a real client sending bursts with
   * rest between them, not a steady drip. Gated on launches, not settles:
   * a queue/concurrency slot freeing mid-pause must not refill early, or
   * packet boundaries blur. Requires --queue, since `packetSize` is that
   * queue's cap (see parseThrottle). */
  betweenMs?: number;
  packetSize?: number;
};

/** Parses `--pace "each:150 between:250"` — space-separated `key:value`
 * tokens, `each` and/or `between`, values non-negative integer ms. Mirrors
 * the CLI spec: `each` throttles between every individual request sent;
 * `between` throttles between each packet of `--queue`-many requests (so
 * `between` requires `--queue` — there's no packet size without it). */
export function parseThrottle(raw: string): { eachMs?: number; betweenMs?: number } {
  const result: { eachMs?: number; betweenMs?: number } = {};
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    throw new Error('--pace requires at least one of "each:<ms>" or "between:<ms>".');
  }
  for (const token of tokens) {
    const [key, value] = token.split(':');
    if (key !== 'each' && key !== 'between') {
      throw new Error(`--pace: unknown key "${key}" (expected "each" or "between").`);
    }
    const ms = Number(value);
    if (!Number.isInteger(ms) || ms < 0) {
      throw new Error(`--pace: "${key}" requires a non-negative integer ms, got "${value}".`);
    }
    if (key === 'each') result.eachMs = ms;
    else result.betweenMs = ms;
  }
  return result;
}

type RequestQueue = {
  run: <T>(fn: () => Promise<T>) => Promise<T>;
  peakActive: () => number;
};

/** Same acquire/release-on-settle shape as kernel/front's
 * galleryImageGate.ts, minus AbortSignal support (nothing here cancels a
 * queued attempt early). Tracks `peakActive` so a report can state plainly
 * whether the cap actually held, instead of inferring it from timing. */
function createRequestQueue(max: number): RequestQueue {
  let active = 0;
  let peak = 0;
  const waiters: Array<() => void> = [];

  function pump(): void {
    while (active < max && waiters.length > 0) {
      active += 1;
      peak = Math.max(peak, active);
      const next = waiters.shift()!;
      next();
    }
  }

  function acquire(): Promise<void> {
    return new Promise((resolve) => {
      waiters.push(resolve);
      pump();
    });
  }

  function release(): void {
    active = Math.max(0, active - 1);
    pump();
  }

  return {
    run: async (fn) => {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
    peakActive: () => peak,
  };
}

type ProbeFamily = 4 | 6;

type CurlProbeResult = {
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
  skipped?: boolean;
};

type DualStackSample = {
  atMs: number;
  front4: CurlProbeResult;
  front6: CurlProbeResult;
  api4: CurlProbeResult;
  api6: CurlProbeResult;
};

type RequestRecord = {
  phase: 'image' | 'api';
  index: number;
  ok: boolean;
  status: number | null;
  ms: number;
  bytes: number;
  concurrency: number;
  error?: string;
};

type PhaseSummary = {
  phase: 'image' | 'api';
  attempted: number;
  success: number;
  fail: number;
  bytesTransferred: number;
  statusHistogram: Record<string, number>;
  latencyMs: {
    min: number | null;
    avg: number | null;
    max: number | null;
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
  firstFailAtMs: number | null;
  firstFailConcurrency: number | null;
  elapsedMs: number;
  stoppedReason: string;
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

function summarizeLatencies(msList: number[]): PhaseSummary['latencyMs'] {
  const sorted = [...msList].sort((a, b) => a - b);
  const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null;
  return {
    min: sorted.length ? sorted[0]! : null,
    avg: avg === null ? null : Math.round(avg * 100) / 100,
    max: sorted.length ? sorted[sorted.length - 1]! : null,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

async function curlProbe(url: string, family: ProbeFamily, timeoutSec = 5): Promise<CurlProbeResult> {
  const started = Date.now();
  try {
    const { stdout } = await execFileAsync(
      'curl',
      [
        `-${family}`,
        '-sS',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        '--connect-timeout',
        String(timeoutSec),
        '--max-time',
        String(timeoutSec),
        url,
      ],
      { timeout: (timeoutSec + 2) * 1000 },
    );
    const status = Number(stdout.trim());
    const ms = Date.now() - started;
    if (!Number.isInteger(status) || status === 0) {
      return { ok: false, status: null, ms, error: `bad status token: ${stdout.trim()}` };
    }
    return { ok: status >= 200 && status < 400, status, ms };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: null, ms: Date.now() - started, error: message.split('\n')[0] };
  }
}

async function fetchPublicIp(family: ProbeFamily): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'curl',
      [`-${family}`, '-sS', '--max-time', '5', 'https://api.ipify.org'],
      { timeout: 8_000 },
    );
    const ip = stdout.trim();
    return ip || null;
  } catch {
    return null;
  }
}

function stampNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

type StormOpts = {
  phase: 'image' | 'api';
  buildUrl: (index: number) => string;
  headers?: Record<string, string>;
  concurrency: number;
  total: number;
  durationSec: number;
  rampSec: number;
  shouldStop: () => boolean;
  onRecord: (rec: RequestRecord) => void;
  /** When set, caps actual in-flight network requests independent of
   * `concurrency`/ramp — see LockProbeArgs.queueLimit. */
  queue?: RequestQueue;
  /** See LockProbeArgs.throttle / parseThrottle. `packetSize` here is
   * resolved from `queueLimit` by the caller (runLockProbe). */
  throttle?: ThrottleOpts;
};

async function runStorm(opts: StormOpts): Promise<PhaseSummary> {
  const phaseStarted = Date.now();
  let attempted = 0;
  let success = 0;
  let fail = 0;
  let bytesTransferred = 0;
  const statusHistogram: Record<string, number> = {};
  const latencies: number[] = [];
  let firstFailAtMs: number | null = null;
  let firstFailConcurrency: number | null = null;
  let stoppedReason = 'completed';
  let currentConcurrency = opts.rampSec > 0 ? 1 : opts.concurrency;
  let nextRampAt = phaseStarted + opts.rampSec * 1000;
  let inFlight = 0;
  let nextIndex = 0;
  let stopping = false;
  let lastLaunchAt = 0;
  let launchedSincePacketStart = 0;
  let packetPauseUntil = 0;

  const bumpStatus = (key: string) => {
    statusHistogram[key] = (statusHistogram[key] ?? 0) + 1;
  };

  const deadline = opts.durationSec > 0 ? phaseStarted + opts.durationSec * 1000 : null;

  await new Promise<void>((resolve) => {
    const maybeLaunch = () => {
      if (stopping) {
        if (inFlight === 0) resolve();
        return;
      }
      if (opts.shouldStop()) {
        stopping = true;
        stoppedReason = 'dual_stack_dead';
        if (inFlight === 0) resolve();
        return;
      }
      if (deadline !== null && Date.now() >= deadline) {
        stopping = true;
        stoppedReason = 'duration';
        if (inFlight === 0) resolve();
        return;
      }
      if (nextIndex >= opts.total) {
        stopping = true;
        stoppedReason = 'total';
        if (inFlight === 0) resolve();
        return;
      }

      if (opts.rampSec > 0 && Date.now() >= nextRampAt && currentConcurrency < opts.concurrency) {
        currentConcurrency += 1;
        nextRampAt = Date.now() + opts.rampSec * 1000;
      }

      while (!stopping && inFlight < currentConcurrency && nextIndex < opts.total) {
        if (deadline !== null && Date.now() >= deadline) {
          stopping = true;
          stoppedReason = 'duration';
          break;
        }
        if (opts.shouldStop()) {
          stopping = true;
          stoppedReason = 'dual_stack_dead';
          break;
        }
        const now = Date.now();
        if (opts.throttle?.eachMs && now - lastLaunchAt < opts.throttle.eachMs) {
          break; // next tick (or the next settle) re-checks the gate
        }
        if (opts.throttle?.betweenMs && now < packetPauseUntil) {
          break;
        }
        if (
          opts.throttle?.betweenMs &&
          opts.throttle.packetSize &&
          launchedSincePacketStart >= opts.throttle.packetSize
        ) {
          // Packet is full — arm the pause and stop launching until it
          // elapses, rather than waiting for settles (which, once a slot
          // frees, immediately refill from --concurrency/--queue and would
          // blur packet boundaries before the pause ever got armed).
          packetPauseUntil = now + opts.throttle.betweenMs;
          launchedSincePacketStart = 0;
          break;
        }
        lastLaunchAt = now;
        if (opts.throttle?.betweenMs) launchedSincePacketStart += 1;

        const index = nextIndex++;
        const concurrencyAtStart = currentConcurrency;
        inFlight += 1;
        void (async () => {
          const url = opts.buildUrl(index);
          let ok = false;
          let status: number | null = null;
          let bytes = 0;
          let error: string | undefined;
          const doFetch = async (): Promise<number> => {
            const started = Date.now();
            try {
              const res = await fetch(url, {
                method: 'GET',
                headers: opts.headers,
                cache: 'no-store',
              });
              status = res.status;
              const buf = Buffer.from(await res.arrayBuffer());
              bytes = buf.byteLength;
              ok = res.ok;
              if (!ok) error = `HTTP ${status}`;
            } catch (err) {
              error = err instanceof Error ? err.message : String(err);
            }
            return Date.now() - started;
          };
          // Latency is measured from when the request actually starts (after
          // any queue wait), so queue back-pressure shows up as fewer
          // requests attempted rather than inflating per-request latency.
          const ms = opts.queue ? await opts.queue.run(doFetch) : await doFetch();
          attempted += 1;
          latencies.push(ms);
          bumpStatus(status === null ? 'error' : String(status));
          if (ok) {
            success += 1;
            bytesTransferred += bytes;
          } else {
            fail += 1;
            if (firstFailAtMs === null) {
              firstFailAtMs = Date.now() - phaseStarted;
              firstFailConcurrency = concurrencyAtStart;
            }
          }
          opts.onRecord({
            phase: opts.phase,
            index,
            ok,
            status,
            ms,
            bytes,
            concurrency: concurrencyAtStart,
            error,
          });
          inFlight -= 1;
          maybeLaunch();
        })();
      }

      if (stopping && inFlight === 0) resolve();
      else if (!stopping && inFlight === 0 && nextIndex >= opts.total) {
        stopping = true;
        stoppedReason = 'total';
        resolve();
      }
    };

    maybeLaunch();
    const tickMs = Math.max(10, Math.min(200, opts.throttle?.eachMs ?? 200, opts.throttle?.betweenMs ?? 200));
    const tick = setInterval(() => {
      if (stopping && inFlight === 0) {
        clearInterval(tick);
        return;
      }
      maybeLaunch();
    }, tickMs);
  });

  return {
    phase: opts.phase,
    attempted,
    success,
    fail,
    bytesTransferred,
    statusHistogram,
    latencyMs: summarizeLatencies(latencies),
    firstFailAtMs,
    firstFailConcurrency,
    elapsedMs: Date.now() - phaseStarted,
    stoppedReason,
  };
}

function formatProbe(r: CurlProbeResult): string {
  if (r.skipped) return 'skipped (loopback)';
  if (r.ok) return `ok status=${r.status} ${r.ms}ms`;
  return `FAIL status=${r.status ?? '-'} ${r.ms}ms${r.error ? ` (${r.error})` : ''}`;
}

function isLoopbackBase(base: string): boolean {
  try {
    const host = new URL(base).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

const SKIPPED_PROBE: CurlProbeResult = { ok: false, status: null, ms: 0, skipped: true };

async function waitHttpOk(
  label: string,
  url: string,
  opts?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not reached';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: opts?.headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        // Drain body so keep-alive sockets stay clean under Node fetch.
        await res.arrayBuffer().catch(() => undefined);
        lockLog(`[lock] ready ${label} → ${res.status}`);
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`[lock] timed out waiting for ${label} at ${url} (${lastError})`);
}

/** Confirms server-side that this OPS_TOKEN really reaches the target's probe
 * endpoint before any load is generated — deliberately for --image too, which
 * itself hits a public unauthenticated static file with no check of its own,
 * so nothing else would stop an accidental storm against that asset path.
 * One-shot, not retried like waitHttpOk: a refusal here is a real "no", not a
 * transient not-ready-yet, so it should fail fast with a clear reason instead
 * of burning the usual 120s readiness timeout. */
async function checkLockProbeAuthorized(apiBase: string, opsToken: string): Promise<void> {
  const url = `${apiBase}/operation/lock-probe?bytes=64&nonce=${randomBytes(8).toString('hex')}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${opsToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[lock] could not reach ${url} to confirm server authorization (${message}).`);
  }
  await response.arrayBuffer().catch(() => undefined);
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `[lock] refused by the server (HTTP ${response.status}): the OPS_TOKEN for this target ` +
        'does not authorize /operation/lock-probe. Check the token actually deployed there.',
    );
  }
  if (!response.ok) {
    throw new Error(
      `[lock] unexpected HTTP ${response.status} from ${url} while confirming server authorization.`,
    );
  }
  lockLog(`[lock] server authorization confirmed on ${apiBase}`);
}

async function sampleDualStack(
  frontBase: string,
  apiBase: string,
  startedAt: number,
  dualStack: boolean,
): Promise<DualStackSample> {
  const frontUrl = `${frontBase.replace(/\/$/, '')}/lock-probe.jpg`;
  const apiHealth = `${apiBase.replace(/\/$/, '')}/healthz`;
  if (!dualStack) {
    const [front4, api4] = await Promise.all([curlProbe(frontUrl, 4), curlProbe(apiHealth, 4)]);
    return {
      atMs: Date.now() - startedAt,
      front4,
      front6: SKIPPED_PROBE,
      api4,
      api6: SKIPPED_PROBE,
    };
  }
  const [front4, front6, api4, api6] = await Promise.all([
    curlProbe(frontUrl, 4),
    curlProbe(frontUrl, 6),
    curlProbe(apiHealth, 4),
    curlProbe(apiHealth, 6),
  ]);
  return { atMs: Date.now() - startedAt, front4, front6, api4, api6 };
}

function bothStacksDead(
  sample: DualStackSample,
  needFront: boolean,
  needApi: boolean,
  dualStack: boolean,
): boolean {
  const frontDead = dualStack ? !sample.front4.ok && !sample.front6.ok : !sample.front4.ok;
  const apiDead = dualStack ? !sample.api4.ok && !sample.api6.ok : !sample.api4.ok;
  if (needFront && needApi) return frontDead && apiDead;
  if (needFront) return frontDead;
  return apiDead;
}

export async function runLockProbe(args: LockProbeArgs): Promise<void> {
  const publicEnv = loadPublicEnv(args.root, args.mode);
  const frontBase = (args.frontBaseUrl ?? publicEnv.URL_FRONTEND_BASE ?? '').replace(/\/$/, '');
  const apiBase = (args.apiBaseUrl ?? publicEnv.URL_API_BASE ?? '').replace(/\/$/, '');
  const opsToken = loadOpsToken(args.root, args.mode);

  if (!frontBase) throw new Error(`[lock] URL_FRONTEND_BASE missing for ${args.mode}`);
  if (!apiBase) throw new Error(`[lock] URL_API_BASE missing for ${args.mode}`);
  // Required for both phases — checkLockProbeAuthorized below always runs,
  // not just for --api.
  if (!opsToken) throw new Error(`[lock] OPS_TOKEN missing for ${args.mode}`);

  const runImage = args.image;
  const runApi = args.api;
  if (!runImage && !runApi) {
    throw new Error('[lock] internal: neither image nor api selected');
  }

  const outDir = join(outputRoot(), 'test', 'lock', stampNow());
  mkdirSync(outDir, { recursive: true });
  const ndjsonPath = join(outDir, 'requests.ndjson');
  const timelinePath = join(outDir, 'dualstack.ndjson');

  const queue = args.queueLimit ? createRequestQueue(args.queueLimit) : undefined;
  const throttle: ThrottleOpts | undefined = args.throttle && {
    ...args.throttle,
    packetSize: args.queueLimit,
  };
  const throttleLabel = args.throttle
    ? [
        args.throttle.eachMs !== undefined ? `each:${args.throttle.eachMs}` : null,
        args.throttle.betweenMs !== undefined ? `between:${args.throttle.betweenMs}` : null,
      ]
        .filter(Boolean)
        .join(' ')
    : 'disabled';

  lockLog(`[lock] mode=${args.mode} image=${runImage} api=${runApi}`);
  lockLog(
    `[lock] concurrency=${args.concurrency} total/phase=${args.total} bytes=${args.bytes} durationSec=${args.durationSec} rampSec=${args.rampSec}`,
  );
  lockLog(`[lock] queue=${args.queueLimit ?? 'disabled'} throttle=${throttleLabel}`);
  lockLog(`[lock] front=${frontBase} api=${apiBase}`);
  lockLog(`[lock] report → ${outDir}`);

  const dualStack = !isLoopbackBase(frontBase) && !isLoopbackBase(apiBase);
  if (!dualStack) {
    lockLog('[lock] loopback target — IPv6 probes skipped; waiting until endpoints are ready…');
  } else {
    lockLog('[lock] waiting until endpoints are ready…');
  }

  if (runImage) {
    await waitHttpOk('front /lock-probe.jpg', `${frontBase}/lock-probe.jpg`);
  }
  await waitHttpOk('api /healthz', `${apiBase}/healthz`);
  await checkLockProbeAuthorized(apiBase, opsToken);
  lockLog('[lock] stack ready — starting baseline + storm');

  const [publicV4, publicV6] = await Promise.all([fetchPublicIp(4), fetchPublicIp(6)]);
  lockLog(`[lock] client public IPv4=${publicV4 ?? 'n/a'} IPv6=${publicV6 ?? 'n/a'}`);

  const runStarted = Date.now();
  const baseline = await sampleDualStack(frontBase, apiBase, runStarted, dualStack);
  lockLog(`[lock] baseline front v4: ${formatProbe(baseline.front4)}`);
  lockLog(`[lock] baseline front v6: ${formatProbe(baseline.front6)}`);
  lockLog(`[lock] baseline api   v4: ${formatProbe(baseline.api4)}`);
  lockLog(`[lock] baseline api   v6: ${formatProbe(baseline.api6)}`);
  appendFileSync(timelinePath, `${JSON.stringify({ kind: 'baseline', dualStack, ...baseline })}\n`);

  let pathDead = bothStacksDead(baseline, runImage, runApi, dualStack);
  const timeline: DualStackSample[] = [baseline];
  let firstDeadAtMs: number | null = pathDead ? 0 : null;
  if (pathDead) {
    lockLog('[lock] baseline already dual-stack dead — skipping storm');
  }

  const probeTimer = setInterval(() => {
    void (async () => {
      const sample = await sampleDualStack(frontBase, apiBase, runStarted, dualStack);
      timeline.push(sample);
      appendFileSync(timelinePath, `${JSON.stringify({ kind: 'probe', dualStack, ...sample })}\n`);
      if (!pathDead && bothStacksDead(sample, runImage, runApi, dualStack)) {
        pathDead = true;
        firstDeadAtMs = sample.atMs;
        lockLog(`[lock] dual-stack path dead at +${sample.atMs}ms — stopping storm`);
      }
    })();
  }, 2_000);

  const phases: PhaseSummary[] = [];
  const onRecord = (rec: RequestRecord) => {
    appendFileSync(ndjsonPath, `${JSON.stringify(rec)}\n`);
  };

  try {
    if (runImage && !pathDead) {
      lockLog('[lock] phase=image starting');
      const imageSummary = await runStorm({
        phase: 'image',
        concurrency: args.concurrency,
        total: args.total,
        durationSec: args.durationSec,
        rampSec: args.rampSec,
        shouldStop: () => pathDead,
        onRecord,
        queue,
        throttle,
        buildUrl: () => `${frontBase}/lock-probe.jpg?n=${randomBytes(8).toString('hex')}`,
      });
      phases.push(imageSummary);
      lockLog(
        `[lock] phase=image done attempted=${imageSummary.attempted} ok=${imageSummary.success} fail=${imageSummary.fail} stop=${imageSummary.stoppedReason} latency min/avg/max=${imageSummary.latencyMs.min}/${imageSummary.latencyMs.avg}/${imageSummary.latencyMs.max}ms`,
      );
    }

    if (runApi && !pathDead) {
      lockLog('[lock] phase=api starting');
      const apiSummary = await runStorm({
        phase: 'api',
        concurrency: args.concurrency,
        total: args.total,
        durationSec: args.durationSec,
        rampSec: args.rampSec,
        shouldStop: () => pathDead,
        onRecord,
        queue,
        throttle,
        headers: { Authorization: `Bearer ${opsToken}` },
        buildUrl: () =>
          `${apiBase}/operation/lock-probe?bytes=${args.bytes}&nonce=${randomBytes(8).toString('hex')}`,
      });
      phases.push(apiSummary);
      lockLog(
        `[lock] phase=api done attempted=${apiSummary.attempted} ok=${apiSummary.success} fail=${apiSummary.fail} stop=${apiSummary.stoppedReason} latency min/avg/max=${apiSummary.latencyMs.min}/${apiSummary.latencyMs.avg}/${apiSummary.latencyMs.max}ms`,
      );
    } else if (runApi && pathDead) {
      lockLog('[lock] phase=api skipped — dual-stack already dead');
    }
  } finally {
    clearInterval(probeTimer);
  }

  const finalSample = await sampleDualStack(frontBase, apiBase, runStarted, dualStack);
  timeline.push(finalSample);
  appendFileSync(timelinePath, `${JSON.stringify({ kind: 'final', ...finalSample })}\n`);

  const summary = {
    mode: args.mode,
    frontBase,
    apiBase,
    clientPublicIp: { v4: publicV4, v6: publicV6 },
    options: {
      image: runImage,
      api: runApi,
      concurrency: args.concurrency,
      total: args.total,
      bytes: args.bytes,
      durationSec: args.durationSec,
      rampSec: args.rampSec,
      queueLimit: args.queueLimit ?? null,
      throttle: args.throttle ?? null,
    },
    /** Highest number of requests the queue actually let run at once —
     * directly answers "did --queue <n> hold", instead of inferring it
     * from request timing after the fact. null when --queue was disabled. */
    queuePeakActive: queue?.peakActive() ?? null,
    baseline,
    final: finalSample,
    firstDualStackDeadAtMs: firstDeadAtMs,
    phases,
    elapsedMs: Date.now() - runStarted,
    reportDir: outDir,
  };

  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

  const md: string[] = [
    `# Lock probe ${stampNow()}`,
    '',
    `- mode: \`${args.mode}\``,
    `- front: \`${frontBase}\``,
    `- api: \`${apiBase}\``,
    `- client IPv4: \`${publicV4 ?? 'n/a'}\` IPv6: \`${publicV6 ?? 'n/a'}\``,
    `- flags: image=${runImage} api=${runApi} concurrency=${args.concurrency} total=${args.total} bytes=${args.bytes} durationSec=${args.durationSec} rampSec=${args.rampSec} queue=${args.queueLimit ?? 'disabled'} throttle=${throttleLabel}`,
    `- queue peak actual in-flight: ${summary.queuePeakActive ?? 'n/a (queue disabled)'}${args.queueLimit ? ` (cap was ${args.queueLimit})` : ''}`,
    `- elapsed: ${summary.elapsedMs}ms`,
    `- dual-stack dead at: ${firstDeadAtMs === null ? 'never' : `+${firstDeadAtMs}ms`}`,
    '',
    '## Baseline',
    '',
    `- front v4: ${formatProbe(baseline.front4)}`,
    `- front v6: ${formatProbe(baseline.front6)}`,
    `- api v4: ${formatProbe(baseline.api4)}`,
    `- api v6: ${formatProbe(baseline.api6)}`,
    '',
    '## Final',
    '',
    `- front v4: ${formatProbe(finalSample.front4)}`,
    `- front v6: ${formatProbe(finalSample.front6)}`,
    `- api v4: ${formatProbe(finalSample.api4)}`,
    `- api v6: ${formatProbe(finalSample.api6)}`,
    '',
    '## Phases',
    '',
  ];

  for (const p of phases) {
    md.push(
      `### ${p.phase}`,
      '',
      `- attempted: ${p.attempted}`,
      `- success: ${p.success}`,
      `- fail: ${p.fail}`,
      `- bytesTransferred: ${p.bytesTransferred}`,
      `- elapsedMs: ${p.elapsedMs}`,
      `- stoppedReason: ${p.stoppedReason}`,
      `- firstFailAtMs: ${p.firstFailAtMs ?? 'n/a'} (concurrency ${p.firstFailConcurrency ?? 'n/a'})`,
      `- latency min/avg/max: ${p.latencyMs.min}/${p.latencyMs.avg}/${p.latencyMs.max} ms`,
      `- latency p50/p95/p99: ${p.latencyMs.p50}/${p.latencyMs.p95}/${p.latencyMs.p99} ms`,
      `- status: ${JSON.stringify(p.statusHistogram)}`,
      '',
    );
  }

  md.push(
    '## How to read',
    '',
    '- Client fails while remote/server still OK → local/LAN path.',
    '- Client and remote both fail → host/site.',
    '- Image phase fails, API OK (or reverse) → front vs API path differ.',
    '- Breaks only above concurrency N → soft concurrency limit.',
    '',
  );

  writeFileSync(join(outDir, 'SUMMARY.md'), `${md.join('\n')}\n`);
  lockLog(`[lock] wrote ${join(outDir, 'SUMMARY.md')}`);
  lockLog(`[lock] wrote ${join(outDir, 'summary.json')}`);
}
