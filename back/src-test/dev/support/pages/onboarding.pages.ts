import type { Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { clickVisible, startCustomerJourneyAtRoot } from '../interact.js';
import { tid } from '../selectors.js';
import { MAX_ACTION_TIMEOUT_MS } from '../timeouts.js';

/** Guest/local completion marker shared with pamsurin-front onboardingGate. */
export const ONBOARDING_STORAGE_KEY = 'psn-onboarding-v1';

/**
 * Drive the post-splash shop introduction overlay in functional scenarios.
 * Ordinary fixtures pre-mark onboarding complete; call
 * `forceShowAfterLanding` when a scenario needs the live tour.
 */
export class OnboardingPages {
  constructor(private readonly page: Page) {}

  root() {
    return this.page.getByTestId(tid.onboarding.root);
  }

  next() {
    return this.page.getByTestId(tid.onboarding.next);
  }

  close() {
    return this.page.getByTestId(tid.onboarding.close);
  }

  prev() {
    return this.page.getByTestId(tid.onboarding.prev);
  }

  steps() {
    return this.page.getByTestId(tid.onboarding.step);
  }

  /** Land as a guest, clear the fixture skip marker, reload so the tour opens. */
  async forceShowAfterLanding(): Promise<void> {
    await startCustomerJourneyAtRoot(this.page);
    await this.page.evaluate((key) => window.localStorage.removeItem(key), ONBOARDING_STORAGE_KEY);
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    if ((this.page.viewportSize()?.width ?? 1_280) < 768) {
      await expect(this.page.getByTestId(tid.gallery.page)).toBeVisible({
        timeout: MAX_ACTION_TIMEOUT_MS,
      });
    } else {
      await expect(this.page.locator('#hero-h')).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
    }
    await expect(this.root()).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
  }

  async expectOpen(): Promise<void> {
    await expect(this.root()).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
  }

  async expectClosed(): Promise<void> {
    await expect(this.root()).toBeHidden({ timeout: 10_000 });
  }

  async advanceToEnd(): Promise<void> {
    await this.expectOpen();
    const stepCount = await this.steps().count();
    expect(stepCount).toBeGreaterThanOrEqual(2);
    for (let index = 0; index < stepCount - 1; index += 1) {
      await clickVisible(this.next());
      await expect(this.steps().nth(index + 1)).toHaveAttribute('aria-current', 'true');
    }
    await expect(this.next()).toHaveText(/c’est compris|got it|entendido|ho capito|begrepen|percebi|เข้าใจแล้ว/i);
    await clickVisible(this.next());
    await this.expectClosed();
  }

  async dismissWithClose(): Promise<void> {
    await this.expectOpen();
    await clickVisible(this.close());
    await this.expectClosed();
  }

  async expectLocalCompleted(): Promise<void> {
    await expect
      .poll(() => this.page.evaluate((key) => window.localStorage.getItem(key), ONBOARDING_STORAGE_KEY))
      .toBe('completed');
  }
}
