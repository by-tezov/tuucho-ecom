import { appendFileSync, constants, existsSync, renameSync, statSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { constants as moduleConstants, enableCompileCache } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Startup logger and readiness check, independent of the real app in app.ts
 * — server.js (Passenger's configured startup file) imports only this. On a
 * shared-hosting deploy, Passenger's own "could not be started" page gives
 * zero detail beyond an opaque error ID, so a native-binding failure or any
 * other import-time throw is otherwise invisible. This logs the app import
 * and every readiness probe straight to a plain file sitting next to this
 * one in the deployed folder — readable from cPanel's File Manager, no log
 * viewer or SSH needed. Once boot succeeds this also stays registered as a
 * permanent safety net: any *later* uncaught exception or unhandled
 * rejection (e.g. the pg Pool's own background 'error' event, which
 * otherwise crashes the process silently) gets logged here too, instead of
 * vanishing into whatever Passenger does with a dead process.
 *
 * Cold-start budget. Passenger on the LWS host stops an idle app after a few
 * seconds (docs/cron/README.md), so most visitors meet a fresh boot, which
 * took ~4s there. Two things here keep it short: the app is loaded from the
 * single-file bundle the deployed build writes (see serverEntry.ts), and the
 * server starts listening before the probes run, which are diagnostics, not
 * a gate. */

const logPath = join(dirname(fileURLToPath(import.meta.url)), 'startup.log');
const startupLogMaxBytes = 5 * 1024 * 1024;
const startupLogMaxFiles = 3;
// A cumulative duration is much easier to scan than wall-clock timestamps:
// it shows immediately which import/probe is slow, and stays meaningful when
// cPanel/Passenger interleaves its own "Getting ready…" spinner output.
const bootStartedAt = performance.now();

function elapsed(): string {
  return `+${String(Math.round(performance.now() - bootStartedAt)).padStart(5, '0')}ms`;
}

function writeLog(line: string): void {
  try {
    appendFileSync(logPath, line + '\n');
  } catch {
    // Logging itself must never be why boot fails.
  }
}

/** Passenger restarts append to the same release-local file. Rotate before a
 * new attempt so a permanently crashing process cannot fill the release
 * volume. Rotation is synchronous because it runs only once per boot and
 * must complete before the first separator is written. */
function rotateStartupLogIfNeeded(): void {
  try {
    if (statSync(logPath).size < startupLogMaxBytes) return;
    for (let index = startupLogMaxFiles - 1; index >= 1; index -= 1) {
      const source = `${logPath}.${index}`;
      const target = `${logPath}.${index + 1}`;
      try {
        renameSync(source, target);
      } catch {
        // Missing older generations are normal on the first rotations.
      }
    }
    renameSync(logPath, `${logPath}.1`);
  } catch {
    // Logging itself must never be why boot fails.
  }
}

function log(line: string): void {
  const timed = `[${elapsed()}] ${line}`;
  writeLog(timed);
  console.log(timed);
}

type BootRow = {
  phase: 'import' | 'probe';
  check: string;
  status: 'OK' | 'SKIPPED' | 'WARN' | 'FAILED';
  at: string;
  duration: string;
};

const bootRows: BootRow[] = [];

/** A compact result table keeps the terminal readable while Stripe CLI has
 * its own animated output. The separate start line is intentionally kept:
 * if Node hangs or throws, the active import is already known. */
function recordBootRow(
  phase: BootRow['phase'],
  check: string,
  status: BootRow['status'],
  startedAt: number,
): void {
  const row: BootRow = {
    phase,
    check,
    status,
    at: elapsed(),
    duration: `${Math.round(performance.now() - startedAt)}ms`,
  };
  bootRows.push(row);
  writeLog(`[${row.at}] ${phase} ${check}: ${status} (${row.duration})`);
}

function printBootTable(): void {
  if (bootRows.length > 0) console.table(bootRows);
}

function describe(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

process.on('uncaughtException', (err) => {
  log(`uncaughtException: ${describe(err)}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log(`unhandledRejection: ${describe(reason)}`);
  process.exit(1);
});

/** The deployed build's single-file bundle when there is one (scripts/
 * build.mjs), else the module graph itself: dev runs this file under tsx,
 * where there is no bundle. */
type ServerEntry = typeof import('./serverEntry.js');
const bundledEntry = join(dirname(fileURLToPath(import.meta.url)), 'bundle', 'serverEntry.js');

async function loadServerEntry(): Promise<ServerEntry> {
  if (existsSync(bundledEntry)) {
    return (await import(pathToFileURL(bundledEntry).href)) as ServerEntry;
  }
  return import('./serverEntry.js');
}

// Deliberately an async function invoked without a top-level `await` on it
// (not a bare top-level `await`), even though this file only ever reaches
// Node via a static `import` from server.ts. Node treats top-level await as
// viral through the whole synchronously-linked module graph: Passenger's own
// Node loader `require()`s server.js rather than `import()`ing it, and
// `require()` on an ESM graph that contains top-level await anywhere in it
// throws ERR_REQUIRE_ASYNC_MODULE — hit this exactly once already. Keeping
// the await inside a plain async function sidesteps that entirely.
async function main(): Promise<void> {
  // Passenger restarts append to the same file across every attempt — a
  // plain separator line makes each boot's own run visually obvious when
  // scrolling startup.log in File Manager, rather than a wall of entries
  // from several process lifetimes.
  rotateStartupLogIfNeeded();
  try {
    appendFileSync(logPath, `\n${'='.repeat(80)}\n`);
  } catch {
    // Same best-effort reasoning as log() above.
  }
  log(`---- new boot attempt (pid=${process.pid}) ----`);

  // V8 keeps the bytecode it compiles for the bundle on disk next to the
  // release, so a cold start reuses it instead of compiling ~7MB of JS again
  // (measured on the LWS host: ~1.29s down to ~1.06s to load the bundle).
  // Keyed by file content, so a new release starts its own cache.
  const compileCache = enableCompileCache(join(dirname(fileURLToPath(import.meta.url)), '.compile-cache'));
  const cacheStatus = Object.entries(moduleConstants.compileCacheStatus).find(
    ([, value]) => value === compileCache.status,
  )?.[0];
  log(`compile cache: ${cacheStatus ?? compileCache.status}${compileCache.message ? ` (${compileCache.message})` : ''}`);

  const source = existsSync(bundledEntry) ? 'bundle/serverEntry.js' : 'serverEntry.js';
  let entry: ServerEntry;
  const importStartedAt = performance.now();
  log(`importing ${source} ...`);
  try {
    entry = await loadServerEntry();
  } catch (err) {
    recordBootRow('import', source, 'FAILED', importStartedAt);
    printBootTable();
    log(`FAILED importing ${source}: ${describe(err)}`);
    process.exit(1);
  }
  recordBootRow('import', source, 'OK', importStartedAt);

  log('starting app.js');
  try {
    entry.startServer();
  } catch (err) {
    log(`FAILED starting app.js: ${describe(err)}`);
    process.exit(1);
  }
  log('app.js started');

  // After the server is listening, never before: these check things that
  // only fail at *runtime* — a Pool import always succeeds even with a wrong
  // DATABASE_URL, since pg only connects on first query — and they are
  // deliberately non-fatal (logged as WARN, never process.exit): /healthz is
  // designed to answer "even if the DB is temporarily unreachable" (see
  // app.ts), and a transient DB blip or Stripe outage during a Passenger
  // restart shouldn't take the *entire* API down when most routes don't need
  // that particular dependency. This is a diagnostic, not a gate, so it must
  // not hold the first request: on a cold start it used to cost ~0.5s of
  // network round trips before the server even began listening.
  const { pool, config, getStripe, retrieveBalance, warmAppPreferences } = entry;
  const probes: Array<[string, () => Promise<void | 'skipped'>]> = [
    [
      'db connectivity',
      async () => {
        await pool.query('select 1');
        await warmAppPreferences();
      },
    ],
    [
      'media dir writable',
      async () => {
        await access(config.mediaDir, constants.W_OK);
      },
    ],
    [
      'stripe reachable',
      async () => {
        const stripe = getStripe();
        if (!stripe) {
          log('probe SKIPPED stripe reachable: no STRIPE_SECRET_KEY configured');
          return 'skipped';
        }
        await retrieveBalance(stripe);
      },
    ],
    [
      'Mondial Relay API2 reachable',
      async () => {
        const apiUrl = config.mondialRelay.api2Url;
        if (!apiUrl) {
          log('probe SKIPPED Mondial Relay API2 reachable: no MONDIAL_RELAY_API2_URL configured');
          return 'skipped';
        }
        // Do not create a label merely to prove the carrier is available.
        // OPTIONS is credential-free and its expected 401/405 response still
        // proves DNS/TLS/network reachability. Only a server error is a
        // readiness warning; the full authenticated label flow remains an
        // order-time operation.
        const response = await fetch(apiUrl, { method: 'OPTIONS', headers: { accept: 'application/xml' } });
        if (response.status >= 500) {
          throw new Error(`Mondial Relay returned ${response.status}.`);
        }
        await response.body?.cancel();
      },
    ],
  ];
  const outcomes = await Promise.all(
    probes.map(async ([name, probe]) => {
      const startedAt = performance.now();
      log(`checking ${name} ...`);
      try {
        const result = await withTimeout(probe(), 5000, name);
        const status = result === 'skipped' ? ('SKIPPED' as const) : ('OK' as const);
        return { name, startedAt, finishedAt: performance.now(), status };
      } catch (err) {
        log(`probe WARN ${name}: ${describe(err)}`);
        return { name, startedAt, finishedAt: performance.now(), status: 'WARN' as const };
      }
    }),
  );
  // Shifted so the recorded duration is the probe's own, not the wait for
  // the slowest one.
  for (const outcome of outcomes) {
    const ownStart = outcome.startedAt + (performance.now() - outcome.finishedAt);
    recordBootRow('probe', outcome.name, outcome.status, ownStart);
  }
  printBootTable();
}

void main();
