/** Local test entrypoint (`--dev` only).
 *
 * Fixture renderer (no HTTP/DB):
 *   npm run test -- template-invoice [--json] --dev
 *   npm run test -- template-gift-card [--json] --dev
 *   npm run test -- template-email [--json] --dev
 *
 * Lock stress probe (Node fetch; no Chrome):
 *   npm run test -- lock [--image] [--api] --dev
 *   npm run test -- lock --image --concurrency 40 --total 1000 --dev
 *   npm run test -- lock --api --bytes 262144 --ramp 2 --dev
 *   npm run test -- lock --image --queue 15 --total 1000 --dev
 *   npm run test -- lock --image --queue 15 --pace "each:150 between:250" --dev
 *
 * Patchright suites:
 *   npm run test -- --dev --functional
 *   npm run test -- --dev --api
 *   npm run test -- --preprod --ftp --functional
 *   npm run test -- --preprod --ftp --functional --throttle 500
 *   npm run test -- --dev --functional --api
 *   npm run test -- --dev --functional --throttle 400
 *   npm run test -- --dev --functional --headless
 *   npm run test -- --dev --functional --verbose
 *   npm run test -- --dev --functional --grep "PayPal full"
 *   npm run test -- --dev --functional --fail-fast
 *
 * Unit tests (no target / environment; back + front):
 *   npm run test -- --unit-test
 *
 * k6 load (no Chrome):
 *   npm run test -- --dev --load
 *   npm run test -- --dev --api --load
 *   npm run test -- --dev --load --vu 25
 *   npm run test -- --dev --load --vu 25 --duration 120
 *   npm run test -- --dev --load --load-profile baseline --vu 50
 *
 * Functional runs headed by default; pass `--headless` to hide the browser.
 * Headed Chrome for each lane stays on its own nested display, so lanes keep their focus.
 * Each host window pauses, restarts, or stops only its own lane, and its
 * throttle field changes that lane's pause while the suite runs.
 * `--verbose` prints each customer-visible step as ACTION / EXPECT / RESULT.
 * `--throttle <ms>` pauses after a click that triggered an API request.
 * Typing and UI-only clicks stay at full speed. Preprod defaults to 500 ms.
 * On a terminal, once Patchright is running: p pauses (browser stays), r restarts, q quits.
 * `--index` / `--type` are resolved before the disposable stack starts.
 * One index is one test: 1–1000 desktop (PC) size, 1001–2000 mobile size.
 * A functional run with both sizes starts two disposable environments and runs
 * them at the same time. Each run stops its servers and drops its databases.
 *
 * Fixture output → output/test/emails; HTML reports → output/report/
 *   (functional-web|functional-mobile|api|load|coverage); tmp → output/test/tmp; lock → output/test/lock.
 * Hub: output/report/index.html.
 */
import { Command as Program } from 'commander';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { addTargetOptionFlags, makeFail, resolveModeFromOpts } from './cliCommon.js';
import { loadEnvFile, loadOpsToken, loadPublicEnv, type Mode } from './envFile.js';
import { log, printJson } from './cliOutput.js';
import * as fixtures from './testFixtures.js';
import { ensureServers, stopManagedServers } from './testServers.js';
import {
  indexesForLane,
  laneWindowPosition,
  mergeLaneSummaries,
  planSideBySideLanes,
  readLaneSummary,
  resolveSideBySideFrontPorts,
  titlesForLane,
  type LaneSummary,
  type TestLanePlan,
} from './testLanes.js';
import {
  FUNCTIONAL_WEB_WINDOW,
  formatChromeOuterSize,
  testWindowPosition,
} from '../src-test/dev/support/functionalWindow.js';
import {
  headedChildEnv,
  laneDisplayLayout,
  startNestedTestDisplays,
  applyReporterProgress,
  createLaneProgress,
  formatLaneProgress,
  statusTextFromReporterLine,
  type LaneProgress,
  type NestedTestDisplay,
} from './testDisplay.js';
import { patchHtmlReport } from './patchHtmlReport.js';
import {
  attachFunctionalRunControls,
  type FunctionalRunControls,
  type RunLaneId,
} from './testRunControls.js';
import { loadReportDir, patchrightReportDir, reportRoot } from './reportPaths.js';
import { writeLoadHtmlReport } from './writeLoadHtmlReport.js';
import { writeReportHub } from './writeReportHub.js';
import {
  createDisposableTestDatabase,
  destroyDisposableTestDatabase,
  removeOrphanedTestDatabases,
} from './testDatabase.js';
import { sweepTestBrowserProfile } from '../src-test/dev/support/browserLifecycle.js';
import {
  allocateContentionVus,
  allocateLoadVus,
  defaultLoadDurationSec,
  defaultLoadVus,
} from '../src-test/dev/load/_lib/vuAlloc.js';
import { runLockProbe, parseThrottle } from './lockProbe.js';
import { startLoadMailHelper } from './loadMailHelper.js';
import {
  checkLoadInvariants,
  cloneLoadVouchers,
  prepareContentionFixtures,
  startDbSampler,
  type ScarceFixture,
} from './loadIntegrity.js';
import {
  closeOpsSshTunnel,
  freeLocalPort,
  OPS_READY_TIMEOUT_REMOTE_MS,
  spawnOpsSshTunnel,
  waitForOpsReady,
} from './opsTunnel.js';

function connectRunWindow(
  display: NestedTestDisplay | undefined,
  controls: FunctionalRunControls | undefined,
  onThrottle?: (lane: RunLaneId, ms: number) => void,
): void {
  if (!display || !controls) return;
  display.setControlHandler((lane, control) => {
    if (control.type === 'throttle') onThrottle?.(lane, control.ms);
    else controls.applyLane(lane, control.action);
  });
}

function rememberThrottle(files: Map<RunLaneId, string>, lane: RunLaneId, file: string, ms: number): void {
  files.set(lane, file);
  writeFileSync(file, `${ms}\n`);
}

function publishThrottle(
  files: Map<RunLaneId, string>,
  display: NestedTestDisplay | undefined,
  lane: RunLaneId,
  ms: number,
): void {
  const file = files.get(lane);
  if (file) writeFileSync(file, `${ms}\n`);
  display?.setThrottle(lane, ms);
  const label = lane === 'mobile' ? 'handset' : 'web';
  console.error(`[test] ${label} throttle=${ms}ms (pause after API-triggering clicks)`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_ACTION_TIMEOUT_MS = 15_000;

/**
 * Keep slow, custom retries from bypassing Patchright's actionTimeout. This
 * runs before a disposable database or browser is started, so a future
 * overlong timeout is rejected immediately instead of wasting a test run.
 */
function assertFunctionalTimeoutPolicy(testRoot: string): void {
  const files: string[] = [];
  const collect = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      // k6 load scripts are not Patchright specs (VU stages use long durations).
      if (entry.isDirectory()) {
        if (entry.name === 'load') continue;
        collect(path);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path);
    }
  };
  collect(testRoot);

  const violations: string[] = [];
  const actionTimeout = /(?:\btimeout(?:Ms)?\s*[:=]\s*|Date\.now\(\)\s*\+\s*|waitForTimeout\(\s*)(\d[\d_]*)/g;
  for (const path of files) {
    const source = readFileSync(path, 'utf8');
    if (/\btest\.setTimeout\s*\(/.test(source)) {
      violations.push(`${path}: test.setTimeout() is forbidden; each action must fail within 15 seconds.`);
    }
    for (const match of source.matchAll(actionTimeout)) {
      const timeout = Number(match[1]!.replaceAll('_', ''));
      if (timeout > MAX_ACTION_TIMEOUT_MS) {
        violations.push(`${path}: ${timeout}ms exceeds the ${MAX_ACTION_TIMEOUT_MS}ms action limit.`);
      }
    }
  }

  const playwrightConfig = readFileSync(join(root, 'patchright.config.ts'), 'utf8');
  if (!playwrightConfig.includes('const MAX_ACTION_TIMEOUT_MS = 15_000')) {
    violations.push('patchright.config.ts: missing the 15-second shared action timeout.');
  }
  if (violations.length > 0) {
    throw new Error(`Functional timeout policy violation:\n${violations.join('\n')}`);
  }
}

type EmailKind =
  | 'invoice'
  | 'account-created'
  | 'auth-otp'
  | 'password-forgot'
  | 'loyalty-expiry'
  | 'order-confirmation'
  | 'order-confirmation-guest'
  | 'order-updated'
  | 'order-cancelled'
  | 'order-received'
  | 'order-received-guest'
  | 'order-status-preparing'
  | 'order-status-to-send'
  | 'order-return-resolved'
  | 'account-deleted'
  | 'order-shipped'
  | 'deletion-reminder'
  | 'change-security'
  | 'contact'
  | 'contact-reply'
  | 'product-request-accepted'
  | 'product-request-declined'
  | 'gift-share-card'
  | 'gift-cancelled'
  | 'gift-promise'
  | 'gift-reminder-hold'
  | 'gift-reminder-pay'
  | 'gift-reminder-select'
  | 'chat-reply'
  | 'spy-account-created'
  | 'spy-login'
  | 'spy-email-changed'
  | 'spy-account-deletion'
  | 'spy-order-confirmation'
  | 'spy-order-updated'
  | 'spy-order-cancelled'
  | 'spy-payment-failed'
  | 'spy-payment-authorization-expired'
  | 'spy-payment-authorization-expiring'
  | 'spy-cart-abandoned'
  | 'spy-gift-created'
  | 'spy-product-request'
  | 'spy-rate-limited'
  | 'chat-owner-notification';

const CUSTOMER_EMAIL_KINDS: EmailKind[] = [
  'invoice',
  'account-created',
  'auth-otp',
  'password-forgot',
  'loyalty-expiry',
  'order-confirmation',
  'order-confirmation-guest',
  'order-updated',
  'order-cancelled',
  'order-received',
  'order-received-guest',
  'order-status-preparing',
  'order-status-to-send',
  'order-return-resolved',
  'account-deleted',
  'order-shipped',
  'deletion-reminder',
  'change-security',
  'contact',
  'contact-reply',
  'product-request-accepted',
  'product-request-declined',
  'gift-share-card',
  'gift-cancelled',
  'gift-promise',
  'gift-reminder-hold',
  'gift-reminder-pay',
  'gift-reminder-select',
  'chat-reply',
];

const SPY_EMAIL_KINDS: EmailKind[] = [
  'spy-account-created',
  'spy-login',
  'spy-email-changed',
  'spy-account-deletion',
  'spy-order-confirmation',
  'spy-order-updated',
  'spy-order-cancelled',
  'spy-payment-failed',
  'spy-payment-authorization-expired',
  'spy-payment-authorization-expiring',
  'spy-cart-abandoned',
  'spy-gift-created',
  'spy-product-request',
  'spy-rate-limited',
  'chat-owner-notification',
];

const ALL_EMAIL_KINDS: EmailKind[] = [...CUSTOMER_EMAIL_KINDS, ...SPY_EMAIL_KINDS];

type FixtureCommand =
  { kind: 'template-invoice' } | { kind: 'template-gift-card' } | { kind: 'template-email' };

type LoadProfile = 'smoke' | 'baseline' | 'contention';
type ThrottleSpec = ReturnType<typeof parseThrottle>;

/** `--preprod` ops calls go either through the PHP gateway (`--ftp`) or an
 * SSH port forward to the same loopback opsServer (`--ssh`). */
type PreprodTransport = 'ssh' | 'ftp';

type ParsedArgs =
  | {
      kind: 'unit-test';
    }
  | {
      kind: 'fixture';
      command: FixtureCommand;
      json: boolean;
      mode: Mode;
    }
  | {
      kind: 'lock';
      mode: Mode;
      image: boolean;
      api: boolean;
      concurrency: number;
      total: number;
      bytes: number;
      durationSec: number;
      rampSec: number;
      queueLimit?: number;
      throttle?: ThrottleSpec;
    }
  | {
      kind: 'patchright';
      mode: Mode;
      functional: boolean;
      api: boolean;
      load: boolean;
      loadProfile: LoadProfile;
      loadVus: number;
      loadDurationSec: number;
      keepServers: boolean;
      headless: boolean;
      verbose: boolean;
      throttleMs: number;
      failFast: boolean;
      grep: string | null;
      indexes: number[] | null;
      testTypes: Set<'web' | 'mobile'>;
      typeSpecified: boolean;
      /** How `--preprod` reaches the loopback ops server; null for `--dev`. */
      transport: PreprodTransport | null;
    };

const program = new Program();
addTargetOptionFlags(program, ['dev', 'preprod'])
  .option('--json', 'print one JSON object to stdout instead of the human-readable output')
  .name('test')
  .description(
    'Test entrypoint: unit tests (no target), fixture renderer, isolated --dev Patchright suites, or live --preprod --ftp/--ssh critical-path suite.',
  )
  .argument('[name]', 'lock, template-invoice, template-gift-card, or template-email')
  .option('--unit-test', 'run back + front unit tests (no --dev/--preprod; no disposable stack)')
  .option('--functional', 'run the functional Patchright suite')
  .option('--api', 'Patchright API suite, or with `lock`: storm /operation/lock-probe')
  .option('--image', 'with `lock`: storm front /lock-probe.jpg (default both if neither --image nor --api)')
  .option('--load', 'run the k6 load suite (dev only)')
  .option('--load-profile <name>', 'k6 profile: smoke (default), baseline, or contention', (raw: string) => {
    if (raw !== 'smoke' && raw !== 'baseline' && raw !== 'contention') {
      fail('--load-profile accepts "smoke", "baseline" or "contention".');
    }
    return raw as LoadProfile;
  })
  .option(
    '--vu <n>',
    'total concurrent k6 VUs for --load (default: smoke 25 / baseline 50 / contention 25)',
    (raw: string) => {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
        fail('--vu requires an integer from 1 to 500.');
      }
      return parsed;
    },
  )
  .option(
    '--duration <sec>',
    'k6 load duration, or lock storm duration (0 = until --total)',
    (raw: string) => {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3600) {
        fail('--duration requires an integer from 0 to 3600 (seconds).');
      }
      return parsed;
    },
  )
  .option('--concurrency <n>', 'lock: max in-flight requests (default 20)', (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
      fail('--concurrency requires an integer from 1 to 500.');
    }
    return parsed;
  })
  .option('--total <n>', 'lock: requests per phase (default 500)', (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000) {
      fail('--total requires an integer from 1 to 1000000.');
    }
    return parsed;
  })
  .option('--bytes <n>', 'lock --api: payload size (default 65536, clamp 64..2000000)', (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 64 || parsed > 2_000_000) {
      fail('--bytes requires an integer from 64 to 2000000.');
    }
    return parsed;
  })
  .option(
    '--ramp <sec>',
    'lock: raise concurrency by 1 every N seconds (default 0 = fixed)',
    (raw: string) => {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3600) {
        fail('--ramp requires an integer from 0 to 3600 (seconds).');
      }
      return parsed;
    },
  )
  .option(
    '--queue <n>',
    'lock: cap actual in-flight requests via a queue on top of --concurrency (default: disabled)',
    (raw: string) => {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
        fail('--queue requires an integer from 1 to 500.');
      }
      return parsed;
    },
  )
  .option(
    '--pace <spec>',
    'lock: pace requests, e.g. "each:150 between:250" (each=ms between every request, between=ms pause after every --queue-sized packet; between requires --queue). Not the same as --throttle (pause after API-triggering clicks).',
    (raw: string) => {
      try {
        return parseThrottle(raw);
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  )
  .option('--confirm', 'unused; kept so old invocations do not error')
  .option('--keep-servers', 'ignored for isolated runs — kept so old invocations do not error')
  .option('--stop-servers', 'no-op — stopping started servers is now the default')
  .option('--headless', 'hide the browser (functional runs headed by default)')
  .option('--ftp', 'with --preprod: reach ops through the PHP gateway')
  .option('--ssh', 'with --preprod: reach ops through an SSH port forward to opsServer')
  .option('--verbose', 'print each step as ACTION / EXPECT / RESULT (OK, KO, or NO)')
  .option('--headed', 'no-op — headed is now the default for functional')
  .option('--fail-fast', 'stop after the first failure (--max-failures=1)')
  .option('--throttle <ms>', 'pause (ms) after a click that triggered an API request', (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      fail('--throttle requires a non-negative integer (ms).');
    }
    return parsed;
  })
  .option('--grep <pattern>', 'Patchright title pattern', (raw: string) => {
    if (!raw) fail('--grep requires a Patchright title pattern.');
    return raw;
  })
  .option('--index <numbers>', 'space-separated one-based test numbers, e.g. "1 4 7"', (raw: string) => {
    const parsed = raw.split(/\s+/).map(Number);
    if (!parsed.length || parsed.some((index) => !Number.isInteger(index) || index < 1)) {
      fail('--index requires positive, space-separated test numbers, e.g. --index "1 4 7".');
    }
    return parsed;
  })
  .option('--type <types>', 'space-separated "web"/"mobile"/"web mobile"', (raw: string) => {
    const parsed = raw.split(/\s+/);
    if (!parsed.length || parsed.some((type) => type !== 'web' && type !== 'mobile')) {
      fail('--type accepts "web", "mobile", or "web mobile".');
    }
    return new Set(parsed as Array<'web' | 'mobile'>);
  })
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts() as TestOpts;
    if (opts.unitTest) {
      if (opts.dev || opts.preprod || opts.prod || opts.ftp || opts.ssh) {
        thisCommand.error(
          '[test] --unit-test does not accept --dev, --preprod, --prod, --ftp, or --ssh.',
        );
      }
      return;
    }
    try {
      const mode = resolveModeFromOpts(opts, ['dev', 'preprod']);
      thisCommand.setOptionValue('mode', mode);
    } catch (error) {
      thisCommand.error(`[test] ${error instanceof Error ? error.message : String(error)}`);
    }
  });
const fail: (message: string) => never = makeFail(program, 'test');

interface TestOpts {
  mode?: Mode;
  dev?: boolean;
  preprod?: boolean;
  prod?: boolean;
  json?: boolean;
  unitTest?: boolean;
  functional?: boolean;
  api?: boolean;
  image?: boolean;
  load?: boolean;
  loadProfile?: LoadProfile;
  vu?: number;
  duration?: number;
  concurrency?: number;
  total?: number;
  bytes?: number;
  ramp?: number;
  queue?: number;
  pace?: ThrottleSpec;
  confirm?: boolean;
  keepServers?: boolean;
  headless?: boolean;
  verbose?: boolean;
  failFast?: boolean;
  throttle?: number;
  grep?: string;
  index?: number[];
  type?: Set<'web' | 'mobile'>;
  ftp?: boolean;
  ssh?: boolean;
}

function buildArgs(name: string | undefined, opts: TestOpts): ParsedArgs {
  if (opts.unitTest) {
    if (name) fail('--unit-test takes no fixture name.');
    if (opts.json) fail('--unit-test does not accept --json.');
    if (
      opts.functional ||
      opts.api ||
      opts.image ||
      opts.load ||
      opts.headless ||
      opts.verbose ||
      opts.failFast ||
      opts.grep !== undefined ||
      opts.index !== undefined ||
      opts.type !== undefined ||
      opts.throttle !== undefined ||
      opts.loadProfile !== undefined ||
      opts.vu !== undefined ||
      opts.duration !== undefined ||
      opts.keepServers
    ) {
      fail('--unit-test cannot be combined with Patchright, load, lock, or fixture flags.');
    }
    return { kind: 'unit-test' };
  }

  if (opts.mode === 'prod') fail('tests do not accept --prod');
  if (opts.mode !== 'dev' && opts.mode !== 'preprod') fail('tests require --dev or --preprod');
  const functional = Boolean(opts.functional);
  const api = Boolean(opts.api);
  const image = Boolean(opts.image);
  const load = Boolean(opts.load);
  const json = Boolean(opts.json);

  if (opts.mode === 'preprod') {
    if (opts.ftp && opts.ssh) fail('--ftp and --ssh are mutually exclusive.');
    if (!opts.ftp && !opts.ssh) fail('--preprod tests require exactly one of --ftp or --ssh.');
    if (name) fail('--preprod only accepts --functional (no fixtures or lock).');
    if (!functional) fail('--preprod requires --functional.');
    if (api || load || image) fail('--preprod does not accept --api, --load, or --image.');
    if (opts.type?.has('web')) fail('--preprod functional tests are mobile-only.');
    if (opts.index) fail('--preprod does not accept --index.');
    return {
      kind: 'patchright',
      mode: 'preprod',
      functional: true,
      api: false,
      load: false,
      loadProfile: 'smoke',
      loadVus: 1,
      loadDurationSec: 1,
      keepServers: false,
      headless: Boolean(opts.headless),
      verbose: Boolean(opts.verbose),
      throttleMs: opts.throttle ?? 500,
      failFast: Boolean(opts.failFast),
      grep: opts.grep ?? null,
      indexes: null,
      testTypes: new Set(['mobile']),
      typeSpecified: true,
      transport: opts.ssh ? 'ssh' : 'ftp',
    };
  }

  if (opts.ftp || opts.ssh) fail('--ftp and --ssh are only valid with --preprod.');

  if (name === 'lock') {
    if (functional || load || json) {
      fail('`lock` does not accept --functional, --load, or --json.');
    }
    if (opts.grep !== undefined || opts.index !== undefined || opts.type !== undefined) {
      fail('`lock` does not accept --grep, --index, or --type.');
    }
    if (opts.headless || opts.verbose || opts.failFast || opts.throttle !== undefined) {
      fail('`lock` does not accept --headless, --verbose, --fail-fast, or --throttle.');
    }
    if (opts.loadProfile !== undefined || opts.vu !== undefined) {
      fail('`lock` does not accept --load-profile or --vu.');
    }
    const durationSec = opts.duration ?? 0;
    if (durationSec < 0 || durationSec > 3600) {
      fail('--duration requires an integer from 0 to 3600 (seconds).');
    }
    if (opts.pace?.betweenMs !== undefined && opts.queue === undefined) {
      fail('--pace "between:<ms>" requires --queue (a packet is one queue-full of requests).');
    }
    // Neither flag → both phases (plan default).
    const runImage = image || (!image && !api);
    const runApi = api || (!image && !api);
    return {
      kind: 'lock',
      mode: opts.mode,
      image: runImage,
      api: runApi,
      concurrency: opts.concurrency ?? 20,
      total: opts.total ?? 500,
      bytes: opts.bytes ?? 65_536,
      durationSec,
      rampSec: opts.ramp ?? 0,
      queueLimit: opts.queue,
      throttle: opts.pace,
    };
  }

  if (image) {
    fail('--image is only valid with `lock`.');
  }
  if (opts.confirm) {
    fail('--confirm is not used by test (legacy flag).');
  }
  if (
    opts.concurrency !== undefined ||
    opts.total !== undefined ||
    opts.bytes !== undefined ||
    opts.ramp !== undefined ||
    opts.queue !== undefined ||
    opts.pace !== undefined
  ) {
    fail('--concurrency/--total/--bytes/--ramp/--queue/--pace are only valid with `lock`.');
  }

  const envProfile = process.env.PAM_LOAD_PROFILE;
  const loadProfile: LoadProfile =
    opts.loadProfile ??
    (envProfile === 'baseline' || envProfile === 'contention' ? envProfile : 'smoke');

  if (functional || api || load) {
    if (name !== undefined || json) {
      fail('--functional/--api/--load take no fixture name and no --json (see npm run test -- --help).');
    }
    if (opts.loadProfile !== undefined && !load) {
      fail('--load-profile requires --load.');
    }
    if (opts.vu !== undefined && !load) {
      fail('--vu requires --load.');
    }
    if (opts.duration !== undefined && !load) {
      fail('--duration requires --load (or `lock`).');
    }
    if (opts.duration !== undefined && (opts.duration < 1 || opts.duration > 3600)) {
      fail('--duration for --load requires an integer from 1 to 3600 (seconds).');
    }
    const envVus = process.env.PAM_LOAD_VUS ? Number(process.env.PAM_LOAD_VUS) : undefined;
    if (envVus !== undefined && (!Number.isInteger(envVus) || envVus < 1 || envVus > 500)) {
      fail('PAM_LOAD_VUS must be an integer from 1 to 500.');
    }
    const envDuration = process.env.PAM_LOAD_DURATION ? Number(process.env.PAM_LOAD_DURATION) : undefined;
    if (
      envDuration !== undefined &&
      (!Number.isInteger(envDuration) || envDuration < 1 || envDuration > 3600)
    ) {
      fail('PAM_LOAD_DURATION must be an integer from 1 to 3600 (seconds).');
    }
    const loadVus = opts.vu ?? envVus ?? defaultLoadVus(loadProfile);
    if (load && loadProfile === 'contention' && loadVus < 4) {
      fail('--load-profile contention needs at least 4 VUs (--vu 4).');
    }
    const loadDurationSec = opts.duration ?? envDuration ?? defaultLoadDurationSec(loadProfile);
    return {
      kind: 'patchright',
      mode: opts.mode,
      functional,
      api,
      load,
      loadProfile,
      loadVus,
      loadDurationSec,
      keepServers: Boolean(opts.keepServers),
      headless: Boolean(opts.headless),
      verbose: Boolean(opts.verbose),
      throttleMs: opts.throttle ?? 0,
      failFast: Boolean(opts.failFast),
      grep: opts.grep ?? null,
      indexes: opts.index ?? null,
      testTypes: opts.type ?? new Set(['web', 'mobile']),
      typeSpecified: opts.type !== undefined,
      transport: null,
    };
  }

  if (name === undefined)
    fail('a fixture name is required: lock, template-invoice, template-gift-card, or template-email.');

  let command: FixtureCommand;
  if (name === 'template-invoice') command = { kind: 'template-invoice' };
  else if (name === 'template-gift-card') command = { kind: 'template-gift-card' };
  else if (name === 'template-email') command = { kind: 'template-email' };
  else if (name === 'email-all' || name.startsWith('email-')) {
    fail('email fixtures are template-email now.');
  } else fail(`unknown fixture: ${name}`);

  return { kind: 'fixture', command, json, mode: opts.mode };
}

function writeText(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf-8');
}

async function writeMailFiles(
  dir: string,
  variant: 'keys' | 'realistic',
  message: { subject: string; text: string; html?: string },
): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const html =
    message.html ??
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(message.subject)}</title></head><body><pre>${escapeHtml(message.text)}</pre></body></html>\n`;
  const htmlPath = join(dir, `${variant}.html`);
  writeText(htmlPath, html.endsWith('\n') ? html : `${html}\n`);
  return [htmlPath];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function runTemplateInvoice(testDir: string): Promise<string[]> {
  const { writeInvoicePdf } = await import('../src/modules/invoicing/infrastructure/invoicePdf.js');
  const invoiceDir = join(testDir, 'invoice');
  mkdirSync(invoiceDir, { recursive: true });
  const written: string[] = [];

  const variants = [
    { keys: true, multipage: false, voucher: false, scenario: 'standard', name: 'keys-1page.pdf' },
    { keys: true, multipage: false, voucher: true, scenario: 'standard', name: 'keys-1page-voucher.pdf' },
    { keys: true, multipage: true, voucher: false, scenario: 'standard', name: 'keys-multipage.pdf' },
    { keys: true, multipage: true, voucher: true, scenario: 'standard', name: 'keys-multipage-voucher.pdf' },
    { keys: false, multipage: false, voucher: false, scenario: 'standard', name: 'realistic-1page.pdf' },
    {
      keys: false,
      multipage: false,
      voucher: true,
      scenario: 'standard',
      name: 'realistic-1page-voucher.pdf',
    },
    { keys: false, multipage: true, voucher: false, scenario: 'standard', name: 'realistic-multipage.pdf' },
    {
      keys: false,
      multipage: true,
      voucher: true,
      scenario: 'standard',
      name: 'realistic-multipage-voucher.pdf',
    },
    { keys: true, multipage: false, voucher: false, scenario: 'accessory', name: 'keys-1page-accessory.pdf' },
    {
      keys: false,
      multipage: false,
      voucher: false,
      scenario: 'accessory',
      name: 'realistic-1page-accessory.pdf',
    },
    { keys: true, multipage: false, voucher: false, scenario: 'free', name: 'keys-1page-free.pdf' },
    { keys: false, multipage: false, voucher: false, scenario: 'free', name: 'realistic-1page-free.pdf' },
    { keys: true, multipage: false, voucher: false, scenario: 'gift', name: 'keys-1page-gift.pdf' },
    { keys: false, multipage: false, voucher: false, scenario: 'gift', name: 'realistic-1page-gift.pdf' },
  ] as const;

  for (const variant of variants) {
    const path = join(invoiceDir, variant.name);
    await writeInvoicePdf(
      path,
      fixtures.buildInvoiceData({
        keys: variant.keys,
        multipage: variant.multipage,
        voucher: variant.voucher,
        scenario: variant.scenario,
      }),
    );
    written.push(path);
  }

  return written;
}

async function runTemplateGiftCard(testDir: string): Promise<string[]> {
  const { writeGiftShareCardPdf } = await import('../src/modules/gift/infrastructure/giftShareCardPdf.js');
  const { writeGiftShareCardJpeg } = await import('../src/modules/gift/infrastructure/giftShareCardJpeg.js');
  const { GIFT_SHARE_CARD_STYLES } = await import('../src/modules/gift/domain/shareCardStyle.js');
  const giftCardDir = join(testDir, 'gift-card');
  mkdirSync(giftCardDir, { recursive: true });
  const written: string[] = [];
  const copies = fixtures.GIFT_SHARE_CARD_FIXTURE_COPIES;

  for (const style of GIFT_SHARE_CARD_STYLES) {
    for (const copy of copies) {
      const data = fixtures.buildGiftShareCardData({ copy, style });
      const pdfPath = join(giftCardDir, `${copy}-${style}.pdf`);
      const jpegPath = join(giftCardDir, `${copy}-${style}.jpg`);
      await writeGiftShareCardPdf(pdfPath, data);
      await writeGiftShareCardJpeg(jpegPath, data);
      written.push(pdfPath, jpegPath);
    }
  }

  return written;
}

async function renderEmailKind(
  emailKind: EmailKind,
  keys: boolean,
): Promise<{ subject: string; text: string; html?: string }> {
  const email = await import('../src/modules/messaging/application/email.js');

  switch (emailKind) {
    case 'invoice':
      return email.invoiceEmail(fixtures.invoiceEmailArgs(keys), 'fr');
    case 'account-created': {
      const args = fixtures.emailConfirmationArgs(keys);
      return email.emailConfirmationEmail(args.link, 'fr');
    }
    case 'auth-otp':
      return email.authOtpEmail(fixtures.emailConfirmationArgs(keys).otp, 'fr');
    case 'password-forgot':
      return email.passwordResetEmail(fixtures.passwordResetArgs(keys), 'fr');
    case 'loyalty-expiry': {
      const args = fixtures.loyaltyExpiryArgs(keys);
      return email.loyaltyExpiryReminderEmail('fr', args.atRisk, args.expiresAt);
    }
    case 'order-confirmation':
      return email.orderConfirmationEmail(fixtures.buildOrderEmailData(keys, true), 'fr', false);
    case 'order-confirmation-guest':
      return email.orderConfirmationEmail(fixtures.buildOrderEmailData(keys, true), 'fr', true);
    case 'order-updated':
      return email.orderUpdatedEmail(fixtures.buildOrderEmailData(keys, true), 'fr');
    case 'order-cancelled':
      return email.orderCancelledEmail(fixtures.buildOrderEmailData(keys, true), 'fr');
    case 'order-received':
      return email.orderReceivedEmail(fixtures.invoiceEmailArgs(keys), 'fr');
    case 'order-received-guest':
      return email.invoiceEmail(fixtures.invoiceEmailArgs(keys), 'fr', true);
    case 'order-status-preparing':
      return email.orderStatusUpdateEmail(fixtures.invoiceEmailArgs(keys), 'in_preparation', 'fr');
    case 'order-status-to-send':
      return email.orderStatusUpdateEmail(fixtures.invoiceEmailArgs(keys), 'to_send', 'fr');
    case 'order-return-resolved': {
      const args = fixtures.orderReturnArgs(keys);
      const returns = await import('../src/modules/orders/application/returns/orderReturnEmail.js');
      return returns.orderReturnResolvedEmail(
        args.orderNumber,
        args.refundAmountCents,
        args.courierRetainedCents,
        'fr',
      );
    }
    case 'account-deleted':
      return email.deletionRequestedEmail(fixtures.deletionRequestedArgs(keys), 'fr');
    case 'order-shipped':
      return email.orderShippedEmail(fixtures.buildOrderEmailData(keys, false), 'fr');
    case 'deletion-reminder': {
      const args = fixtures.deletionReminderArgs(keys);
      return email.deletionReminderEmail(args.daysLeft, args.scheduledForDate, 'fr');
    }
    case 'change-security': {
      const args = fixtures.emailChangeSecurityArgs(keys);
      return email.emailChangeSecurityNoticeEmail(args.newEmail, args.lockUrl, 'fr');
    }
    case 'contact':
      return email.contactMessageEmail(fixtures.contactMessageData(keys));
    case 'contact-reply':
      return email.unconnectedContactReplyEmail(fixtures.contactReplyArgs(keys), 'fr');
    case 'product-request-accepted':
      return email.productRequestResponseEmail({ ...fixtures.productRequestResponseData(keys, true), language: 'fr' });
    case 'product-request-declined':
      return email.productRequestResponseEmail({ ...fixtures.productRequestResponseData(keys, false), language: 'fr' });
    case 'gift-share-card': {
      const giftMail = await import('../src/modules/gift/infrastructure/giftMail.js');
      const args = fixtures.giftGiverMailArgs(keys);
      return giftMail.giverShareCardEmail(args);
    }
    case 'gift-cancelled': {
      const giftMail = await import('../src/modules/gift/infrastructure/giftMail.js');
      const args = fixtures.giftGiverMailArgs(keys);
      return giftMail.giftCancelledEmail({ receiverName: args.receiverName, language: args.language });
    }
    case 'gift-promise': {
      const giftMail = await import('../src/modules/gift/infrastructure/giftMail.js');
      const args = fixtures.giftGiverMailArgs(keys);
      return giftMail.giverPromiseEmail({
        giverToken: args.giverToken,
        language: args.language,
        receiverName: args.receiverName,
        holdExpiresAt: args.validUntil,
        validUntil: args.validUntil,
      });
    }
    case 'gift-reminder-hold': {
      const giftMail = await import('../src/modules/gift/infrastructure/giftMail.js');
      const args = fixtures.giftGiverMailArgs(keys);
      return giftMail.giftReminderEmail({ ...args, kind: 'hold' });
    }
    case 'gift-reminder-pay': {
      const giftMail = await import('../src/modules/gift/infrastructure/giftMail.js');
      const args = fixtures.giftGiverMailArgs(keys);
      return giftMail.giftReminderEmail({ ...args, kind: 'pay' });
    }
    case 'gift-reminder-select': {
      const giftMail = await import('../src/modules/gift/infrastructure/giftMail.js');
      const { GIFT_EXTEND_DAYS } = await import('../src/modules/gift/domain/extend.js');
      const args = fixtures.giftGiverMailArgs(keys);
      return giftMail.giftSelectReminderEmail({ ...args, extendDays: GIFT_EXTEND_DAYS });
    }
    case 'chat-reply': {
      const preview = fixtures.chatReplyPreview(keys).slice(0, 240);
      return {
        subject: 'Lumen vous a répondu',
        text: `Lumen vous a répondu dans votre conversation.\n\n${preview}\n\nConnectez-vous à Lumen pour lire et répondre.`,
      };
    }
    case 'spy-account-created':
      return email.accountCreatedSpyEmail(fixtures.accountCreatedSpyData(keys));
    case 'spy-login':
      return email.loginSpyEmail(fixtures.loginSpyData(keys));
    case 'spy-email-changed':
      return email.emailChangedSpyEmail(fixtures.emailChangedSpyData(keys));
    case 'spy-account-deletion':
      return email.accountDeletionRequestedSpyEmail(fixtures.accountDeletionSpyData(keys));
    case 'spy-order-confirmation': {
      const meta = fixtures.orderConfirmationSpyMeta(keys);
      return email.orderConfirmationSpyEmail(
        fixtures.buildOrderEmailData(keys, true),
        meta.customerEmail,
        meta.userId,
      );
    }
    case 'spy-order-updated': {
      const meta = fixtures.orderConfirmationSpyMeta(keys);
      return email.orderUpdatedSpyEmail(
        fixtures.buildOrderEmailData(keys, true),
        meta.customerEmail,
        meta.userId,
      );
    }
    case 'spy-order-cancelled': {
      const meta = fixtures.orderConfirmationSpyMeta(keys);
      return email.orderCancelledSpyEmail(
        fixtures.buildOrderEmailData(keys, true),
        meta.customerEmail,
        meta.userId,
      );
    }
    case 'spy-payment-failed':
      return email.paymentFailedSpyEmail(fixtures.paymentFailedSpyData(keys));
    case 'spy-payment-authorization-expired':
      return email.paymentAuthorizationExpiredSpyEmail(fixtures.paymentAuthorizationExpiredSpyData(keys));
    case 'spy-payment-authorization-expiring': {
      const paymentAuthExpiryEmail =
        await import('../src/modules/messaging/application/paymentAuthExpiryEmail.js');
      return paymentAuthExpiryEmail.paymentAuthorizationExpiringSpyEmail(
        fixtures.paymentAuthorizationExpiringSpyData(keys),
      );
    }
    case 'spy-cart-abandoned':
      return email.cartAbandonedSpyEmail(fixtures.cartAbandonedSpyData(keys));
    case 'spy-gift-created': {
      const giftMail = await import('../src/modules/gift/infrastructure/giftMail.js');
      return giftMail.giftCreatedSpyEmail(fixtures.giftCreatedSpyData(keys));
    }
    case 'spy-product-request':
      return email.productRequestSpyEmail(fixtures.productRequestSpyData(keys));
    case 'spy-rate-limited':
      return email.rateLimitedSpyEmail(fixtures.rateLimitedSpyData(keys));
    case 'chat-owner-notification':
      return {
        subject: `[Lumen Chat #A1B2C3D4 0.0.0] Nouveau message`,
        text: `<?xml version="1.0" encoding="UTF-8"?>
<pamsurin-chat version="0.0.0" session="A1B2C3D4">
  <visitor role="user">
    <email>visitor@example.com</email>
    <identity>Client de démonstration</identity>
    <account>00000000-0000-4000-8000-000000000000</account>
  </visitor>
  <messages>
    <user>Bonjour, j’ai une question concernant ma commande.</user>
    <pamsurin>Bonjour, je vais vous aider.</pamsurin>
  </messages>
</pamsurin-chat>`,
      };
    default: {
      const _exhaustive: never = emailKind;
      throw new Error(`unknown email kind: ${_exhaustive}`);
    }
  }
}

async function runEmailKind(testDir: string, emailKind: EmailKind): Promise<string[]> {
  const dir = join(testDir, emailKind);
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const variant of ['keys', 'realistic'] as const) {
    const message = await renderEmailKind(emailKind, variant === 'keys');
    written.push(...(await writeMailFiles(dir, variant, message)));
  }
  return written;
}

async function runFixture(args: Extract<ParsedArgs, { kind: 'fixture' }>): Promise<void> {
  process.env.APP_TARGET = args.mode;
  await import('../src/config/env.js');
  // Fixture renders are review artefacts, not private application data. Keep
  // both invoice PDFs and email previews in the shared test output tree.
  const testDir = join(root, 'output/test/emails');
  mkdirSync(testDir, { recursive: true });

  const written: string[] = [];

  if (args.command.kind === 'template-invoice') {
    written.push(...(await runTemplateInvoice(testDir)));
  }
  if (args.command.kind === 'template-gift-card') {
    written.push(...(await runTemplateGiftCard(testDir)));
  }

  const emailKinds: EmailKind[] = args.command.kind === 'template-email' ? ALL_EMAIL_KINDS : [];

  for (const emailKind of emailKinds) {
    written.push(...(await runEmailKind(testDir, emailKind)));
  }

  if (args.json) {
    printJson({ success: true, mode: args.mode, testDir, written });
  } else {
    log(false, `[test] mode=${args.mode} testDir=${testDir}`);
    for (const path of written) log(false, `  wrote ${path}`);
    log(false, `[test] done (${written.length} files)`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Copy-paste prefix for the live reporter's end-of-run failure line.
 * Only `--dev` supports `--index`; preprod is title-only and skips this.
 * Omits `--grep` / `--index` / `--type` / `--fail-fast` so the printed
 * command can re-run every failed index from a full or filtered matrix.
 */
function patchrightRerunBase(args: Extract<ParsedArgs, { kind: 'patchright' }>): string | undefined {
  if (args.mode !== 'dev') return undefined;
  if (!args.functional && !args.api) return undefined;
  const parts = ['npm run test --', '--dev'];
  if (args.functional) parts.push('--functional');
  if (args.api) parts.push('--api');
  if (args.headless) parts.push('--headless');
  if (args.verbose) parts.push('--verbose');
  if (args.throttleMs > 0) parts.push(`--throttle ${args.throttleMs}`);
  return parts.join(' ');
}

/** Patchright `--list` joins describe/test titles with ` › `. `--grep` matches
 * `_grepTitleWithTags()`, which joins the same path with spaces. Passing the
 * list title unchanged matches nothing, so `--index 15` runs 0 tests. */
function grepPatternFromListTitle(title: string): string {
  return escapeRegExp(title.split(/\s*›\s*/u).join(' '));
}

/** Spec files that import a helper which calls `test()`. Patchright's CLI
 * file filter loads `*.spec.ts` entries, not the helper path `--list` prints,
 * so passing `loyaltySuites.ts:105` silently drops those indexes. */
function specFilesImporting(testRoot: string, listedFile: string): string[] {
  const base = listedFile.replace(/\.[cm]?[jt]sx?$/, '').split('/').pop() ?? listedFile;
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'support') continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.spec.ts')) continue;
      if (readFileSync(full, 'utf8').includes(base)) found.push(full);
    }
  };
  walk(testRoot);
  return found;
}

const specEntrypointCache = new Map<string, string[]>();

/** CLI path Patchright will actually load. Spec call sites stay `file:line`.
 * Helper call sites become the importing spec (no line): grep then keeps the
 * requested titles, and the file filter no longer drops them. */
function cliPathsForListedTest(
  testRoot: string,
  listedFile: string,
  location: string,
  project: string,
): string[] {
  if (listedFile.endsWith('.spec.ts')) return [location];
  const cacheKey = `${testRoot}\0${listedFile}`;
  let specs = specEntrypointCache.get(cacheKey);
  if (!specs) {
    specs = specFilesImporting(testRoot, listedFile);
    specEntrypointCache.set(cacheKey, specs);
  }
  const forProject =
    project === 'functional-handset'
      ? specs.filter((file) => file.includes(`${sep}mobile${sep}`))
      : specs.filter((file) => !file.includes(`${sep}mobile${sep}`));
  const chosen = forProject.length > 0 ? forProject : specs;
  return chosen.length > 0 ? chosen : [location];
}

/** Patchright's clean reporter numbers tests in its collected order. Resolve
 * those same one-based positions to file locations before the real run, so
 * `--index "2 5"` remains a precise shortcut without inventing permanent
 * IDs that would go stale as specs are added or reordered. */
function locationsForSelection(
  playwrightArgs: string[],
  indexes: number[] | null,
  testTypes: Set<'web' | 'mobile'>,
  testRoot: string,
  testSuite: 'dev',
): { locations: string[]; titles: string[]; indexOverrides: Record<string, string> } {
  // Override the configured live reporter: it intentionally prints only
  // progress, while Patchright's list reporter exposes file:line locations.
  const listed = spawnSync('npx', [...playwrightArgs, '--list', '--reporter=list'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, APP_TARGET: testSuite, PAM_TEST_SUITE: testSuite },
  });
  if (listed.status !== 0) {
    process.stderr.write(listed.stderr);
    throw new Error('[test] Patchright --list failed; cannot resolve --index/--type.');
  }
  const tests = listed.stdout
    .split('\n')
    .map((line) => line.match(/^\s*\[([^\]]+)\] › (.+):(\d+):\d+ › (.+)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    // Setup and teardown are dependencies of the functional projects, so
    // `--list` prints them, but the live reporter does not number them.
    // Helper registrations (loyaltySuites.ts) stay: their title path still
    // contains the importing `*.spec.ts`, which is what the reporter counts.
    .filter((match) => match[1] !== 'functional-setup' && match[1] !== 'functional-teardown')
    .map((match) => ({
      project: match[1]!,
      listedFile: match[2]!,
      location: `${join(testRoot, match[2]!)}:${match[3]}`,
      title: match[4]!,
      mobile: /\bmobile\b/i.test(match[0]),
    }));
  const grouped = new Map<string, typeof tests>();
  for (const listedTest of tests) {
    const group = grouped.get(listedTest.location) ?? [];
    group.push(listedTest);
    grouped.set(listedTest.location, group);
  }
  for (const [location, group] of grouped) {
    const hasWeb = group.some((test) => !test.mobile);
    const hasMobile = group.some((test) => test.mobile);
    if (!hasWeb || !hasMobile) continue;
    // Shared helpers (e.g. loyaltySuites) may register web + mobile from one
    // `test(\`${surface}…\`)` line. Titles still distinguish the surfaces for
    // 1–1000 / 1001–2000 numbering; do not abort selection.
    console.error(
      `[test] warning: ${location} registers both desktop and mobile tests on one source line ` +
        `(${group.map((test) => test.title).join('; ')}). Prefer separate test() lines.`,
    );
  }
  const web = tests.filter((test) => !test.mobile);
  const mobile = tests.filter((test) => test.mobile);
  // Key by file:line plus title so a focused run keeps the canonical number.
  const overrideKey = (test: { location: string; title: string }): string =>
    `${test.location}::${test.title}`;
  // Preserve the canonical number even when Patchright receives only a
  // type-filtered (or grep-filtered) subset. Without this, the reporter
  // renumbered a selected test from one, which made `--index 15` print as 1.
  const canonicalOverrides: Record<string, string> = {};
  for (const [index, test] of web.entries()) canonicalOverrides[overrideKey(test)] = String(index + 1);
  for (const [index, test] of mobile.entries()) canonicalOverrides[overrideKey(test)] = String(index + 1001);
  if (!indexes) {
    return {
      locations: tests
        .filter((test) => (test.mobile ? testTypes.has('mobile') : testTypes.has('web')))
        .flatMap((test) =>
          cliPathsForListedTest(testRoot, test.listedFile, test.location, test.project),
        ),
      titles: [],
      indexOverrides: canonicalOverrides,
    };
  }
  const locations: string[] = [];
  const titles: string[] = [];
  const indexOverrides: Record<string, string> = {};
  for (const index of new Set(indexes)) {
    const isMobile = index >= 1001;
    const type = isMobile ? 'mobile' : 'web';
    const localIndex = isMobile ? index - 1001 : index - 1;
    const candidates = isMobile ? mobile : web;
    if (!testTypes.has(type) || !candidates[localIndex]) {
      throw new Error(
        `[test] --index ${index} is unavailable for --type "${[...testTypes].join(' ')}" ` +
          `(web: 1–${web.length} within 1–1000; mobile: 1001–${1000 + mobile.length} within 1001–2000).`,
      );
    }
    const selected = candidates[localIndex]!;
    locations.push(
      ...cliPathsForListedTest(testRoot, selected.listedFile, selected.location, selected.project),
    );
    titles.push(selected.title);
    indexOverrides[overrideKey(selected)] = String(index);
  }
  return { locations, titles, indexOverrides };
}

function assertK6Available(): void {
  const result = spawnSync('k6', ['version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(
      '[test] k6 is required for --load (install k6 ≥ 0.57 and ensure it is on PATH: https://grafana.com/docs/k6/latest/set-up/install-k6/).',
    );
  }
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const match = out.match(/k6\s+v?(\d+)\.(\d+)/i);
  if (!match) {
    throw new Error(`[test] could not parse k6 version from: ${out.trim() || '(empty)'}`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  // Native TypeScript support landed in k6 v0.57.
  if (major === 0 && minor < 57) {
    throw new Error(`[test] k6 ≥ 0.57 required for TypeScript load scripts (found ${match[0]}).`);
  }
}

async function runK6Load(args: {
  apiBaseUrl: string;
  databaseUrl: string;
  scarce: ScarceFixture | undefined;
  loadProfile: LoadProfile;
  loadVus: number;
  loadDurationSec: number;
  loadDir: string;
  voucherCodes: string[];
  emailUserDir: string;
}): Promise<number> {
  mkdirSync(args.loadDir, { recursive: true });
  mkdirSync(args.emailUserDir, { recursive: true });
  const summaryPath = join(args.loadDir, 'summary.json');
  const scriptPath = join(root, 'src-test/dev/load/suite.ts');
  const split: Record<string, number> =
    args.loadProfile === 'contention' ? { ...allocateContentionVus(args.loadVus) } : { ...allocateLoadVus(args.loadVus) };
  const splitText = Object.entries(split)
    .filter(([key]) => key !== 'total')
    .map(([key, vus]) => `${key}=${vus}`)
    .join(' ');
  const mailHelper = await startLoadMailHelper(args.emailUserDir);
  console.error(
    `[test] k6 load profile=${args.loadProfile} vus=${args.loadVus} duration=${args.loadDurationSec}s ` +
      `(${splitText}) script=${scriptPath}`,
  );
  const startedAt = new Date();
  const sampler = await startDbSampler(args.databaseUrl, join(args.loadDir, 'db-metrics.json'));
  try {
    const k6Code: number = await new Promise((resolve) => {
      const child = spawn('k6', ['run', scriptPath, '--summary-export', summaryPath], {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          BASE_URL: args.apiBaseUrl,
          PAM_API_BASE_URL: args.apiBaseUrl,
          PAM_LOAD_PROFILE: args.loadProfile,
          PAM_LOAD_VUS: String(args.loadVus),
          PAM_LOAD_DURATION: String(args.loadDurationSec),
          PAM_LOAD_VOUCHER_CODE: args.voucherCodes[0] ?? '',
          PAM_LOAD_VOUCHER_CODES: args.voucherCodes.join(','),
          PAM_LOAD_PASSWORD: process.env.PAM_LOAD_PASSWORD ?? 'E2eTest1!',
          PAM_LOAD_MAIL_HELPER_URL: mailHelper.url,
          ...(args.scarce
            ? {
                PAM_LOAD_SCARCE_PRODUCT_ID: args.scarce.productId,
                PAM_LOAD_SCARCE_PRODUCT_UID: args.scarce.productUid,
                PAM_LOAD_SCARCE_SHAPE: args.scarce.shapeKey,
                PAM_LOAD_SCARCE_LENGTH: args.scarce.lengthKey,
                PAM_LOAD_SCARCE_SIZE: args.scarce.size,
                PAM_LOAD_SCARCE_VOUCHER: args.scarce.voucherCode,
              }
            : {}),
        },
      });
      child.on('close', (code) => resolve(code ?? 1));
    });
    const metrics = await sampler.stop();
    console.error(
      `[test] database: peak ${metrics.peak.connections} connection(s), ${metrics.peak.waitingOnLock} waiting on a lock, ` +
        `${metrics.deadlocks} deadlock(s)`,
    );
    const invariants = await checkLoadInvariants(args.databaseUrl, startedAt, join(args.loadDir, 'invariants.json'));
    const broken = invariants.filter((result) => !result.ok);
    for (const result of broken) {
      console.error(`[test] INVARIANT BROKEN ${result.name}: ${JSON.stringify(result.violations)}`);
    }
    console.error(`[test] invariants: ${invariants.length - broken.length}/${invariants.length} held`);
    console.error(`[test] k6 summary: ${summaryPath}`);
    const htmlPath = writeLoadHtmlReport(args.loadDir);
    if (htmlPath) console.error(`[test] k6 HTML report: ${htmlPath}`);
    if (k6Code !== 0) return k6Code;
    return broken.length > 0 || metrics.deadlocks > 0 ? 1 : 0;
  } finally {
    await sampler.stop().catch(() => undefined);
    mailHelper.close();
  }
}

type EmailFolderData = { enabled?: boolean };
type RelaxRateLimitsData = { enabled?: boolean };

/** Gateway `/healthz` must answer quickly. `/operation/*` may start loopback
 * opsServer first (PHP waits up to 120s). Use curl (connect + max-time), not
 * native `fetch`: Happy Eyeballs must be free to use IPv6 when this network
 * refuses IPv4:443 to the LWS host. */
const PREPROD_GATEWAY_HEALTH_TIMEOUT_SEC = 20;
const PREPROD_OPS_PROXY_TIMEOUT_SEC = 150;

/** A spawned loopback opsServer that is still importing its routers answers
 * nothing at all, so the gateway reports it as unavailable. That is worth one
 * more attempt: the next request resumes waiting on the same warming process
 * instead of starting from a cold filesystem. */
const PREPROD_OPS_COLD_ATTEMPTS = 3;

/** Transport chosen on the command line, read by every ops call below.
 * Module state rather than a parameter because the restore paths (finally,
 * signal handlers) call these helpers from far away. */
let preprodTransport: PreprodTransport = 'ftp';
/** Set once the `--ssh` port forward is up; unused with `--ftp`. */
let preprodTunnelBaseUrl: string | undefined;

function preprodGatewayTarget(): { gateway: string; token: string } {
  const publicEnv = loadPublicEnv(root, 'preprod');
  const gateway = (publicEnv.OPS_GATEWAY_URL ?? '').replace(/\/$/, '');
  if (!gateway) fail('OPS_GATEWAY_URL is missing from preprod public env.');
  const token = loadOpsToken(root, 'preprod');
  if (!token) fail('OPS_TOKEN is required for --preprod tests.');
  return { gateway, token };
}

/** Where `/operation/*` lives for this run: the PHP gateway on `--ftp`, the
 * local end of the SSH forward on `--ssh`. Both require the same Bearer
 * token — a tunnel alone does not authenticate. */
function preprodOpsTarget(): { baseUrl: string; token: string; what: string } {
  if (preprodTransport === 'ssh') {
    if (!preprodTunnelBaseUrl) fail('the SSH ops tunnel is not open.');
    const token = loadOpsToken(root, 'preprod');
    if (!token) fail('OPS_TOKEN is required for --preprod tests.');
    return { baseUrl: preprodTunnelBaseUrl, token, what: 'SSH ops tunnel' };
  }
  const { gateway, token } = preprodGatewayTarget();
  return { baseUrl: gateway, token, what: 'PHP ops gateway' };
}

async function curlPreprodOps(
  method: 'GET' | 'PUT',
  path: string,
  opts: { body?: unknown; maxTimeSec: number; label?: string },
): Promise<{ status: number; json: Record<string, unknown> }> {
  const { baseUrl: gateway, token, what } = preprodOpsTarget();
  const args = [
    '--silent',
    '--show-error',
    '--connect-timeout',
    '10',
    '--max-time',
    String(opts.maxTimeSec),
    '-H',
    `Authorization: Bearer ${token}`,
    '-H',
    'Accept: application/json',
    '-X',
    method,
    '-w',
    '\n%{http_code}',
  ];
  if (opts.body !== undefined) {
    args.push('-H', 'Content-Type: application/json', '--data-raw', JSON.stringify(opts.body));
  }
  args.push(`${gateway}${path}`);

  // Cold loopback opsServer can sit quiet for up to ~120s. A sync curl looks
  // frozen; heartbeats show the wait is still alive.
  const startedAt = Date.now();
  const label = opts.label ?? `${method} ${path}`;
  const { combined, stderrText, exitCode } = await new Promise<{
    combined: string;
    stderrText: string;
    exitCode: number | null;
  }>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const heartbeat = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
      console.error(
        `[test] still waiting on ${label} (${elapsedSec}s / ${opts.maxTimeSec}s). Cold loopback opsServer can take up to ~120s.`,
      );
    }, 15_000);
    child.on('error', (error) => {
      clearInterval(heartbeat);
      reject(error);
    });
    child.on('close', (code) => {
      clearInterval(heartbeat);
      resolve({ combined: stdout, stderrText: stderr, exitCode: code });
    });
  });

  if (exitCode !== 0) {
    const detail = stderrText.trim() || 'connection failed or timed out';
    fail(`${what} ${method} ${path} failed: ${detail}`);
  }
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= 5_000) {
    console.error(`[test] ${label} answered in ${(elapsedMs / 1000).toFixed(1)}s`);
  }
  const newline = combined.lastIndexOf('\n');
  const statusText = (newline >= 0 ? combined.slice(newline + 1) : combined).trim();
  const text = newline >= 0 ? combined.slice(0, newline) : '';
  const status = Number(statusText);
  if (!Number.isInteger(status) || status < 100) {
    fail(`${what} ${method} ${path} returned no HTTP status`);
  }
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  return { status, json };
}

async function assertPreprodOpsGateway(): Promise<void> {
  const { gateway } = preprodGatewayTarget();
  console.error(`[test] checking PHP ops gateway ${gateway}/healthz`);
  const { status, json } = await curlPreprodOps('GET', '/healthz', {
    maxTimeSec: PREPROD_GATEWAY_HEALTH_TIMEOUT_SEC,
    label: 'GET /healthz',
  });
  if (status === 401 || status === 403) {
    fail(`PHP ops gateway rejected OPS_TOKEN at ${gateway}/healthz (HTTP ${status}).`);
  }
  if (status !== 200 || json.ok !== true) {
    fail(
      `PHP ops gateway did not answer at ${gateway}/healthz (HTTP ${status}). --ftp tests need that gateway; ` +
        'install it with `npm run deploy -- --ftp --preprod --ftp-ops`.',
    );
  }
}

/** True while the gateway is still waiting on a loopback opsServer that has
 * not finished importing its routers. */
function isOpsWarmingUp(status: number, json: Record<string, unknown>): boolean {
  if (status !== 502 && status !== 503) return false;
  const code = (json.error as { code?: unknown } | undefined)?.code;
  return code === 'ops_unavailable' || code === 'ops_starting';
}

async function preprodOpsJson(
  method: 'GET' | 'PUT',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  // The SSH transport waits for readiness once, when the tunnel opens, so
  // only the gateway needs the retry.
  const attempts = preprodTransport === 'ftp' ? PREPROD_OPS_COLD_ATTEMPTS : 1;
  let last: { status: number; json: Record<string, unknown> } | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await curlPreprodOps(method, path, {
      body,
      maxTimeSec: PREPROD_OPS_PROXY_TIMEOUT_SEC,
      label: `${method} ${path}`,
    });
    if (!isOpsWarmingUp(last.status, last.json) || attempt === attempts) return last;
    console.error(
      `[test] preprod opsServer is still starting (attempt ${attempt}/${attempts}) — retrying ${method} ${path}`,
    );
  }
  return last as { status: number; json: Record<string, unknown> };
}

async function readPreprodEmailFolderEnabled(): Promise<boolean> {
  const { status, json } = await preprodOpsJson('GET', '/operation/email-folder');
  if (status === 404) {
    fail(
      'GET /operation/email-folder is not on this preprod. Deploy the ops email-folder routes before running --preprod tests.',
    );
  }
  if (status !== 200 || json.success !== true) {
    fail(`could not read preprod email-folder state: HTTP ${status} ${JSON.stringify(json)}`);
  }
  const data = json.data as EmailFolderData | undefined;
  return data?.enabled === true;
}

async function writePreprodEmailFolderEnabled(enabled: boolean): Promise<void> {
  const { status, json } = await preprodOpsJson('PUT', '/operation/email-folder', { enabled });
  if (status !== 200 || json.success !== true) {
    fail(`could not set preprod email-folder enabled=${enabled}: HTTP ${status}`);
  }
}

/** Polls the real public API (not the ops gateway) until it answers
 * healthy — `PUT /operation/email-folder` restarts the Passenger app, so the
 * caller must wait for the new process to actually be serving requests
 * before pointing Patchright at it. */
async function waitForPreprodHealthy(apiBaseUrl: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${apiBaseUrl}/healthz`);
      if (res.ok) return;
    } catch {
      // Still restarting — keep polling until the deadline.
    }
    if (Date.now() >= deadline)
      fail(`preprod did not become healthy within ${timeoutMs / 1000}s after restart`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function readPreprodRelaxRateLimitsEnabled(): Promise<boolean> {
  const { status, json } = await preprodOpsJson('GET', '/operation/relax-rate-limits');
  if (status === 404) {
    fail(
      'GET /operation/relax-rate-limits is not on this preprod. Deploy the ops relax-rate-limits routes before running --preprod tests.',
    );
  }
  if (status !== 200 || json.success !== true) {
    fail(`could not read preprod relax-rate-limits state: HTTP ${status} ${JSON.stringify(json)}`);
  }
  const data = json.data as RelaxRateLimitsData | undefined;
  return data?.enabled === true;
}

async function writePreprodRelaxRateLimitsEnabled(enabled: boolean): Promise<void> {
  const { status, json } = await preprodOpsJson('PUT', '/operation/relax-rate-limits', { enabled });
  if (status !== 200 || json.success !== true) {
    fail(`could not set preprod relax-rate-limits enabled=${enabled}: HTTP ${status}`);
  }
}

async function runPreprodPatchright(args: Extract<ParsedArgs, { kind: 'patchright' }>): Promise<void> {
  const transport = args.transport ?? 'ftp';
  preprodTransport = transport;
  console.error(`[test] preprod critical-path suite (mobile, --${transport})`);
  const testRoot = join(root, 'src-test', 'preprod');
  assertFunctionalTimeoutPolicy(testRoot);

  const publicEnv = loadPublicEnv(root, 'preprod');
  const reportDir = patchrightReportDir(root, { functional: true, api: false, viewport: 'mobile' });
  const tmpDir = join(root, 'output/test/tmp');
  const browserProfileDir = join(root, 'output/test/browser-profile');
  mkdirSync(reportDir, { recursive: true });
  mkdirSync(reportRoot(root), { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(browserProfileDir, { recursive: true });

  const apiBaseUrl = publicEnv.URL_API_BASE;
  const frontBaseUrl = publicEnv.URL_FRONTEND_BASE;
  const gatewayUrl = (publicEnv.OPS_GATEWAY_URL ?? '').replace(/\/$/, '');
  if (!apiBaseUrl || !frontBaseUrl) {
    fail('preprod public env is missing URL_API_BASE or URL_FRONTEND_BASE.');
  }
  if (transport === 'ftp' && !gatewayUrl) {
    fail('preprod public env is missing OPS_GATEWAY_URL, which --ftp needs.');
  }

  // `--ssh` forwards a local port to the same loopback opsServer the gateway
  // would spawn; the tunnel owns that remote process for the whole run, so
  // it must be closed on every exit path below.
  let opsTunnel: ChildProcess | undefined;
  const closeOpsTunnel = (): void => {
    if (!opsTunnel) return;
    closeOpsSshTunnel(opsTunnel);
    opsTunnel = undefined;
    preprodTunnelBaseUrl = undefined;
  };
  if (transport === 'ssh') {
    const tunnelPort = await freeLocalPort();
    preprodTunnelBaseUrl = `http://127.0.0.1:${tunnelPort}`;
    console.error(
      `[test] front=${frontBaseUrl} api=${apiBaseUrl} ops=ssh://127.0.0.1:${tunnelPort}`,
    );
    console.error(
      `[test] opening the SSH ops tunnel (a cold opsServer can take up to ${OPS_READY_TIMEOUT_REMOTE_MS / 1000}s)…`,
    );
    opsTunnel = spawnOpsSshTunnel('preprod', tunnelPort);
    try {
      await waitForOpsReady(preprodTunnelBaseUrl, opsTunnel, OPS_READY_TIMEOUT_REMOTE_MS);
    } catch (error) {
      closeOpsTunnel();
      fail(`could not reach preprod opsServer over SSH: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.error('[test] SSH ops tunnel ready');
  } else {
    console.error(`[test] front=${frontBaseUrl} api=${apiBaseUrl} gateway=${gatewayUrl}`);
    await assertPreprodOpsGateway();
  }

  // Declared before the folder-mail / rate-limit overrides below so a signal
  // arriving mid-setup (before the Patchright child even exists) can still
  // stop a runner that never started (a no-op) and restore whatever has
  // already been changed.
  let testRunner: ChildProcess | undefined;
  let testRunnerGroupPid: number | undefined;
  const isProcessGroupAlive = (pid: number): boolean => {
    try {
      if (process.platform !== 'win32') process.kill(-pid, 0);
      else process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const signalTestRunner = (pid: number, signal: NodeJS.Signals, group = false): void => {
    try {
      if (group && process.platform !== 'win32') process.kill(-pid, signal);
      else process.kill(pid, signal);
    } catch {
      // The runner may have stopped between the state check and signal.
    }
  };
  const waitForProcessGroupExit = async (pid: number, timeoutMs: number): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && isProcessGroupAlive(pid)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  const stopTestRunner = async (): Promise<void> => {
    const child = testRunner;
    const pid = testRunnerGroupPid ?? child?.pid;
    if (!pid || !isProcessGroupAlive(pid)) {
      testRunnerGroupPid = undefined;
      return;
    }
    console.error('[test] stopping Patchright runner cleanly…');
    if (child?.exitCode === null && child.signalCode === null) signalTestRunner(pid, 'SIGINT');
    else signalTestRunner(pid, 'SIGTERM', true);
    await waitForProcessGroupExit(pid, 5_000);
    if (isProcessGroupAlive(pid)) {
      signalTestRunner(pid, 'SIGTERM', true);
      await waitForProcessGroupExit(pid, 5_000);
    }
    if (isProcessGroupAlive(pid)) signalTestRunner(pid, 'SIGKILL', true);
    testRunnerGroupPid = undefined;
  };

  console.error(
    '[test] reading folder-mail preference via GET /operation/email-folder (cold loopback opsServer can take up to ~120s; heartbeats every 15s)…',
  );
  const previousFolder = await readPreprodEmailFolderEnabled();
  console.error(
    `[test] enabling folder-mail for this run (was ${previousFolder}) — this restarts the preprod app`,
  );
  await writePreprodEmailFolderEnabled(true);
  await waitForPreprodHealthy(apiBaseUrl);
  console.error('[test] reading HTTP rate-limit harness…');
  const previousRelax = await readPreprodRelaxRateLimitsEnabled();
  console.error(`[test] relaxing HTTP rate limits for this run (was ${previousRelax})`);
  await writePreprodRelaxRateLimitsEnabled(true);

  // Both overrides above must always come back to their pre-run value — env
  // var + restart for folder-mail, DB preference for rate limits — no matter
  // how this run ends: normal completion, a thrown error (the try/finally
  // below), or the operator hitting Ctrl-C / the process getting killed
  // (these signal handlers — a signal bypasses finally entirely, so it must
  // redo the same restore itself). Only SIGKILL or a machine crash can skip
  // both, and nothing running inside the killed process could ever defend
  // against that.
  let restoring = false;
  const restorePreprodOverrides = async (): Promise<void> => {
    try {
      await writePreprodRelaxRateLimitsEnabled(previousRelax);
      console.error(`[test] restored preprod relax-rate-limits enabled=${previousRelax}`);
    } catch (error) {
      console.error('[test] failed to restore preprod relax-rate-limits:', error);
    }
    try {
      await writePreprodEmailFolderEnabled(previousFolder);
      console.error(`[test] restored preprod email-folder enabled=${previousFolder}`);
    } catch (error) {
      console.error('[test] failed to restore preprod email-folder:', error);
    }
  };
  let closeRunControls = (): void => {};
  let nestedDisplay: NestedTestDisplay | undefined;
  let closeNestedDisplay: () => Promise<void> = () => nestedDisplay?.close() ?? Promise.resolve();
  const onSignal = (signal: NodeJS.Signals): void => {
    closeRunControls();
    void (async () => {
      if (restoring) return;
      restoring = true;
      console.error(`[test] received ${signal} — stopping and restoring preprod before exit…`);
      await stopTestRunner();
      await closeNestedDisplay();
      await restorePreprodOverrides();
      closeOpsTunnel();
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      process.exit(signal === 'SIGINT' ? 130 : 143);
    })();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  console.error(
    `[test] starting Patchright against ${frontBaseUrl} (API-click throttle=${args.throttleMs}ms, headed Chrome)`,
  );

  const playwrightArgs = [
    'patchright',
    'test',
    '--config',
    join(root, 'patchright.preprod.config.ts'),
    '--project',
    'preprod-handset',
  ];
  if (!args.headless) playwrightArgs.push('--headed');
  if (args.failFast) playwrightArgs.push('--max-failures=1');
  if (args.grep) playwrightArgs.push('--grep', args.grep);

  let exitCode = 1;
  try {
    if (!args.headless) {
      const place = testWindowPosition();
      nestedDisplay = await startNestedTestDisplays({
        root,
        screens: laneDisplayLayout({
          left: place.left,
          top: place.top,
          web: false,
          mobile: true,
          sideBySide: false,
        }),
        throttleMs: args.throttleMs,
        onOpen: (close) => {
          closeNestedDisplay = close;
        },
      });
    }
    const throttleFiles = new Map<RunLaneId, string>();
    const throttleFile = join(tmpDir, 'throttle-ms');
    rememberThrottle(throttleFiles, 'mobile', throttleFile, args.throttleMs);
    let laneQuit = false;
    const controls = attachFunctionalRunControls({
      groupPids: () => (testRunnerGroupPid === undefined ? [] : [testRunnerGroupPid]),
      laneGroupPids: (lane) =>
        lane === 'mobile' && testRunnerGroupPid !== undefined ? [testRunnerGroupPid] : [],
      onQuit: () => onSignal('SIGINT'),
      onQuitLane: () => {
        laneQuit = true;
        const pid = testRunnerGroupPid;
        if (pid === undefined || !isProcessGroupAlive(pid)) return;
        console.error('[test] stopping the handset lane…');
        signalTestRunner(pid, 'SIGINT');
      },
      onState: (state, lane) => nestedDisplay?.setRunState(state, lane),
    });
    connectRunWindow(nestedDisplay, controls, (lane, ms) => publishThrottle(throttleFiles, nestedDisplay, lane, ms));
    closeRunControls = () => controls.close();
    exitCode = await new Promise((resolve) => {
      const child = spawn('npx', playwrightArgs, {
        cwd: root,
        // The parent keeps stdin so p / r / q work. Stdout is piped so the
        // current test title can be copied onto the title bar, then written
        // back to this terminal.
        stdio: ['ignore', 'pipe', 'inherit'],
        detached: process.platform !== 'win32',
        env: headedChildEnv({
          ...process.env,
          APP_TARGET: 'preprod',
          PAM_TEST_MODE: 'preprod',
          PAM_TEST_SUITE: 'preprod',
          PAM_TEST_TRANSPORT: transport,
          PAM_API_BASE_URL: apiBaseUrl,
          PAM_FRONT_BASE_URL: frontBaseUrl,
          PAM_OPS_API_BASE_URL: preprodTunnelBaseUrl ?? gatewayUrl,
          PAM_TEST_REPORT_DIR: reportDir,
          PAM_TEST_TMP_DIR: tmpDir,
          PAM_TEST_BROWSER_PROFILE_DIR: browserProfileDir,
          PAM_FRONT_ROOT: join(root, '../pamsurin-front'),
          PAM_TEST_THROTTLE_MS: String(args.throttleMs),
          PAM_TEST_THROTTLE_FILE: throttleFile,
          PAM_TEST_HEADLESS: args.headless ? '1' : '0',
          PAM_TEST_VERBOSE: args.verbose ? '1' : '0',
          PAM_TEST_WORKERS: '1',
          LOYALTY_VALUE_PER_100: publicEnv.LOYALTY_VALUE_PER_100 ?? process.env.LOYALTY_VALUE_PER_100 ?? '10',
          NODE_OPTIONS: [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first'].filter(Boolean).join(' '),
          ...(nestedDisplay
            ? {
                PAM_TEST_WINDOW_POSITION: '0,0',
                PAM_TEST_CHROME_WINDOW: formatChromeOuterSize('mobile'),
              }
            : {}),
        }, nestedDisplay?.displayFor('mobile')),
      });
      testRunner = child;
      testRunnerGroupPid = child.pid;
      if (laneQuit && child.pid !== undefined) signalTestRunner(child.pid, 'SIGINT');
      pipeLaneLines(child.stdout, (line) => {
        process.stdout.write(`${line}\n`);
        noteRunnerStatus(nestedDisplay, 'mobile', line);
      });
      child.on('close', (code) => {
        if (testRunner === child) testRunner = undefined;
        resolve(code ?? 1);
      });
    });
  } finally {
    closeRunControls();
    await closeNestedDisplay();
    // A signal that arrived while the promise above was pending already ran
    // its own stop+restore and called process.exit — this only executes on
    // the normal completion / thrown-error paths, guarded the same way so
    // the two can never race and double-restore.
    if (!restoring) {
      restoring = true;
      await stopTestRunner();
      await restorePreprodOverrides();
    }
    closeOpsTunnel();
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await patchHtmlReport(reportDir);
    writeReportHub(root);
    console.error(`[test] HTML report: ${reportDir}/index.html`);
    console.error(`[test] report hub: ${reportRoot(root)}/index.html`);
  }
  if (exitCode !== 0) process.exit(exitCode);
}

const laneProgress = new Map<RunLaneId, LaneProgress>();

function noteRunnerStatus(display: NestedTestDisplay | undefined, lane: RunLaneId, line: string): void {
  const status = statusTextFromReporterLine(line);
  if (status) display?.setStatus(lane, status);
  let progress = laneProgress.get(lane);
  if (!progress) {
    progress = createLaneProgress();
    laneProgress.set(lane, progress);
  }
  if (!applyReporterProgress(line, progress)) return;
  display?.setProgress(lane, formatLaneProgress(progress));
}

function pipeLaneLines(stream: NodeJS.ReadableStream | null, write: (line: string) => void): void {
  if (!stream) return;
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) write(line);
  });
  stream.on('end', () => {
    if (pending) write(pending);
  });
}

async function runPatchright(args: Extract<ParsedArgs, { kind: 'patchright' }>): Promise<void> {
  if (args.mode === 'preprod') {
    await runPreprodPatchright(args);
    return;
  }
  const testRoot = join(root, 'src-test', 'dev');
  if (args.functional || args.api) {
    assertFunctionalTimeoutPolicy(testRoot);
  }

  const publicEnv = {
    ...loadEnvFile(root, '.public.env'),
    ...loadEnvFile(root, `${args.mode}/.public.env`),
  };
  let reportDir = patchrightReportDir(root, {
    functional: args.functional,
    api: args.api,
  });
  const loadDir = loadReportDir(root);
  const tmpDir = join(root, 'output/test/tmp');
  // Unlike the database and app servers, the browser profile is deliberately
  // retained. It is a Chrome profile dedicated to this test suite and carries
  // only browser preferences needed for visible functional runs.
  const browserProfileDir = join(root, 'output/test/browser-profile');
  mkdirSync(reportRoot(root), { recursive: true });
  if (args.load) mkdirSync(loadDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(browserProfileDir, { recursive: true });

  const frontRoot = join(root, '../pamsurin-front');
  // Load dumps OTPs into a fresh tree so the mail helper never scans the
  // long-lived output/dev/email-user dump (tens of thousands of HTML files).
  const loadMailRoot = join(root, 'output/test/load-mail');
  const emailUserDir = args.load
    ? join(loadMailRoot, 'email-user')
    : join(
        root,
        publicEnv.DEV_DIR ?? './output/dev',
        (publicEnv.DEV_EMAIL_USER_DIR ?? '/email-user').replace(/^\//, ''),
      );
  const emailSpyDir = args.load
    ? join(loadMailRoot, 'email-spy')
    : join(
        root,
        publicEnv.DEV_DIR ?? './output/dev',
        (publicEnv.DEV_EMAIL_SPY_DIR ?? '/email-spy').replace(/^\//, ''),
      );
  const emailChatDir = args.load
    ? join(loadMailRoot, 'email-chat')
    : join(
        root,
        publicEnv.DEV_DIR ?? './output/dev',
        (publicEnv.DEV_EMAIL_CHAT_DIR ?? '/email-chat').replace(/^\//, ''),
      );
  if (args.load) {
    rmSync(loadMailRoot, { recursive: true, force: true });
    mkdirSync(emailUserDir, { recursive: true });
    mkdirSync(emailSpyDir, { recursive: true });
    mkdirSync(emailChatDir, { recursive: true });
  }

  const listProjects: string[] = [];
  if (args.functional) {
    // Listing always includes both functional projects so 1… / 1001… numbers
    // stay canonical even when the run later drops one project.
    listProjects.push('functional-web', 'functional-handset');
  }
  if (args.api) listProjects.push('api');

  // Resolve --index/--type before the disposable DB and servers exist so an
  // unavailable number cannot leave 4173 / the isolated API occupied.
  let selectedLocations: string[] = [];
  let selectedTitles: string[] = [];
  let indexOverrides: Record<string, string> = {};
  if (listProjects.length > 0 && (args.indexes || args.typeSpecified)) {
    const listArgs = [
      'patchright',
      'test',
      '--config',
      join(root, 'patchright.config.ts'),
      ...listProjects.flatMap((p) => ['--project', p]),
    ];
    if (!args.headless) listArgs.push('--headed');
    if (args.failFast) listArgs.push('--max-failures=1');
    if (args.grep) listArgs.push('--grep', args.grep);
    try {
      const selection = locationsForSelection(listArgs, args.indexes, args.testTypes, testRoot, 'dev');
      selectedLocations = [...new Set(selection.locations)];
      selectedTitles = selection.titles;
      indexOverrides = selection.indexOverrides;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message.startsWith('[test]') ? message : `[test] failed: ${message}`);
      process.exit(1);
    }
  }

  const projects: string[] = [];
  if (args.functional) {
    // `common/` may still contain both viewport titles; each must be its own
    // `test()` line. `--index` below 1001 starts only functional-web.
    const wantWeb = args.indexes ? args.indexes.some((index) => index < 1001) : args.testTypes.has('web');
    const wantMobile = args.indexes
      ? args.indexes.some((index) => index >= 1001)
      : args.testTypes.has('mobile');
    if (wantWeb && args.testTypes.has('web')) projects.push('functional-web');
    if (wantMobile && args.testTypes.has('mobile')) projects.push('functional-handset');
  }
  if (args.api) projects.push('api');
  if (
    args.functional &&
    !projects.includes('functional-web') &&
    projects.includes('functional-handset')
  ) {
    reportDir = patchrightReportDir(root, { functional: true, api: false, viewport: 'mobile' });
  }
  if (args.functional || args.api) mkdirSync(reportDir, { recursive: true });

  const started: Awaited<ReturnType<typeof ensureServers>>['started'] = [];
  const databases: ReturnType<typeof createDisposableTestDatabase>[] = [];
  let database: ReturnType<typeof createDisposableTestDatabase> | undefined;
  // npx can exit before a child Patchright/Chrome process. Keep each detached
  // group's original leader PID so cleanup can still reap that group after
  // the launcher itself has been reaped.
  const runners: { child: ChildProcess; groupPid: number | undefined; lane?: RunLaneId }[] = [];
  let profileDirs = [browserProfileDir];
  const htmlReportDirs = [reportDir];
  const isProcessGroupAlive = (pid: number): boolean => {
    try {
      if (process.platform !== 'win32') process.kill(-pid, 0);
      else process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const signalTestRunner = (pid: number, signal: NodeJS.Signals, group = false): void => {
    try {
      if (group && process.platform !== 'win32') process.kill(-pid, signal);
      else process.kill(pid, signal);
    } catch {
      // The runner may have stopped between the state check and signal.
    }
  };
  const waitForProcessGroupExit = async (pid: number, timeoutMs: number): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && isProcessGroupAlive(pid)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  const stopTestRunners = async (): Promise<void> => {
    const living = runners.filter((runner) => runner.groupPid !== undefined && isProcessGroupAlive(runner.groupPid));
    if (living.length === 0) return;
    // Start with the launcher only, so Patchright can close its browser
    // context cleanly. A process group is a recovery path for descendants
    // which survive after npx itself has exited.
    console.error('[test] stopping Patchright runner cleanly…');
    for (const runner of living) {
      const pid = runner.groupPid!;
      if (runner.child.exitCode === null && runner.child.signalCode === null) signalTestRunner(pid, 'SIGINT');
      else signalTestRunner(pid, 'SIGTERM', true);
    }
    await Promise.all(living.map((runner) => waitForProcessGroupExit(runner.groupPid!, 5_000)));
    const stillAlive = living.filter((runner) => isProcessGroupAlive(runner.groupPid!));
    if (stillAlive.length > 0) {
      console.error('[test] Patchright runner left descendants; sending SIGTERM to its process group…');
      for (const runner of stillAlive) signalTestRunner(runner.groupPid!, 'SIGTERM', true);
      await Promise.all(stillAlive.map((runner) => waitForProcessGroupExit(runner.groupPid!, 5_000)));
    }
    const forced = living.filter((runner) => isProcessGroupAlive(runner.groupPid!));
    if (forced.length > 0) {
      console.error('[test] force-killing remaining Patchright runner processes…');
      for (const runner of forced) signalTestRunner(runner.groupPid!, 'SIGKILL', true);
    }
  };
  let nestedDisplay: NestedTestDisplay | undefined;
  let closeNestedDisplay: () => Promise<void> = async () => undefined;
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = (): Promise<void> => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      // Let the fixture close its persistent Chrome context before stopping the
      // isolated services or ending this parent process. Abrupt parent exit
      // leaves Chrome's profile marked as having crashed.
      await stopTestRunners();
      await closeNestedDisplay();
      // channel:chrome subprocesses (network/gpu/renderer) are not always in the
      // runner's process group once re-parented. Sweep anything still bound to
      // this suite's user-data-dir so remote HTTPS sockets cannot outlive the run.
      for (const profileDir of profileDirs) {
        const swept = await sweepTestBrowserProfile(profileDir);
        if (swept > 0) {
          console.error(`[test] swept ${swept} leftover Chrome process(es) for ${profileDir}`);
        }
      }
      await stopManagedServers(started);
      for (const disposable of databases) destroyDisposableTestDatabase(disposable);
    })();
    return cleanupPromise;
  };
  let interrupting = false;
  let closeRunControls = (): void => {};
  const handleInterrupt = (signal: NodeJS.Signals): void => {
    closeRunControls();
    if (interrupting) {
      console.error('[test] cleanup is already in progress; waiting for it to finish…');
      return;
    }
    interrupting = true;
    console.error(`[test] ${signal} received — stopping this test run…`);
    void cleanup()
      .catch((error) => console.error('[test] interrupted cleanup failed:', error))
      .finally(() => process.exit(130));
  };
  process.on('SIGINT', handleInterrupt);
  process.on('SIGTERM', handleInterrupt);
  const runSideBySideEnvironments = async (lanePlans: TestLanePlan[]): Promise<number> => {
    console.error(
      '[test] desktop and mobile each get a disposable environment and run at the same time',
    );
    profileDirs = lanePlans.map((lane) => join(root, 'output/test/browser-profile', lane.id));
    for (const dir of profileDirs) mkdirSync(dir, { recursive: true });
    const ready: {
      lane: TestLanePlan;
      database: ReturnType<typeof createDisposableTestDatabase>;
      servers: Awaited<ReturnType<typeof ensureServers>>['started'];
      databaseUrl: string;
      apiBaseUrl: string;
      opsBaseUrl: string;
      frontBaseUrl: string;
      mailRoot: string;
    }[] = [];
    for (const lane of lanePlans) {
      console.error(`[test] ${lane.id} environment: shop port ${lane.frontPort}`);
      const mailRoot = join(root, 'output/test', `mail-${lane.id}`);
      const privateDir = join(root, 'output/test', `private-${lane.id}`);
      rmSync(mailRoot, { recursive: true, force: true });
      mkdirSync(join(mailRoot, 'email-user'), { recursive: true });
      mkdirSync(join(mailRoot, 'email-spy'), { recursive: true });
      mkdirSync(join(mailRoot, 'email-chat'), { recursive: true });
      mkdirSync(privateDir, { recursive: true });
      const laneDatabase = createDisposableTestDatabase();
      databases.push(laneDatabase);
      await migrateTestDatabase(args.mode, laneDatabase.url);
      const servers = await ensureServers(root, args.mode, {
        needFront: true,
        frontRoot,
        database: laneDatabase,
        frontPort: lane.frontPort,
        onStarted: (server) => started.push(server),
        apiEnv: {
          AUTH_OTP_MAX_ATTEMPTS: '5',
          LOGIN_LOCKOUT: '1s:5',
          DEV_DIR: mailRoot,
          DEV_EMAIL_USER_DIR: 'email-user',
          DEV_EMAIL_SPY_DIR: 'email-spy',
          DEV_EMAIL_CHAT_DIR: 'email-chat',
          PRIVATE_DIR: privateDir,
        },
      });
      ready.push({
        lane,
        database: laneDatabase,
        servers: servers.started,
        databaseUrl: laneDatabase.url,
        apiBaseUrl: servers.apiBaseUrl,
        opsBaseUrl: servers.opsBaseUrl,
        frontBaseUrl: servers.frontBaseUrl,
        mailRoot,
      });
    }
    await Promise.all(
      ready.map((laneStack) => seedTestDatabase(args.mode, laneStack.apiBaseUrl, laneStack.databaseUrl)),
    );
    const rerunBase = patchrightRerunBase(args);
    const siblings: ChildProcess[] = [];
    const startedAt = Date.now();
    ranPatchright = true;
    if (!args.headless) {
      const place = testWindowPosition();
      nestedDisplay = await startNestedTestDisplays({
        root,
        screens: laneDisplayLayout({
          left: place.left,
          top: place.top,
          web: true,
          mobile: true,
          sideBySide: true,
        }),
        throttleMs: args.throttleMs,
        onOpen: (close) => {
          closeNestedDisplay = close;
        },
      });
    }
    const throttleFiles = new Map<RunLaneId, string>();
    const releasedLanes = new Set<RunLaneId>();
    const finishLane = (laneId: RunLaneId): void => {
      if (releasedLanes.has(laneId)) return;
      releasedLanes.add(laneId);
      const stack = ready.find((item) => item.lane.id === laneId);
      if (!stack) return;
      for (const server of stack.servers) {
        const index = started.indexOf(server);
        if (index >= 0) started.splice(index, 1);
      }
      const databaseIndex = databases.indexOf(stack.database);
      if (databaseIndex >= 0) databases.splice(databaseIndex, 1);
      const runner = runners.find((item) => item.lane === laneId);
      const groupPid = runner?.groupPid;
      const label = laneId === 'mobile' ? 'handset' : 'web';
      console.error(`[test] stopping the ${label} lane…`);
      if (groupPid !== undefined && isProcessGroupAlive(groupPid)) signalTestRunner(groupPid, 'SIGINT');
      void (async () => {
        if (groupPid !== undefined) {
          await waitForProcessGroupExit(groupPid, 5_000);
          if (isProcessGroupAlive(groupPid)) {
            signalTestRunner(groupPid, 'SIGTERM', true);
            await waitForProcessGroupExit(groupPid, 5_000);
          }
          if (isProcessGroupAlive(groupPid)) signalTestRunner(groupPid, 'SIGKILL', true);
        }
        await stopManagedServers(stack.servers);
        try {
          destroyDisposableTestDatabase(stack.database);
        } catch (error) {
          console.error(`[test] ${label} database cleanup failed:`, error);
        }
        await nestedDisplay?.closeLane(laneId);
      })().catch((error) => console.error(`[test] ${label} lane stop failed:`, error));
    };
    const controls = attachFunctionalRunControls({
      groupPids: () => runners.flatMap((runner) => (runner.groupPid === undefined ? [] : [runner.groupPid])),
      laneGroupPids: (lane) =>
        releasedLanes.has(lane)
          ? []
          : runners.flatMap((runner) =>
              runner.lane === lane && runner.groupPid !== undefined ? [runner.groupPid] : [],
            ),
      onQuit: () => handleInterrupt('SIGINT'),
      onQuitLane: finishLane,
      onState: (state, lane) => nestedDisplay?.setRunState(state, lane),
    });
    connectRunWindow(nestedDisplay, controls, (lane, ms) => publishThrottle(throttleFiles, nestedDisplay, lane, ms));
    closeRunControls = () => controls.close();
    const codes = await Promise.all(
      ready.map(async (laneStack) => {
        const lane = laneStack.lane;
        if (releasedLanes.has(lane.id)) return 0;
        const laneTitles = titlesForLane(selectedTitles, lane.id);
        const laneIndexes = indexesForLane(args.indexes, lane.id);
        if (args.indexes && laneIndexes && laneIndexes.length === 0) return 0;
        const report = patchrightReportDir(root, {
          functional: true,
          api: false,
          viewport: lane.id === 'mobile' ? 'mobile' : 'web',
        });
        if (!htmlReportDirs.includes(report)) htmlReportDirs.push(report);
        const laneTmp = join(tmpDir, lane.id);
        mkdirSync(report, { recursive: true });
        mkdirSync(laneTmp, { recursive: true });
        const throttleFile = join(laneTmp, 'throttle-ms');
        rememberThrottle(throttleFiles, lane.id, throttleFile, args.throttleMs);
        if (args.throttleMs > 0) {
          const label = lane.id === 'mobile' ? 'handset' : 'web';
          console.error(`[test] ${label} throttle=${args.throttleMs}ms (pause after API-triggering clicks)`);
        }
        const summaryFile = join(laneTmp, 'summary.json');
        const playwrightArgs = [
          'patchright',
          'test',
          '--config',
          join(root, 'patchright.config.ts'),
          ...lane.projects.flatMap((project) => ['--project', project]),
        ];
        if (!args.headless) playwrightArgs.push('--headed');
        if (args.failFast) playwrightArgs.push('--max-failures=1');
        if (laneTitles.length > 0) {
          playwrightArgs.push('--grep', laneTitles.map(grepPatternFromListTitle).join('|'));
        } else if (args.grep) {
          playwrightArgs.push('--grep', args.grep);
        }
        if (selectedLocations.length > 0) {
          playwrightArgs.splice(4, 0, ...selectedLocations);
        }
        const code = await new Promise<number>((resolve) => {
          const child = spawn('npx', playwrightArgs, {
            cwd: root,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: process.platform !== 'win32',
            env: headedChildEnv({
              ...process.env,
              APP_TARGET: args.mode,
              PAM_TEST_MODE: args.mode,
              PAM_TEST_SUITE: 'dev',
              PAM_API_BASE_URL: laneStack.apiBaseUrl,
              PAM_OPS_API_BASE_URL: laneStack.opsBaseUrl,
              PAM_TEST_DATABASE_URL: laneStack.databaseUrl,
              PAM_FRONT_BASE_URL: laneStack.frontBaseUrl,
              PAM_TEST_REPORT_DIR: report,
              PAM_TEST_TMP_DIR: laneTmp,
              PAM_TEST_BROWSER_PROFILE_DIR: join(root, 'output/test/browser-profile', lane.id),
              PAM_EMAIL_USER_DIR: join(laneStack.mailRoot, 'email-user'),
              PAM_EMAIL_SPY_DIR: join(laneStack.mailRoot, 'email-spy'),
              PAM_FRONT_ROOT: frontRoot,
              PAM_TEST_THROTTLE_MS: String(args.throttleMs),
              PAM_TEST_THROTTLE_FILE: throttleFile,
              PAM_TEST_HEADLESS: args.headless ? '1' : '0',
              PAM_TEST_VERBOSE: args.verbose ? '1' : '0',
              PAM_TEST_INDEX_OVERRIDES: JSON.stringify(indexOverrides),
              ...(laneIndexes
                ? { PAM_TEST_REQUESTED_INDEXES: JSON.stringify(laneIndexes.map(String)) }
                : {}),
              PAM_TEST_FUNCTIONAL_HANDSET: lane.includeHandset ? '1' : '0',
              ...(rerunBase ? { PAM_TEST_RERUN_BASE: rerunBase } : {}),
              PAM_TEST_DEFER_SUMMARY: '1',
              PAM_TEST_SUMMARY_FILE: summaryFile,
              PAM_TEST_WINDOW_POSITION: nestedDisplay
                ? '0,0'
                : laneWindowPosition(lane.id, process.env.PAM_TEST_WINDOW_POSITION, FUNCTIONAL_WEB_WINDOW.width),
              ...(nestedDisplay
                ? { PAM_TEST_CHROME_WINDOW: formatChromeOuterSize(lane.id === 'mobile' ? 'mobile' : 'web') }
                : {}),
              AUTH_OTP_MAX_ATTEMPTS: '5',
              LOGIN_LOCKOUT: '1s:5',
              PAM_TEST_WORKERS: '1',
            }, nestedDisplay?.displayFor(lane.id)),
          });
          runners.push({ child, groupPid: child.pid, lane: lane.id });
          if (releasedLanes.has(lane.id) && child.pid !== undefined) signalTestRunner(child.pid, 'SIGINT');
          siblings.push(child);
          pipeLaneLines(child.stdout, (line) => {
            process.stdout.write(`${line}\n`);
            noteRunnerStatus(nestedDisplay, lane.id, line);
          });
          pipeLaneLines(child.stderr, (line) => process.stderr.write(`[${lane.id}] ${line}\n`));
          child.on('close', (status) => {
            const exit = status ?? 1;
            if (args.failFast && exit !== 0) {
              for (const other of siblings) {
                if (other === child || other.pid === undefined) continue;
                signalTestRunner(other.pid, 'SIGINT', true);
              }
            }
            resolve(exit);
          });
        });
        return code;
      }),
    );
    closeRunControls();
    const summaries: LaneSummary[] = ready.flatMap((laneStack) => {
      const laneIndexes = indexesForLane(args.indexes, laneStack.lane.id);
      if (args.indexes && laneIndexes && laneIndexes.length === 0) return [];
      const summaryFile = join(tmpDir, laneStack.lane.id, 'summary.json');
      try {
        return [readLaneSummary(readFileSync(summaryFile, 'utf8'))];
      } catch {
        console.error(`[test] ${laneStack.lane.id} environment produced no summary`);
        return [{ status: 'failed', passed: 0, total: 0, failed: [], notExecuted: [], titles: {} }];
      }
    });
    process.stdout.write(mergeLaneSummaries(summaries, Date.now() - startedAt, rerunBase));
    return codes.find((code) => code !== 0) ?? 0;
  };

  let exitCode = 0;
  let ranPatchright = false;
  let loadVoucherCodes: string[] = [];
  let loadScarce: ScarceFixture | undefined;
  try {
    // Fail before disposable DB/API work when --load cannot run.
    if (args.load) assertK6Available();
    const sideBySide =
      args.load ||
      args.api ||
      !projects.includes('functional-web') ||
      !projects.includes('functional-handset')
        ? null
        : planSideBySideLanes(projects, resolveSideBySideFrontPorts());
    let apiBaseUrl = '';
    let frontBaseUrl = '';
    if (sideBySide) {
      removeOrphanedTestDatabases();
      exitCode = await runSideBySideEnvironments(sideBySide);
    } else {

      removeOrphanedTestDatabases();
      const disposable = createDisposableTestDatabase();
      database = disposable;
      databases.push(disposable);
      // Schema must exist before the API listens. Boot probes (`app_preferences`)
      // and the mail-job worker (`mail_jobs`) query on startup; an empty
      // disposable database would otherwise WARN / stack-dump until migrate.
      await migrateTestDatabase(args.mode, disposable.url);
      const servers = await ensureServers(root, args.mode, {
        needFront: args.functional,
        frontRoot,
        database: disposable,
        onStarted: (server) => started.push(server),
        // Disposable load runs measure API/DB capacity, not the production
        // gallery rate ceiling (RATE_GALLERY=60s:120). env.ts prefers PAM_TEST_*.
        apiEnv: {
          // Security-threshold specs must deterministically exercise the real
          // burn path even when the developer's ordinary E2E env is permissive.
          AUTH_OTP_MAX_ATTEMPTS: '5',
          LOGIN_LOCKOUT: '1s:5',
          ...(args.load
            ? {
                DISABLE_RATE_AUTH: 'true',
                DISABLE_RATE_CONTACT: 'true',
                DISABLE_RATE_CONTACT_EMAIL: 'true',
                DISABLE_RATE_GIFT_CREATE_EMAIL: 'true',
                DISABLE_RATE_GIFT_PIN: 'true',
                DISABLE_RATE_GIFT_SHARE_CARD_UPDATE: 'true',
                DISABLE_RATE_GIFT_SHARE_CARD_DOWNLOAD: 'true',
                DISABLE_RATE_GIFT_SHARE_CARD_EMAIL: 'true',
                DISABLE_RATE_INVOICE_DOWNLOAD: 'true',
                DISABLE_RATE_INVOICE_EMAIL: 'true',
                // An ordered gift keeps its gift cart, so a giver VU would hit
                // the default ceiling within one run (gift-cycle.ts also
                // rotates to a fresh giver well below this maximum).
                GIFT_MAX_OPEN_PROMISES_PER_GIVER: '100',
                DISABLE_RATE_AUTH_REFRESH: 'true',
                DISABLE_RATE_VOUCHER: 'true',
                DISABLE_RATE_CHECKOUT: 'true',
                DISABLE_RATE_PAYMENT: 'true',
                DISABLE_RATE_GALLERY: 'true',
                DISABLE_RATE_OPS: 'true',
                DISABLE_RATE_LOGIN: 'true',
                // Keep OTP/reset dumps in output/test/load-mail for this run only.
                DEV_DIR: loadMailRoot,
                DEV_EMAIL_USER_DIR: '/email-user',
                DEV_EMAIL_SPY_DIR: '/email-spy',
                DEV_EMAIL_CHAT_DIR: '/email-chat',
                // Shared .public.env cooldown is meant for real traffic; load
                // uses unique emails but the disposable API still needs it off.
                DISABLE_AUTH_OTP_COOLDOWN: 'true',
              }
            : {}),
        },
      });
      apiBaseUrl = servers.apiBaseUrl;
      frontBaseUrl = servers.frontBaseUrl;
      await seedTestDatabase(args.mode, apiBaseUrl, disposable.url);
      if (args.load) {
        loadVoucherCodes = await prepareLoadFixtures(args.mode, apiBaseUrl, disposable.url, args.loadVus);
        if (args.loadProfile === 'contention') {
          loadScarce = await prepareContentionFixtures(disposable.url, loadVoucherCodes[0]!, args.loadVus);
          console.error(
            `[test] contention: ${loadScarce.productUid} ${loadScarce.shapeKey}/${loadScarce.lengthKey}/${loadScarce.size} ` +
              `has ${loadScarce.units} unit(s); voucher ${loadScarce.voucherCode} has ${loadScarce.voucherQuantity} use(s)`,
          );
        }
      }

      if (projects.length > 0) {
        ranPatchright = true;
        const playwrightArgs = [
          'patchright',
          'test',
          '--config',
          join(root, 'patchright.config.ts'),
          ...projects.flatMap((p) => ['--project', p]),
        ];
        if (!args.headless) playwrightArgs.push('--headed');
        if (args.failFast) playwrightArgs.push('--max-failures=1');
        if (selectedTitles.length > 0) {
          playwrightArgs.push('--grep', selectedTitles.map(grepPatternFromListTitle).join('|'));
        } else if (args.grep) {
          playwrightArgs.push('--grep', args.grep);
        }
        if (selectedLocations.length > 0) {
          // Test paths must precede `--project`: Patchright otherwise treats a
          // trailing path as the value for its last project option.
          playwrightArgs.splice(4, 0, ...selectedLocations);
        }
        const windowLane: RunLaneId = projects.includes('functional-web') ? 'web' : 'mobile';
        const throttleFiles = new Map<RunLaneId, string>();
        const throttleFile = join(tmpDir, 'throttle-ms');
        rememberThrottle(throttleFiles, windowLane, throttleFile, args.throttleMs);
        if (args.throttleMs > 0) {
          const label = projects.includes('functional-web')
            ? 'web'
            : projects.includes('functional-handset')
              ? 'handset'
              : '';
          console.error(
            `[test] ${label ? `${label} ` : ''}throttle=${args.throttleMs}ms (pause after API-triggering clicks)`,
          );
        }
        if (
          args.functional &&
          !args.headless &&
          (projects.includes('functional-web') || projects.includes('functional-handset'))
        ) {
          const place = testWindowPosition();
          const web = projects.includes('functional-web');
          const mobile = projects.includes('functional-handset');
          nestedDisplay = await startNestedTestDisplays({
            root,
            screens: laneDisplayLayout({
              left: place.left,
              top: place.top,
              web,
              mobile,
              sideBySide: false,
            }),
            throttleMs: args.throttleMs,
            onOpen: (close) => {
              closeNestedDisplay = close;
            },
          });
        }

        const rerunBase = patchrightRerunBase(args);
        let laneQuit = false;
        const controls = attachFunctionalRunControls({
          groupPids: () => runners.flatMap((runner) => (runner.groupPid === undefined ? [] : [runner.groupPid])),
          laneGroupPids: (lane) =>
            lane === windowLane
              ? runners.flatMap((runner) => (runner.groupPid === undefined ? [] : [runner.groupPid]))
              : [],
          onQuit: () => handleInterrupt('SIGINT'),
          onQuitLane: () => {
            laneQuit = true;
            const runner = runners.find((item) => item.groupPid !== undefined && isProcessGroupAlive(item.groupPid));
            if (!runner?.groupPid) return;
            const label = windowLane === 'mobile' ? 'handset' : 'web';
            console.error(`[test] stopping the ${label} lane…`);
            signalTestRunner(runner.groupPid, 'SIGINT');
          },
          onState: (state, lane) => nestedDisplay?.setRunState(state, lane),
        });
        connectRunWindow(nestedDisplay, controls, (lane, ms) => publishThrottle(throttleFiles, nestedDisplay, lane, ms));
        closeRunControls = () => controls.close();
        exitCode = await new Promise((resolve) => {
          const child = spawn('npx', playwrightArgs, {
            cwd: root,
            // The parent keeps stdin so p / r / q work. Stdout is piped so the
            // current test title can be copied onto the title bar, then written
            // back to this terminal.
            stdio: ['ignore', 'pipe', 'inherit'],
            // The runner gets its own group: Ctrl+C is handled by this parent,
            // which gives Patchright a chance to close normally before reaping
            // any descendants it leaves behind.
            detached: process.platform !== 'win32',
            env: headedChildEnv({
              ...process.env,
              APP_TARGET: args.mode,
              PAM_TEST_MODE: args.mode,
              PAM_TEST_SUITE: 'dev',
              PAM_API_BASE_URL: apiBaseUrl,
              PAM_OPS_API_BASE_URL: servers.opsBaseUrl,
              PAM_TEST_DATABASE_URL: disposable.url,
              PAM_FRONT_BASE_URL: frontBaseUrl,
              PAM_TEST_REPORT_DIR: reportDir,
              PAM_TEST_TMP_DIR: tmpDir,
              PAM_TEST_BROWSER_PROFILE_DIR: browserProfileDir,
              PAM_EMAIL_USER_DIR: emailUserDir,
              PAM_EMAIL_SPY_DIR: emailSpyDir,
              PAM_FRONT_ROOT: frontRoot,
              PAM_TEST_THROTTLE_MS: String(args.throttleMs),
              PAM_TEST_THROTTLE_FILE: throttleFile,
              PAM_TEST_HEADLESS: args.headless ? '1' : '0',
              PAM_TEST_VERBOSE: args.verbose ? '1' : '0',
              PAM_TEST_INDEX_OVERRIDES: JSON.stringify(indexOverrides),
              ...(args.indexes
                ? { PAM_TEST_REQUESTED_INDEXES: JSON.stringify(args.indexes.map(String)) }
                : {}),
              PAM_TEST_FUNCTIONAL_HANDSET: projects.includes('functional-handset') ? '1' : '0',
              ...(rerunBase ? { PAM_TEST_RERUN_BASE: rerunBase } : {}),
              AUTH_OTP_MAX_ATTEMPTS: '5',
              LOGIN_LOCKOUT: '1s:5',
              // API project stays serial (shared account side effects); override with PAM_TEST_WORKERS.
              PAM_TEST_WORKERS: process.env.PAM_TEST_WORKERS ?? '1',
              ...(nestedDisplay
                ? {
                    PAM_TEST_WINDOW_POSITION: '0,0',
                    PAM_TEST_CHROME_WINDOW: formatChromeOuterSize(
                      projects.includes('functional-web') ? 'web' : 'mobile',
                    ),
                  }
                : {}),
            }, nestedDisplay?.displayFor(projects.includes('functional-web') ? 'web' : 'mobile')),
          });
          runners.push({ child, groupPid: child.pid, lane: windowLane });
          if (laneQuit && child.pid !== undefined) signalTestRunner(child.pid, 'SIGINT');
          pipeLaneLines(child.stdout, (line) => {
            process.stdout.write(`${line}\n`);
            noteRunnerStatus(nestedDisplay, windowLane, line);
          });
          child.on('close', (code) => {
            resolve(code ?? 1);
          });
        });
        closeRunControls();
      }
    }

    if (args.load) {
      if (!database) throw new Error('[test] load run has no disposable database');
      const loadCode = await runK6Load({
        apiBaseUrl,
        databaseUrl: database.url,
        scarce: loadScarce,
        loadProfile: args.loadProfile,
        loadVus: args.loadVus,
        loadDurationSec: args.loadDurationSec,
        loadDir,
        voucherCodes: loadVoucherCodes,
        emailUserDir,
      });
      if (exitCode === 0) exitCode = loadCode;
    }
  } finally {
    if (args.keepServers) {
      console.error(
        '[test] --keep-servers is ignored for isolated runs; the disposable database must be removed.',
      );
    }
    await cleanup();
    process.off('SIGINT', handleInterrupt);
    process.off('SIGTERM', handleInterrupt);
  }

  if (ranPatchright) {
    for (const dir of htmlReportDirs) {
      patchHtmlReport(dir);
      console.error(`[test] HTML report: ${dir}/index.html`);
    }
  }
  if (ranPatchright || args.load) {
    writeReportHub(root);
    console.error(`[test] report hub: ${reportRoot(root)}/index.html`);
  }
  process.exit(exitCode);
}

async function runTestOpsCommand(
  mode: Mode,
  databaseUrl: string,
  script: string,
  scriptArgs: string[],
): Promise<void> {
  const env = { ...process.env, PAM_TEST_DATABASE_URL: databaseUrl };
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn('npm', ['run', script, '--', ...scriptArgs, `--${mode}`], {
      cwd: root,
      env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`[test] isolated database setup failed: npm run ${script}`);
}

async function migrateTestDatabase(mode: Mode, databaseUrl: string): Promise<void> {
  // Operational commands use the SSH/loopback transport. Running the command
  // here also starts the local ops server against the disposable DB; the
  // tunnel wrapper loads OPS_TOKEN from private env and sends it as Bearer.
  await runTestOpsCommand(mode, databaseUrl, 'operation', ['database-migrate']);
}

async function seedTestDatabase(mode: Mode, apiBaseUrl: string, databaseUrl: string): Promise<void> {
  const env = { ...process.env, PAM_TEST_API_BASE_URL: apiBaseUrl, PAM_TEST_DATABASE_URL: databaseUrl };
  const runSeed = async (script: string, scriptArgs: string[]): Promise<void> => {
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn('npm', ['run', script, '--', ...scriptArgs], { cwd: root, env, stdio: 'inherit' });
      child.on('error', reject);
      child.on('close', resolve);
    });
    if (code !== 0) throw new Error(`[test] isolated database seed failed: npm run ${script}`);
  };
  // Import the current manager library first. Functional setup subsequently
  // adds only its ZZ-E2E products, so every test starts from the same real
  // catalogue a developer would see locally.
  await runSeed('library', ['seed', `--${mode}`]);
  await runSeed('courier', ['seed', `--${mode}`]);
  await runSeed('courier-live-state', ['seed', `--${mode}`]);
  await runSeed('accessory', ['seed', 'TK-PT-248', `--${mode}`]);
  // A normal, positive-price by-quantity accessory is required to prove the
  // customer can choose a pack from the cart carousel and receive that exact
  // paid line in the resulting order. TK-PT-248 above remains the rule gift.
  await runSeed('accessory', ['seed', 'TS-KX-936', `--${mode}`]);
  await runSeed('cart-rule', ['seed', `--${mode}`]);
  await runSeed('payment-method', ['seed', `--${mode}`]);
  await runSeed('payment-method-countries', ['seed', `--${mode}`]);
  await runSeed('sign-in-method', ['seed', `--${mode}`]);
}

/** Load-only: raise all stock, add the manager's single nails, and give every
 * VU its own amount voucher so /checkout/free never fights OOS/Stripe or one
 * voucher row lock. */
async function prepareLoadFixtures(
  mode: Mode,
  apiBaseUrl: string,
  databaseUrl: string,
  totalVus: number,
): Promise<string[]> {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // 9999 was not enough: once every checkout VU maps to its own dedicated
    // account (see pickFromPool's doc comment), sustained real order
    // creation against the handful of catalogue picks load scenarios cycle
    // through can deplete it inside one 60-120s run (empty_cart failures with
    // available_quantity 0). A concentrated but short run cannot exhaust this.
    const fillQuantity = 100_000_000;
    const updated = await client.query(`update product_availability set quantity = $1`, [fillQuantity]);
    console.error(`[test] load stock fill: ${updated.rowCount ?? 0} availability row(s) set to ${fillQuantity}`);
  } finally {
    await client.end();
  }

  const env = { ...process.env, PAM_TEST_API_BASE_URL: apiBaseUrl, PAM_TEST_DATABASE_URL: databaseUrl };
  const run = async (script: string, scriptArgs: string[]): Promise<string> => {
    const result = await new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
      const child = spawn('npm', ['run', script, '--', ...scriptArgs], {
        cwd: root,
        env,
        stdio: ['inherit', 'pipe', 'inherit'],
      });
      let stdout = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stdout }));
    });
    if (result.code !== 0) throw new Error(`[test] load fixture failed: npm run ${script}`);
    return result.stdout;
  };

  // Compose-a-set VUs need offered single nails; the shared test seed leaves
  // them out so functional suites only ever see their own E2E nails.
  await run('library-nail', ['seed', `--${mode}`]);
  // Offer-type labels must exist before init can attach a percent/amount offer.
  await run('voucher', ['seed', `--${mode}`]);
  const stamp = Date.now().toString(36).toUpperCase();
  const firstName = `LOAD-AMT-${stamp}-1`;
  const stdout = await run('voucher', [
    'init',
    '--name',
    firstName,
    '--quantity',
    '1000000',
    '--end',
    '365d',
    '--amount',
    '99999',
    // Each VU reuses its voucher across many iterations for the run's whole
    // duration; the CLI default (1 use per customer) would fail every
    // iteration after the user's first order.
    '--max-per-user',
    '0',
    '--json',
    `--${mode}`,
  ]);
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('[test] load voucher init returned no JSON');
  const firstCode = (JSON.parse(stdout.slice(start, end + 1)) as { code?: string }).code ?? firstName;
  const clones = Array.from({ length: Math.max(totalVus, 1) - 1 }, (_, index) => `LOAD-AMT-${stamp}-${index + 2}`);
  await cloneLoadVouchers(databaseUrl, firstCode, clones);
  const codes = [firstCode, ...clones];
  console.error(`[test] load vouchers ready: ${codes.length} (${firstCode} …)`);
  return codes;
}

async function runLock(args: Extract<ParsedArgs, { kind: 'lock' }>): Promise<void> {
  if (args.mode === 'dev') {
    const frontRoot = join(root, '../pamsurin-front');
    const started: Awaited<ReturnType<typeof ensureServers>>['started'] = [];
    let database: ReturnType<typeof createDisposableTestDatabase> | undefined;
    let cleanupPromise: Promise<void> | undefined;
    const cleanup = (): Promise<void> => {
      if (cleanupPromise) return cleanupPromise;
      cleanupPromise = (async () => {
        await stopManagedServers(started);
        if (database) destroyDisposableTestDatabase(database);
      })();
      return cleanupPromise;
    };
    let interrupting = false;
    const handleInterrupt = (signal: NodeJS.Signals): void => {
      if (interrupting) {
        console.error('[test] lock-probe cleanup is already in progress; waiting for it to finish…');
        return;
      }
      interrupting = true;
      console.error(`[test] ${signal} received — stopping lock probe…`);
      void cleanup()
        .catch((error) => console.error('[test] interrupted cleanup failed:', error))
        .finally(() => process.exit(130));
    };
    process.on('SIGINT', handleInterrupt);
    process.on('SIGTERM', handleInterrupt);
    try {
      removeOrphanedTestDatabases();
      database = createDisposableTestDatabase();
      await migrateTestDatabase(args.mode, database.url);
      const servers = await ensureServers(root, args.mode, {
        needFront: args.image,
        frontRoot,
        database,
        onStarted: (server) => started.push(server),
        apiEnv: {
          DISABLE_RATE_OPS: 'true',
        },
      });
      await runLockProbe({
        root,
        mode: args.mode,
        image: args.image,
        api: args.api,
        concurrency: args.concurrency,
        total: args.total,
        bytes: args.bytes,
        durationSec: args.durationSec,
        rampSec: args.rampSec,
        queueLimit: args.queueLimit,
        throttle: args.throttle,
        frontBaseUrl: servers.frontBaseUrl,
        apiBaseUrl: servers.apiBaseUrl,
      });
    } finally {
      process.off('SIGINT', handleInterrupt);
      process.off('SIGTERM', handleInterrupt);
      await cleanup();
    }
    return;
  }

  await runLockProbe({
    root,
    mode: args.mode,
    image: args.image,
    api: args.api,
    concurrency: args.concurrency,
    total: args.total,
    bytes: args.bytes,
    durationSec: args.durationSec,
    rampSec: args.rampSec,
    queueLimit: args.queueLimit,
    throttle: args.throttle,
  });
}

async function runUnitTest(): Promise<void> {
  const frontRoot = join(root, '../pamsurin-front');
  console.error('[test] unit-test: pamsurin-back');
  const back = spawnSync('npm', ['run', 'test:unit'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (back.status !== 0) {
    fail(`back unit tests failed (exit ${back.status ?? 'signal'})`);
  }
  console.error('[test] unit-test: pamsurin-front');
  const front = spawnSync('npm', ['run', 'test:unit'], {
    cwd: frontRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (front.status !== 0) {
    fail(`front unit tests failed (exit ${front.status ?? 'signal'})`);
  }
  console.error('[test] unit-test: back + front passed');
}

async function runMain(args: ParsedArgs): Promise<void> {
  if (args.kind === 'unit-test') await runUnitTest();
  else if (args.kind === 'fixture') await runFixture(args);
  else if (args.kind === 'lock') await runLock(args);
  else await runPatchright(args);
}

program.action((name: string | undefined, opts: TestOpts) => {
  runMain(buildArgs(name, opts)).catch((error) => {
    console.error('[test] failed:', error);
    process.exit(1);
  });
});

program.parse();
