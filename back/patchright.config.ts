import { defineConfig, devices } from 'patchright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { functionalChromeArgs } from './src-test/dev/support/functionalWindow.ts';

const root = join(dirname(fileURLToPath(import.meta.url)));
const reportDir = process.env.PAM_TEST_REPORT_DIR ?? join(root, 'output/report/functional-web');
const tmpDir = process.env.PAM_TEST_TMP_DIR ?? join(root, 'output/test/tmp');
const frontBaseUrl = process.env.PAM_FRONT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.PAM_API_BASE_URL ?? 'http://localhost:3000';
const MAX_ACTION_TIMEOUT_MS = 15_000;
// Resolve explicitly from the repository root. Relative testDir discovery can
// vary when the runner is launched through npm/npx with a config path.
const testDir = join(root, 'src-test/dev');
const includeHandset = process.env.PAM_TEST_FUNCTIONAL_HANDSET !== '0';

/** Driven by `npm run test -- --dev --functional|--api`. The orchestrator
 * starts an isolated disposable local stack. */
export default defineConfig({
  testDir,
  outputDir: tmpDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // One process, one database. Desktop and mobile run together only as two
  // processes, each with its own database, started by scripts/test.ts.
  workers: process.env.PAM_TEST_WORKERS ? Number(process.env.PAM_TEST_WORKERS) : 1,
  // No per-test wall-clock cap: multi-step flows (order lifecycle, guest claim,
  // stock race) can legitimately exceed 60s under --throttle. Each action and
  // assertion still fails within MAX_ACTION_TIMEOUT_MS.
  timeout: 0,
  expect: { timeout: MAX_ACTION_TIMEOUT_MS },
  // k6 TypeScript under src-test/dev/load is spawned by scripts/test.ts, not Patchright.
  testIgnore: '**/load/**',
  reporter: [
    ['./src-test/dev/support/cleanListReporter.ts'],
    ['html', { outputFolder: reportDir, open: 'never' }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ignoreHTTPSErrors: true,
    actionTimeout: MAX_ACTION_TIMEOUT_MS,
    navigationTimeout: MAX_ACTION_TIMEOUT_MS,
    launchOptions: {
      chromiumSandbox: true,
      // Same screen as the persistent fixture window. Without these flags a
      // context opened from the Playwright browser lands on another monitor.
      args: functionalChromeArgs(),
    },
  },
  projects: [
    {
      name: 'functional-setup',
      testMatch: '**/functional.catalog.setup.ts',
    },
    {
      name: 'functional-teardown',
      testMatch: '**/functional.catalog.teardown.ts',
    },
    {
      // Keep the browser matrix in its visible, numbered order: all web
      // coverage first, then all mobile coverage. A single project discovers
      // paths alphabetically (`common`, `mobile`, `web`), which interleaves
      // the two number ranges despite its one-worker setting.
      name: 'functional-web',
      testMatch: /.*[\\/]functional[\\/].*\.spec\.ts$/,
      grepInvert: /\bmobile\b/i,
      dependencies: ['functional-setup'],
      // Full matrix: teardown stays on handset (last functional project).
      // Web-only `--index` / `--type web` sets PAM_TEST_FUNCTIONAL_HANDSET=0
      // so this project still drops the disposable catalogue.
      ...(includeHandset ? {} : { teardown: 'functional-teardown' }),
      // Every spec file targets the same single dev backend + Postgres
      // instance (shared E2E catalogue, sessions, rate limiters) — pinned
      // to 1 worker explicitly so that stays true even if this project is
      // ever run outside scripts/test.ts's own PAM_TEST_WORKERS=1 default.
      // Same reasoning as the 'api' project below.
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        // Use the installed Chrome channel, not Patchright's bundled
        // Chromium. The test runner still supplies a fresh isolated profile.
        channel: 'chrome',
        baseURL: frontBaseUrl,
        locale: 'fr-FR',
      },
    },
    {
      // Do not put "mobile" in this project's name: Patchright evaluates
      // `grep` against the project name as well as the test title.
      name: 'functional-handset',
      testMatch: /.*[\\/]functional[\\/].*\.spec\.ts$/,
      grep: /\bmobile\b/i,
      // Depend only on catalogue setup. Depending on functional-web caused
      // Patchright to skip every handset test when any web test failed.
      // This process still has one worker. Side-by-side runs are a second
      // process with its own database, not a second worker here.
      dependencies: ['functional-setup'],
      // Teardown runs after the handset project, which is the last functional
      // project in the declaration order.
      teardown: 'functional-teardown',
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        baseURL: frontBaseUrl,
        locale: 'fr-FR',
      },
    },
    {
      name: 'api',
      // Patchright evaluates project globs relative to testDir. A simple
      // include plus an explicit functional exclusion reliably collects both
      // `api/health.spec.ts` and nested API suites.
      testMatch: /.*\.spec\.ts$/,
      testIgnore: [/.*[\\/]functional[\\/].*/, /.*[\\/]load[\\/].*/],
      // API contracts need the same deterministic public and user-library
      // catalogue as browser flows. The shared teardown removes it after the
      // last dependent project (API and/or functional) completes.
      dependencies: ['functional-setup'],
      teardown: 'functional-teardown',
      fullyParallel: false,
      workers: 1,
      use: {
        baseURL: apiBaseUrl,
        extraHTTPHeaders: { Accept: 'application/json', 'Accept-Language': 'fr' },
      },
    },
  ],
});
