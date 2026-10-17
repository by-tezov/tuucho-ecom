import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { testPassword } from '../../../support/env.js';
import { clickVisible, startCustomerJourneyAtRoot, desktopLoginButton } from '../../../support/interact.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { ONBOARDING_STORAGE_KEY, OnboardingPages } from '../../../support/pages/onboarding.pages.js';
import { tid } from '../../../support/selectors.js';
import { MAX_ACTION_TIMEOUT_MS } from '../../../support/timeouts.js';
import { shopPathWithSearch } from '../../../support/shopPath.js';

test.describe('Functional onboarding (web)', () => {
  test('guest fixtures: skip the tour so the shop stays interactive', async ({ page }) => {
    await startCustomerJourneyAtRoot(page);
    await expect(page.getByTestId(tid.onboarding.root)).toBeHidden();
    await clickVisible(desktopLoginButton(page));
    await expect(page.getByTestId(tid.auth.useEmailInstead)).toBeVisible();
  });

  test('guest introduction: sliding through it marks the tour completed', async ({ page }) => {
    const onboarding = new OnboardingPages(page);
    await onboarding.forceShowAfterLanding();
    await expect(page.getByRole('heading', { name: /qualité du fait main|handmade quality/i })).toBeVisible();
    await onboarding.advanceToEnd();
    await onboarding.expectLocalCompleted();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#hero-h')).toBeVisible();
    await onboarding.expectClosed();
  });

  test('guest close: dismisses the tour without requiring every slide', async ({ page }) => {
    const onboarding = new OnboardingPages(page);
    await onboarding.forceShowAfterLanding();
    await onboarding.dismissWithClose();
    await onboarding.expectLocalCompleted();
  });

  test('guest deals slide: shows volume and shipping sections when cart rules exist', async ({
    page,
  }) => {
    const onboarding = new OnboardingPages(page);
    await onboarding.forceShowAfterLanding();
    await clickVisible(onboarding.next());
    await expect(page.getByRole('heading', { name: /remises et livraison|discounts and free shipping/i })).toBeVisible();
    await expect(page.getByText(/^remises volume$|^volume discounts$/i)).toBeVisible();
    await expect(page.getByText(/^livraison$|^shipping$/i)).toBeVisible();
    await expect(page.locator('[class*="progressTrack"]').first()).toBeVisible();
  });

  test('guest shared product link: defers the tour until leaving the gallery', async ({ page }) => {
    await page.setViewportSize({ width: 1_280, height: 900 });
    await startCustomerJourneyAtRoot(page);
    await page.evaluate((key) => window.localStorage.removeItem(key), ONBOARDING_STORAGE_KEY);

    // Same shape as PhotoLightbox share (`/gallery?product=<uid>`), including
    // the cold splash rewrite that resumes into this URL.
    await page.goto(shopPathWithSearch(`/gallery?product=${E2E_PRODUCT_UIDS.A1}`), {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId(tid.gallery.lightbox)).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
    await expect(page.getByTestId(tid.onboarding.root)).toBeHidden();
    await expect(page).toHaveURL(/\/gallery\/?/);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId(tid.gallery.lightbox)).toBeHidden({ timeout: 10_000 });
    await clickVisible(page.getByRole('banner').getByRole('link', { name: /^accueil$/i }));
    await expect(page.locator('#hero-h')).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
    await expect(page.getByTestId(tid.onboarding.root)).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
  });

  test('account: replay reopens the tour from Mon compte', async ({ page }) => {
    const auth = new AuthPages(page);
    const onboarding = new OnboardingPages(page);
    await auth.registerFromDesktopAccountModal(uniqueEmail('ui-onboarding-replay'), testPassword);
    await auth.openDesktopAccount();

    await clickVisible(page.getByTestId(tid.account.onboardingReplay));
    await onboarding.expectOpen();
    await onboarding.dismissWithClose();
    await onboarding.expectClosed();
  });
});
