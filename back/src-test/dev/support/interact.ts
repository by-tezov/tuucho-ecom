import { readFileSync } from 'node:fs';
import type { BrowserContext, Locator, Page, Request } from 'patchright/test';
import { expect } from 'patchright/test';
import { clampThrottleMs } from '../../../scripts/throttleValue.js';
import { tid } from './selectors.js';
import { actionDeadline, MAX_ACTION_TIMEOUT_MS } from './timeouts.js';
import { ensureOsFocused, withTestWindowFocus } from './windowFocus.js';

/**
 * Extra Patchright contexts (second window, `browser.newContext()`, a
 * freshly launched Chromium) do not inherit the serial fixture's init
 * script. Without this marker the post-splash overlay mounts on top of
 * the auth modal and swallows login clicks.
 */
export async function skipOnboardingOnContext(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('psn-onboarding-v1', 'completed');
    } catch {
      // Private mode / quota — tests still dismiss the overlay if it appears.
    }
  });
}

/**
 * Close the post-splash onboarding overlay when it is visible.
 * Ordinary fixtures pre-mark onboarding complete; this is a safety net for
 * races and for dedicated onboarding scenarios that clear that marker.
 */
export async function dismissOnboardingIfPresent(page: Page): Promise<void> {
  const overlay = page.getByTestId(tid.onboarding.root);
  if (!(await overlay.isVisible().catch(() => false))) return;
  await clickVisible(page.getByTestId(tid.onboarding.close));
  await expect(overlay).toBeHidden({ timeout: 10_000 });
}

/** Header account entry when anonymous. The footer now repeats the same label,
 * so page-wide `getByRole('button', { name: /se connecter/i })` is ambiguous. */
export function desktopLoginButton(page: Page): Locator {
  return page.getByRole('banner').getByRole('button', { name: /se connecter/i });
}

/** Auth settled on the anonymous branch: header login on desktop, tab bar on mobile. */
export async function expectAnonymousSession(
  page: Page,
  timeoutMs = MAX_ACTION_TIMEOUT_MS,
): Promise<void> {
  if ((page.viewportSize()?.width ?? 1_280) < 768) {
    await expect(page.getByTestId(tid.tabBar.orders)).toContainText(/se connecter/i, {
      timeout: timeoutMs,
    });
    return;
  }
  await expect(desktopLoginButton(page)).toBeVisible({ timeout: timeoutMs });
}

/**
 * Begin a customer journey at the only URL a functional scenario may type.
 * The entry splash then chooses the real customer landing page: Home on a
 * desktop viewport and Gallery on a handset. Every later same-site route in
 * the scenario must be reached through a visible link, button, tab, or menu.
 */
export async function startCustomerJourneyAtRoot(
  page: Page,
  expectedSession: 'anonymous' | 'authenticated' = 'anonymous',
): Promise<void> {
  try {
    await page.goto('/');
  } catch (error) {
    // Logout / auth redirects can still be settling when the next journey
    // starts. A single retry after Abort covers that transient race.
    if (!/ERR_ABORTED|Navigation interrupted|frame was detached/i.test(String(error))) {
      throw error;
    }
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  }
  if ((page.viewportSize()?.width ?? 1_280) < 768) {
    await expect(page.getByTestId(tid.gallery.page)).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
    await expect(page).toHaveURL(/\/gallery\/?$/);
    // A second browser tab may reuse the first tab's completed splash flag.
    // The gallery is visible a few frames before auth/cart restoration in
    // that case; wait for the customer-facing session label expected by this
    // journey. In the normal anonymous case this also proves add-to-cart is
    // genuinely usable and persistent rather than still bootstrapping.
    await expect(page.getByTestId(tid.tabBar.orders)).toContainText(
      expectedSession === 'anonymous' ? /se connecter/i : /^commandes$/i,
      {
        timeout: MAX_ACTION_TIMEOUT_MS,
      },
    );
    await dismissOnboardingIfPresent(page);
    return;
  }
  await expect(page.locator('#hero-h')).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
  await expect(page).toHaveURL(/\/home\/?$/);
  await dismissOnboardingIfPresent(page);
}

/** Checkout idle notice. A person has to dismiss it before anything under it. */
const CHECKOUT_SESSION_EXPIRED_DIALOG = /session de paiement expirée/i;

async function dismissCheckoutSessionExpiredIfPresent(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: CHECKOUT_SESSION_EXPIRED_DIALOG });
  if ((await dialog.isVisible().catch(() => false)) !== true) return;
  const action = dialog.getByTestId(tid.confirm.confirm).or(dialog.getByRole('button', { name: /continuer/i }));
  await action.first().click({ timeout: 10_000, force: false });
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function waitForLoadingOverlayGone(page: Page): Promise<void> {
  const loading = page.locator('[role="alertdialog"][aria-busy="true"]');
  await expect(loading).toHaveCount(0, { timeout: MAX_ACTION_TIMEOUT_MS });
}

/** Clear overlays a visitor would have to deal with before touching the page.
 * Loading is waited out. The checkout-idle dialog is dismissed with Continuer.
 * Other modals stay up so a later click cannot land on the page beneath them. */
export async function prepareHumanPointer(page: Page): Promise<void> {
  await waitForLoadingOverlayGone(page);
  await dismissCheckoutSessionExpiredIfPresent(page);
  await waitForLoadingOverlayGone(page);
}

/** Bring a locator into view using Patchright's native scrolling primitive. */
export async function reveal(
  locator: Locator,
  opts: { block?: ScrollLogicalPosition; holdMs?: number } = {},
): Promise<Locator> {
  await prepareHumanPointer(locator.page());

  // Patchright deliberately avoids Playwright's Runtime.enable path.  A
  // locator.evaluate-based scrolling helper therefore blocks before an
  // interaction on some pages.  Its native primitive scrolls every needed
  // container and remains compatible with the anti-detection execution model.
  const revealNative = async () => {
    await locator.scrollIntoViewIfNeeded({ timeout: 10_000 });
    await expect(locator).toBeVisible({ timeout: 10_000 });
  };
  try {
    await revealNative();
  } catch (error) {
    // React can replace a list/card between Patchright's scroll stability
    // samples (orders do this after a status refresh). A Locator is live, so
    // one fresh native scroll targets the replacement node rather than
    // treating that harmless remount as a product failure.
    if (/not attached to the DOM|detached from the DOM/i.test(String(error))) {
      await revealNative();
      return locator;
    }
    // Vite's first page request can race its just-started isolated API. The
    // app deliberately renders this outage state; a full reload resets its
    // health probe after the API is already ready. Only recover this known
    // transient state — every other missing locator remains a real failure.
    const page = locator.page();
    const serviceNotice = page.getByRole('heading', {
      name: /service momentanément perturbé|service temporarily disrupted/i,
    });
    if (!(await serviceNotice.isVisible().catch(() => false))) throw error;
    await page.waitForTimeout(750);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await revealNative();
  }
  if (opts.holdMs && opts.holdMs > 0) {
    await locator.page().waitForTimeout(opts.holdMs);
  }
  return locator;
}

function actionThrottleMs(): number {
  const file = process.env.PAM_TEST_THROTTLE_FILE;
  if (file) {
    try {
      const live = clampThrottleMs(readFileSync(file, 'utf8'));
      if (live !== undefined) return live;
    } catch {
      // The launch value still applies when the override file is unreadable.
    }
  }
  return clampThrottleMs(process.env.PAM_TEST_THROTTLE_MS ?? '') ?? 0;
}

function isPacedApiRequest(request: Request): boolean {
  const type = request.resourceType();
  if (type === 'websocket' || type === 'eventsource') return false;
  if (type === 'xhr' || type === 'fetch') return true;
  const api = process.env.PAM_API_BASE_URL?.replace(/\/$/, '');
  return Boolean(api && request.url().startsWith(api));
}

/**
 * Run a pointer action at full speed, then pause only when it caused an API
 * call (`--throttle`). Typing and UI-only clicks are not delayed. That keeps
 * preprod from being hammered without slowMo on every keystroke.
 */
export async function paceIfApiRequest<T>(page: Page, action: () => Promise<T>): Promise<T> {
  const throttle = actionThrottleMs();
  if (throttle <= 0 || page.isClosed()) return action();
  let hit = false;
  const onRequest = (request: Request): void => {
    if (isPacedApiRequest(request)) hit = true;
  };
  page.on('request', onRequest);
  try {
    const result = await action();
    if (!hit && !page.isClosed()) await page.waitForTimeout(80);
    if (hit && !page.isClosed()) await page.waitForTimeout(throttle);
    return result;
  } finally {
    page.off('request', onRequest);
  }
}

/**
 * Click only if a visitor's pointer would hit this control. Never `force`
 * and never `HTMLElement.click()`: those succeed through a mask / overlay
 * that would swallow a real tap (session-expired dialog, PIN modal, loading
 * overlay, a clipped mobile sheet).
 */
export async function clickUnobscured(locator: Locator): Promise<void> {
  await paceIfApiRequest(locator.page(), async () => {
    const attempt = async () => {
      await reveal(locator);
      await expect(locator).toBeEnabled();
      await locator.click({ trial: true, timeout: 10_000 });
      await locator.click({ timeout: 10_000, force: false });
    };
    try {
      await attempt();
    } catch {
      // Session-idle dialog / loading overlay can land between the trial and
      // the real click. Dismiss or wait, then retry once like a person would.
      await attempt();
    }
  });
}

export async function clickVisible(locator: Locator): Promise<void> {
  await clickUnobscured(locator);
}

/**
 * MobileNav's press-drag scroll capture can swallow a Patchright mouse
 * click on accordion labels and in-panel links. A DOM click still runs the
 * real onClick / Link navigation without re-entering that gesture path.
 */
export async function clickMobileNavControl(locator: Locator): Promise<void> {
  await paceIfApiRequest(locator.page(), async () => {
    await reveal(locator);
    await expect(locator).toBeEnabled();
    // Trial click proves a finger would hit this control. The real Patchright
    // mouse click is swallowed by MobileNav's press-drag capture, so the
    // product onClick still has to be fired from the element after that.
    await locator.click({ trial: true, timeout: 10_000 });
    await locator.evaluate((el: HTMLElement) => {
      el.click();
    });
  });
}

/** Open the mounted-but-hidden mobile navigation and prove its state changed. */
export async function openMobileNav(page: Page): Promise<Locator> {
  const toggle = page.getByTestId(tid.mobileNav.toggle);
  const panel = page.getByTestId(tid.mobileNav.panel);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await clickVisible(toggle);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      // MobileNav can remount during the first gallery hydration tick; the
      // second click targets the same live locator after that remount.
      await clickVisible(toggle);
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 1_500 });
  }
  await expect(panel).toBeVisible({ timeout: 1_500 });
  return panel;
}

/** Close the mobile drawer when it is covering header actions such as Offrir. */
export async function closeMobileNavIfOpen(page: Page): Promise<void> {
  const toggle = page.getByTestId(tid.mobileNav.toggle);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') return;
  await clickVisible(toggle);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 1_500 });
  await expect(page.getByTestId(tid.mobileNav.panel)).toBeHidden({ timeout: 1_500 });
}

/** Checkout success is a button in-cart and a link after an external return;
 * both are the same customer-visible action. */
export function viewOrdersControl(scope: Page | Locator): Locator {
  return scope
    .getByRole('button', { name: /voir mes commandes/i })
    .or(scope.getByRole('link', { name: /voir mes commandes/i }));
}

export async function fillVisible(locator: Locator, value: string): Promise<void> {
  const attempt = async () => {
    await reveal(locator);
    await expect(locator).toBeEnabled();
    await withTestWindowFocus(locator.page(), async () => {
      await locator.click({ trial: true, timeout: 10_000 });
      await ensureOsFocused(locator);
      await locator.fill(value);
      // A successful fill call alone is not proof that a controlled field kept
      // the value. React validation/remounts can otherwise leave a test typing
      // into a stale node and submitting an empty form.
      if ((await locator.getAttribute('type')) === 'tel') {
        // The French phone field deliberately formats valid numbers for display
        // (0601020304 → 06 01 02 03 04). Verify the semantic value while allowing
        // that presentation formatting.
        await expect
          .poll(async () => (await locator.inputValue()).replace(/\D/g, ''))
          .toBe(value.replace(/\D/g, ''));
      } else {
        await expect(locator).toHaveValue(value);
      }
    });
  };
  try {
    await attempt();
  } catch {
    await attempt();
  }
}

export async function checkVisible(locator: Locator): Promise<void> {
  await paceIfApiRequest(locator.page(), async () => {
    await reveal(locator);
    await locator.click({ trial: true, timeout: 10_000 });
    try {
      await locator.check({ timeout: 3_000, force: false });
    } catch {
      const target = (await locator.locator('xpath=ancestor::label[1]').count()) > 0
        ? locator.locator('xpath=ancestor::label[1]').first()
        : locator;
      await reveal(target);
      await expect(target).toBeEnabled();
      await target.click({ trial: true, timeout: 10_000 });
      await target.click({ timeout: 10_000, force: false });
    }
    await expect(locator).toBeChecked();
  });
}

export async function typeVisible(locator: Locator, value: string, delay = 20): Promise<void> {
  await reveal(locator);
  await expect(locator).toBeEnabled();
  await withTestWindowFocus(locator.page(), async () => {
    await locator.click({ trial: true, timeout: 10_000 });
    await ensureOsFocused(locator);
    await locator.fill('');
    await locator.pressSequentially(value, { delay });
    await expect(locator).toHaveValue(value);
  });
}

/** Fill segmented one-character OTP controls without treating the first
 * input as a single six-character field. Each digit is focused and verified
 * independently; this also catches a remounted or mis-targeted OTP input. */
export async function typeOtpVisible(container: Locator, value: string): Promise<void> {
  const inputs = container.locator('input');
  const count = await inputs.count();
  if (count <= 1) {
    await typeVisible(inputs.first(), value);
    return;
  }
  if (count !== value.length) {
    throw new Error(`OTP input count ${count} does not match value length ${value.length}.`);
  }
  // Clear from the last cell so a concatenated OTP string does not collapse
  // remaining digits into earlier boxes (fill('') on box 0 of "5678" becomes "678").
  await withTestWindowFocus(container.page(), async () => {
    for (let index = count - 1; index >= 0; index -= 1) {
      const input = inputs.nth(index);
      await reveal(input);
      await expect(input).toBeEnabled();
      await input.click({ trial: true, timeout: 10_000 });
      await ensureOsFocused(input);
      if ((await input.inputValue()) !== '') {
        await input.press('Backspace');
        await expect(input).toHaveValue('');
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      const input = inputs.nth(index);
      await reveal(input);
      await expect(input).toBeEnabled();
      await input.click({ trial: true, timeout: 10_000 });
      await ensureOsFocused(input);
      await input.pressSequentially(value[index]!);
      await expect(input).toHaveValue(value[index]!);
    }
  });
}

const AUTHORIZE_NAME = /authorize test payment|autoriser le paiement|autoriser/i;

/** Stripe PayPal/async test pages expose authorize as a link (sometimes a button). */
export function stripeAuthorizeControl(target: Page): Locator {
  return target
    .getByRole('link', { name: AUTHORIZE_NAME })
    .or(target.getByRole('button', { name: AUTHORIZE_NAME }))
    .or(target.locator('a', { hasText: AUTHORIZE_NAME }))
    .first();
}

/** Click Stripe/PayPal sandbox "Authorize Test Payment" on a page (scroll into view). */
export async function clickStripeTestAuthorize(target: Page): Promise<void> {
  const deadline = actionDeadline();
  while (Date.now() < deadline) {
    const control = stripeAuthorizeControl(target);
    if (await control.isVisible().catch(() => false)) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeVisible();
      await control.click();
      return;
    }
    for (const frame of target.frames()) {
      const frameControl = frame
        .getByRole('link', { name: AUTHORIZE_NAME })
        .or(frame.getByRole('button', { name: AUTHORIZE_NAME }))
        .first();
      if (await frameControl.isVisible().catch(() => false)) {
        await frameControl.scrollIntoViewIfNeeded();
        await frameControl.click();
        return;
      }
    }
    await target.waitForTimeout(250);
  }
  throw new Error(`Stripe/PayPal test authorize control not found within ${MAX_ACTION_TIMEOUT_MS}ms`);
}

/** Hold after the last assertion so a headed watcher can see the finished state. */
export async function holdAfterAction(page: Page): Promise<void> {
  const throttle = actionThrottleMs();
  const headed = process.env.PAM_TEST_HEADLESS !== '1';
  const holdMs = throttle > 0 ? Math.max(throttle, 800) : headed ? 1_200 : 0;
  if (holdMs > 0 && !page.isClosed()) {
    await page.waitForTimeout(holdMs);
  }
}
