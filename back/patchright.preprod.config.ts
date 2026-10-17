import { defineConfig, devices } from 'patchright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)));
const reportDir = process.env.PAM_TEST_REPORT_DIR ?? join(root, 'output/report/functional-mobile');
const tmpDir = process.env.PAM_TEST_TMP_DIR ?? join(root, 'output/test/tmp');
const frontBaseUrl = process.env.PAM_FRONT_BASE_URL ?? 'https://preprod.pamsurin.fr';
const MAX_ACTION_TIMEOUT_MS = 15_000;

/** Driven by `npm run test -- --preprod --ftp --functional`. Hits the live
 * preprod shop. No disposable database, no catalogue seed, no teardown. */
export default defineConfig({
  testDir: join(root, 'src-test/preprod'),
  outputDir: tmpDir,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 0,
  expect: { timeout: MAX_ACTION_TIMEOUT_MS },
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
      args: ['--lang=fr-FR', '--disable-features=LocalNetworkAccessChecks,PasswordManagerEnabled'],
    },
  },
  projects: [
    {
      name: 'preprod-handset',
      testMatch: /.*[\\/]functional[\\/].*\.spec\.ts$/,
      grep: /\bmobile\b/i,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        baseURL: frontBaseUrl,
        locale: 'fr-FR',
      },
    },
  ],
});
