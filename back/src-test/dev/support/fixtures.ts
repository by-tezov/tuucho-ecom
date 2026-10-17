import { chromium, request as playwrightRequest, test as base, expect } from 'patchright/test';
import type { APIRequestContext, BrowserContext, LaunchPersistentContextOptions, Page, TestInfo } from 'patchright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { closePersistentContextSafely, ensureProfileIdle, markProfileCleanExit } from './browserLifecycle.js';
import { holdAfterAction, paceIfApiRequest } from './interact.js';
import { attachDiagNetworkLogging, attachDiagPageLogging } from './diagNetwork.js';
import { loadTestEnv } from './env.js';
import { functionalChromeArgs, functionalWindowSize, testWindowPosition } from './functionalWindow.js';
import { watchFocusedPage } from './windowFocus.js';

/**
 * Clear the "Chrome didn't shut down correctly" / Restore pages state and
 * disable password/autofill UI for the dedicated test profile.
 */
async function prepareTestProfile(profileDir: string): Promise<void> {
  const preferencesPath = join(profileDir, 'Default', 'Preferences');
  await mkdir(dirname(preferencesPath), { recursive: true });
  let preferences: Record<string, unknown> = {};
  try {
    preferences = JSON.parse(await readFile(preferencesPath, 'utf8')) as Record<string, unknown>;
  } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  const profile =
    preferences.profile && typeof preferences.profile === 'object'
      ? (preferences.profile as Record<string, unknown>)
      : {};
  const autofill =
    preferences.autofill && typeof preferences.autofill === 'object'
      ? (preferences.autofill as Record<string, unknown>)
      : {};
  const session =
    preferences.session && typeof preferences.session === 'object'
      ? (preferences.session as Record<string, unknown>)
      : {};

  preferences.credentials_enable_service = false;
  profile.password_manager_enabled = false;
  profile.password_manager_leak_detection = false;
  // Without this, a previous SIGKILL/crash shows the Restore pages bubble on
  // the next launchPersistentContext of the same profile.
  profile.exit_type = 'Normal';
  profile.exited_cleanly = true;
  preferences.profile = profile;
  preferences.exit_type = 'Normal';
  session.restore_on_startup = 5; // 5 = open new tab, never restore last session
  preferences.session = session;
  autofill.profile_enabled = false;
  autofill.credit_card_enabled = false;
  preferences.autofill = autofill;
  await writeFile(preferencesPath, JSON.stringify(preferences), 'utf8');
  await markProfileCleanExit(profileDir);
}

function isMobileScenario(testInfo: TestInfo): boolean {
  return /(?:[/\\]mobile[/\\]|\bmobile\b)/i.test(`${testInfo.file} ${testInfo.titlePath.join(' ')}`);
}

function viewportFor(testInfo: TestInfo): { width: number; height: number; windowHeight: number } {
  return functionalWindowSize(isMobileScenario(testInfo) ? 'mobile' : 'web');
}

async function applyWindowBounds(
  page: Page,
  width: number,
  windowHeight: number,
  position: { left: number; top: number },
): Promise<void> {
  try {
    const session = await page.context().newCDPSession(page);
    const { windowId } = (await session.send('Browser.getWindowForTarget')) as { windowId: number };
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: {
        left: position.left,
        top: position.top,
        width,
        height: windowHeight,
        windowState: 'normal',
      },
    });
  } catch {
    // Headless / channel quirks: viewport size below is still applied.
  }
}

async function resizeWindow(
  page: Page,
  width: number,
  windowHeight: number,
  position: { left: number; top: number },
): Promise<void> {
  await applyWindowBounds(page, width, windowHeight, position);
}

async function preparePageForTest(page: Page, testInfo: TestInfo): Promise<void> {
  const { width, height, windowHeight } = viewportFor(testInfo);
  await page.setViewportSize({ width, height });
  await resizeWindow(page, width, windowHeight, testWindowPosition());
}

/** A second customer window stays on the same screen as the suite window.
 * A fresh context otherwise lets the desktop place it on another monitor. */
export async function openPinnedPage(
  context: BrowserContext,
  surface: 'web' | 'mobile' = 'web',
): Promise<Page> {
  const page = await context.newPage();
  const { width, height, windowHeight } = functionalWindowSize(surface);
  await page.setViewportSize({ width, height });
  await resizeWindow(page, width, windowHeight, testWindowPosition());
  watchFocusedPage(page);
  return page;
}

export { functionalChromeArgs };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchPersistentContextWithRetry(
  profileDir: string,
  options: LaunchPersistentContextOptions,
): Promise<BrowserContext> {
  const attempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await ensureProfileIdle(profileDir);
    await prepareTestProfile(profileDir);
    try {
      return await chromium.launchPersistentContext(profileDir, options);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await closeOrphanedLaunch(profileDir);
      await sleep(400 * attempt);
    }
  }
  throw lastError;
}

async function closeOrphanedLaunch(profileDir: string): Promise<void> {
  await ensureProfileIdle(profileDir);
}

type TestFixtures = {
  context: BrowserContext;
  page: Page;
  /** Functional browser pages use the front base URL, but helper requests
   * must call the API directly (e.g. payment-method setup). */
  request: APIRequestContext;
};

/**
 * Fresh channel:chrome persistent context per test (launch → run → close).
 * Tab-switching inside one long-lived Chrome did not help the preprod path
 * breakage; prefer a clean browser process boundary between tests.
 */
export const test = base.extend<TestFixtures>({
  // oxlint-disable-next-line no-empty-pattern
  request: async ({}, use) => {
    const request = await playwrightRequest.newContext({
      baseURL: loadTestEnv().apiBaseUrl,
      // Like the French storefront, which always names its language: the
      // mails these tests read are written in it.
      extraHTTPHeaders: { Accept: 'application/json', 'Accept-Language': 'fr' },
    });
    try {
      await use(request);
    } finally {
      await request.dispose();
    }
  },

  // oxlint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const profileRoot = process.env.PAM_TEST_BROWSER_PROFILE_DIR;
    if (!profileRoot) {
      throw new Error('PAM_TEST_BROWSER_PROFILE_DIR is required for functional tests.');
    }
    // One directory per test. Reusing a single user-data-dir across launches
    // lets a SIGTRAP / SingletonLock from test N poison every later test
    // (1 passed, then hundreds of "browser has been closed" failures).
    await mkdir(profileRoot, { recursive: true });
    const profileDir = await mkdtemp(join(profileRoot, 'run-'));
    if (process.env.PAM_TEST_HEADLESS !== '1' && process.env.PAM_TEST_NESTED_DISPLAY !== '1') {
      throw new Error(
        'Headed functional Chrome must be started by npm run test, which keeps it on a nested display.',
      );
    }
    const launchOptions: LaunchPersistentContextOptions = {
      channel: 'chrome',
      chromiumSandbox: true,
      headless: process.env.PAM_TEST_HEADLESS === '1',
      viewport: { width: 1280, height: 720 },
      locale: 'fr-FR',
      ignoreHTTPSErrors: true,
      slowMo: 0,
      // Patchright adds --disable-blink-features=AutomationControlled by default;
      // channel:chrome rejects it as unsupported. Drop it, and keep a dummy
      // --disable-blink-features entry so Patchright does not push it back.
      ignoreDefaultArgs: ['--disable-blink-features=AutomationControlled'],
      args: functionalChromeArgs(),
    };
    const context = await launchPersistentContextWithRetry(profileDir, launchOptions);
    // Unique empty profile, plus a cookie wipe in case Chrome restored
    // anything from a crashed sibling directory. Auth cookies must not
    // leak into the next test's customer.
    await context.clearCookies();
    const storageResetId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const frontOrigin = new URL(loadTestEnv().frontBaseUrl).origin;
    await context.addInitScript(
      ({ origin, resetId }) => {
        // Init scripts also run in every child frame. Clearing storage there
        // used to erase a guest basket as soon as checkout mounted an iframe.
        // Reset the reusable profile exactly once per test, on the front's
        // top-level document; keep the marker across same-test reloads and
        // external payment/email round trips.
        if (window.top !== window || window.location.origin !== origin) return;
        const marker = '__pamsurin_e2e_storage_reset__';
        if (window.localStorage.getItem(marker) === resetId) return;
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.localStorage.setItem(marker, resetId);
        // Skip post-splash onboarding by default. The overlay locks body
        // scroll and traps focus, which breaks ordinary click/scroll
        // scenarios. Dedicated onboarding tests clear this key explicitly.
        window.localStorage.setItem('psn-onboarding-v1', 'completed');
      },
      { origin: frontOrigin, resetId: storageResetId },
    );
    try {
      await use(context);
    } finally {
      await closePersistentContextSafely(context, profileDir);
      await markProfileCleanExit(profileDir);
      await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
    }
  },

  page: async ({ context }, use, testInfo) => {
    // Chrome's launch tab can display a browser-owned first-tab banner on
    // some local installations. Keep it as an inert buffer and always run
    // the functional scenario in a fresh second tab, where that banner is
    // absent. The persistent context still closes every tab after the test.
    const launchPage = context.pages()[0] ?? (await context.newPage());
    const page = await context.newPage();
    if (page === launchPage) {
      throw new Error('Functional test page must be separate from Chrome\'s launch tab.');
    }
    await preparePageForTest(page, testInfo);
    watchFocusedPage(page);
    watchFocusedPage(launchPage);
    await attachDiagNetworkLogging(context, testInfo);
    const endDiag = await attachDiagPageLogging(page, testInfo);
    if (process.env.PAM_TEST_MODE === 'preprod') {
      const goto = page.goto.bind(page);
      page.goto = ((url, options) =>
        paceIfApiRequest(page, () =>
          goto(url, { waitUntil: 'domcontentloaded', ...options }),
        )) as typeof page.goto;
    }
    try {
      await use(page);
    } finally {
      try {
        await holdAfterAction(page);
      } catch {
        // Page may already be closed on hard failures.
      }
      try {
        await endDiag();
      } catch {
        // diag best-effort
      }
    }
  },
});

export { expect };
