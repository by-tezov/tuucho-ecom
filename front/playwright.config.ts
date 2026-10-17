import { defineConfig, devices } from '@playwright/test';

/** Local Playwright runs drive the developer's already-running stack. CI (or
 * PLAYWRIGHT_USE_WEBSERVER=1) starts the isolated non-secret Vite server
 * configured below. Override PLAYWRIGHT_BASE_URL for another local port. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ??
      (process.env.PLAYWRIGHT_USE_WEBSERVER === '1' ? 'http://127.0.0.1:4173' : 'http://localhost:5173'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Local `test:e2e` continues to use the developer's already-running real
  // stack. CI (or an explicit opt-in) starts an isolated Vite instance with
  // non-secret test placeholders, so it never needs private env files.
  webServer:
    process.env.PLAYWRIGHT_USE_WEBSERVER === '1'
      ? {
          command: 'npm run dev -- --host 127.0.0.1 --port 4173',
          url: 'http://127.0.0.1:4173',
          // The isolated command must never attach to a developer server that
          // may have real API configuration or private env loaded.
          reuseExistingServer: false,
          timeout: 30_000,
          env: {
            PAM_TEST_API_BASE_URL: 'http://127.0.0.1:9',
            PAM_TEST_SITE_URL: 'http://127.0.0.1:4173',
            PAM_TEST_STRIPE_PUBLISHABLE_KEY: 'pk_test_ci_placeholder',
            PAM_TEST_MONDIAL_RELAY_BRAND: 'CI_TEST',
          },
        }
      : undefined,
});
