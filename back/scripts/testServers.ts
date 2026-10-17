import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { redactStripeCliOutput, stripeListenArgs } from './stripeListenArgs.js';
import { existsSync } from 'node:fs';
import { loadEnvFile, type Mode } from './envFile.js';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DisposableTestDatabase } from './testDatabase.js';

export interface ManagedServer {
  name: string;
  child: ChildProcess;
  /** Process-group id captured at spawn (detached child is its own leader). */
  pgid: number;
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(label: string, url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isReachable(url)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`[test] timed out waiting for ${label} at ${url}`);
}

function startProcess(
  cwd: string,
  name: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  opts: { deathPipe?: boolean } = {},
): ManagedServer {
  // New process group so stopManagedServers can SIGTERM the whole tree
  // without leaving orphans. Isolated Node servers also get a stdin death
  // pipe so an interrupted orchestrator still triggers graceful shutdown.
  const useDeathPipe = opts.deathPipe !== false;
  const child = spawn(command, args, {
    cwd,
    env: useDeathPipe
      ? {
          ...env,
          PAM_TEST_SHUTDOWN_ON_STDIN_CLOSE: '1',
        }
      : env,
    // Keep startup failures visible: an isolated server has no pre-existing
    // terminal to inspect and silently waiting for its health check obscures
    // a missing migration/configuration immediately.
    stdio: useDeathPipe ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    detached: process.platform !== 'win32',
  });
  const pid = child.pid;
  if (!pid) throw new Error(`[test] ${name} started without a pid`);
  // Keep the death pipe open until stopManagedServers ends it. Without this,
  // Node may GC the unused stdin stream and close it immediately.
  child.stdin?.on('error', () => {
    /* closed during stop */
  });
  console.error(`[test] started ${name} (pid ${pid})`);
  return { name, child, pgid: pid };
}

/** Run a TypeScript entry as the process-group leader so SIGTERM and the
 * stdin death pipe reach the same Node process that owns the DB pool. */
function startTsxProcess(
  cwd: string,
  name: string,
  entryRelative: string,
  env: NodeJS.ProcessEnv,
): ManagedServer {
  const preflight = join(cwd, 'node_modules/tsx/dist/preflight.cjs');
  const loader = join(cwd, 'node_modules/tsx/dist/loader.mjs');
  if (!existsSync(preflight) || !existsSync(loader)) {
    throw new Error(`[test] tsx loader missing under ${cwd}/node_modules/tsx`);
  }
  return startProcess(
    cwd,
    name,
    process.execPath,
    ['--require', preflight, '--import', pathToFileURL(loader).href, entryRelative],
    env,
    { deathPipe: true },
  );
}

/**
 * Stripe CLI creates a local webhook signing secret for `stripe listen`.
 * Retrieve it without inheriting stdout: it is passed only to the isolated
 * server process and must never be emitted in test output.
 */
function readStripeCliWebhookSecret(): string | undefined {
  try {
    const secret = execFileSync('stripe', ['listen', '--print-secret'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!/^whsec_[A-Za-z0-9]+$/.test(secret)) return undefined;
    return secret;
  } catch {
    return undefined;
  }
}

/**
 * Start and wait for the local Stripe webhook relay. The CLI prints its
 * signing secret on the ready line, so its output is intentionally consumed
 * here rather than inherited by the test runner.
 */
async function startStripeWebhookRelay(cwd: string, forwardTo: string): Promise<ManagedServer> {
  const child = spawn('stripe', stripeListenArgs(forwardTo), {
    cwd,
    env: process.env,
    // Do not use inherited output: Stripe CLI's ready message includes its
    // webhook signing secret. We only report a redacted readiness result.
    // stdin stays a pipe so the process group stop path can close it uniformly.
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  const pid = child.pid;
  if (!pid) throw new Error('[test] Stripe CLI webhook relay started without a pid');
  const name = 'Stripe CLI webhook relay';
  const relay = { name, child, pgid: pid };
  console.error(`[test] started ${name} (pid ${pid})`);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('[test] Stripe CLI webhook relay did not become ready within 15s.'));
    }, 15_000);
    const ready = () => {
      clearTimeout(timeout);
      console.error(`[test] Stripe CLI webhook relay ready → ${forwardTo}`);
      resolve();
    };
    const failed = (message: string) => {
      clearTimeout(timeout);
      reject(new Error(`[test] Stripe CLI webhook relay ${message}.`));
    };
    let output = '';
    const inspect = (chunk: Buffer) => {
      // Current Stripe CLI says "Ready!"; accept the older listener wording
      // too. The ready line contains the signing secret, so it is never printed.
      const text = chunk.toString();
      output = (output + text).slice(-1_500);
      if (/\bReady!|listening for events/i.test(text)) ready();
    };
    child.stdout?.on('data', inspect);
    child.stderr?.on('data', inspect);
    child.once('error', () => failed('could not start'));
    child.once('exit', (code, signal) => {
      const detail = redactStripeCliOutput(output).replace(/\s+/g, ' ').trim();
      const why = detail ? ` ${detail}` : '';
      failed(`stopped before readiness (code ${code ?? 'none'}, signal ${signal ?? 'none'})${why}`);
    });
  }).catch((error: unknown) => {
    signalTree(pid, 'SIGTERM');
    throw error;
  });

  return relay;
}

async function availablePort(preferredPort?: number): Promise<number> {
  const { createServer } = await import('node:net');
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(preferredPort ?? 0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('[test] could not allocate an isolated local port.'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

export interface EnsureServersResult {
  started: ManagedServer[];
  apiBaseUrl: string;
  opsBaseUrl: string;
  frontBaseUrl: string;
}

/** Start an isolated back/front pair for one disposable test database. */
export async function ensureServers(
  root: string,
  mode: Mode,
  opts: {
    needFront: boolean;
    frontRoot: string;
    database: DisposableTestDatabase;
    /** Shop port for this environment. Defaults to `PAM_TEST_WEB_FRONT_PORT` or 4173. */
    frontPort?: number;
    onStarted?: (server: ManagedServer) => void;
    /** Extra env for the isolated API process (e.g. raised rate limits for --load). */
    apiEnv?: NodeJS.ProcessEnv;
  },
): Promise<EnsureServersResult> {
  const publicEnv = {
    ...loadEnvFile(root, '.public.env'),
    ...loadEnvFile(root, `${mode}/.public.env`),
  };
  // Chrome's “Apps on device” permission belongs to the requesting origin,
  // including its port. Keep the isolated Vite origin stable so a developer
  // does not receive the same permission prompt on every test run. This is
  // intentionally a different port from the ordinary front dev server.
  const requestedFrontPort = opts.frontPort ?? Number(process.env.PAM_TEST_WEB_FRONT_PORT ?? '4173');
  if (!Number.isInteger(requestedFrontPort) || requestedFrontPort < 1024 || requestedFrontPort > 65_535) {
    throw new Error('[test] PAM_TEST_WEB_FRONT_PORT must be an integer between 1024 and 65535.');
  }
  const apiPort = await availablePort();
  const opsPort = await availablePort();
  const frontPort = opts.needFront ? await availablePort(requestedFrontPort) : 0;
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const opsBaseUrl = `http://127.0.0.1:${opsPort}`;
  const frontBaseUrl = opts.needFront
    ? `http://127.0.0.1:${frontPort}`
    : (publicEnv.URL_FRONTEND_BASE ?? 'http://localhost:5173');
  const started: ManagedServer[] = [];
  const stripeWebhookSecret = readStripeCliWebhookSecret();

  if (!stripeWebhookSecret) {
    console.error(
      '[test] Stripe CLI webhook relay unavailable; Stripe redirect tests cannot receive local webhooks.',
    );
  }

  try {
    console.error(`[test] starting isolated back at ${apiBaseUrl}`);
    const back = startTsxProcess(root, 'back', 'src/server.ts', {
      ...process.env,
      ...opts.apiEnv,
      APP_TARGET: mode,
      PAM_TEST_PORT: String(apiPort),
      PAM_TEST_DATABASE_URL: opts.database.url,
      PAM_TEST_FRONTEND_BASE_URL: frontBaseUrl,
      // Lets functional tests present a `pam-test-google.` identity without
      // calling Google. A configured client id is still required or /auth/google
      // answers 503 before verification. Never set on a normal dev server.
      ...(mode === 'dev' ? { PAM_TEST_SOCIAL_STUB: '1' } : {}),
      ...(process.env.GOOGLE_CLIENT_ID?.trim()
        ? {}
        : { GOOGLE_CLIENT_ID: 'functional-test-google-client' }),
      PAM_TEST_PUBLIC_MEDIA_URL: `${apiBaseUrl}/media`,
      PAM_TEST_STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
    });
    started.push(back);
    opts.onStarted?.(back);
    await waitFor('back', `${apiBaseUrl}/healthz`, 120_000);

    // API and functional setup files call operational endpoints directly.
    // Keep one loopback ops server alive for the complete Patchright run so
    // those calls use the same disposable database as the isolated API.
    console.error(`[test] starting isolated ops at ${opsBaseUrl}`);
    const ops = startTsxProcess(root, 'ops', 'src/opsServer.ts', {
      ...process.env,
      APP_TARGET: mode,
      PAM_OPS_PORT: String(opsPort),
      PAM_TEST_DATABASE_URL: opts.database.url,
    });
    started.push(ops);
    opts.onStarted?.(ops);
    await waitFor('ops', `${opsBaseUrl}/healthz`, 120_000);

    if (stripeWebhookSecret) {
      const stripeListener = await startStripeWebhookRelay(root, `127.0.0.1:${apiPort}/webhooks/stripe`);
      started.push(stripeListener);
      opts.onStarted?.(stripeListener);
    }

    if (opts.needFront) {
      if (!existsSync(join(opts.frontRoot, 'package.json')))
        throw new Error(`[test] front root missing: ${opts.frontRoot}`);
      console.error(`[test] starting isolated front at ${frontBaseUrl}`);
      const front = startProcess(
        opts.frontRoot,
        'front',
        'npm',
        ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(frontPort)],
        {
          ...process.env,
          PAM_TEST_API_BASE_URL: apiBaseUrl,
          PAM_TEST_SITE_URL: frontBaseUrl,
          PAM_TEST_SUITE: 'dev',
          // Non-secret identifiers solely to render Google/Apple controls in
          // the isolated browser. Their SDK calls are stubbed by functional
          // tests; Stripe and Mondial Relay use the real dev client config.
          PAM_TEST_GOOGLE_CLIENT_ID: 'functional-test-google-client',
          PAM_TEST_APPLE_CLIENT_ID: 'functional-test-apple-client',
          PAM_TEST_DISABLE_VITE_WATCH: '1',
          // The isolated Vite process exists only for automated tests. Keep
          // the production splash choreography untouched, but eliminate the
          // default loading floor (the splash's own hold, and every other
          // overlay that shares it) and make the authored splash timing
          // effectively instant.
          // vite.config.ts loads normal .env files after process creation;
          // keep test-only values under PAM_TEST_* so it can deliberately
          // apply them after that load.
          PAM_TEST_LOADING_MIN: '1ms',
          PAM_TEST_BOOT_SPLASH_SPEED: '10000',
        },
        // Vite does not honor the death-pipe env; process-group signals stop it.
        { deathPipe: false },
      );
      started.push(front);
      opts.onStarted?.(front);
      await waitFor('front', frontBaseUrl, 120_000);
    }

    return { started, apiBaseUrl, opsBaseUrl, frontBaseUrl };
  } catch (error) {
    await stopManagedServers(started);
    throw error;
  }
}

function signalTree(pgid: number, signal: NodeJS.Signals): void {
  try {
    if (process.platform !== 'win32') process.kill(-pgid, signal);
    else process.kill(pgid, signal);
  } catch {
    try {
      process.kill(pgid, signal);
    } catch {
      /* already gone */
    }
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Members of a detached child's process group. Leader exit alone is not
 * enough: npx/tsx can reap while the nested Node server stays alive. */
function processGroupMembers(pgid: number): number[] {
  if (process.platform === 'win32') return isPidAlive(pgid) ? [pgid] : [];
  try {
    const out = execFileSync('pgrep', ['-g', String(pgid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

function endDeathPipe(server: ManagedServer): void {
  const stdin = server.child.stdin;
  if (!stdin || stdin.destroyed) return;
  try {
    stdin.end();
  } catch {
    /* already closed */
  }
}

/** Stop only servers this run started (death-pipe + process-group SIGTERM, then SIGKILL). */
export async function stopManagedServers(servers: ManagedServer[]): Promise<void> {
  for (const server of servers) {
    console.error(`[test] stopping ${server.name} (pgid ${server.pgid})…`);
    endDeathPipe(server);
    signalTree(server.pgid, 'SIGTERM');
  }

  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (servers.every((s) => processGroupMembers(s.pgid).length === 0)) return;
    await new Promise((r) => setTimeout(r, 200));
  }

  for (const server of servers) {
    const leftover = processGroupMembers(server.pgid);
    if (leftover.length === 0) continue;
    console.error(
      `[test] force-stopping ${server.name} process group (pgid ${server.pgid}, pids ${leftover.join(',')})`,
    );
    signalTree(server.pgid, 'SIGKILL');
  }

  const killDeadline = Date.now() + 2_000;
  while (Date.now() < killDeadline) {
    if (servers.every((s) => processGroupMembers(s.pgid).length === 0)) return;
    await new Promise((r) => setTimeout(r, 100));
  }

  for (const server of servers) {
    const leftover = processGroupMembers(server.pgid);
    if (leftover.length === 0) continue;
    console.error(
      `[test] ${server.name} process group still alive after SIGKILL (pgid ${server.pgid}, pids ${leftover.join(',')})`,
    );
  }
}
