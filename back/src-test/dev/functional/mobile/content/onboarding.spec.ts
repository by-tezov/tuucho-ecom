import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { testPassword } from '../../../support/env.js';
import { clickVisible, startCustomerJourneyAtRoot } from '../../../support/interact.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { ONBOARDING_STORAGE_KEY, OnboardingPages } from '../../../support/pages/onboarding.pages.js';
import { tid } from '../../../support/selectors.js';
import { MAX_ACTION_TIMEOUT_MS } from '../../../support/timeouts.js';
import { shopPathWithSearch } from '../../../support/shopPath.js';

test.describe('Functional onboarding (mobile)', () => {
  test('guest fixtures: skip the tour so Commandes stays usable', async ({ page }) => {
    await startCustomerJourneyAtRoot(page);
    await expect(page.getByTestId(tid.onboarding.root)).toBeHidden();
    await clickVisible(page.getByTestId(tid.tabBar.orders));
    await expect(page.getByTestId(tid.auth.useEmailInstead)).toBeVisible();
  });

  test('guest introduction: the full-screen tour can be completed', async ({ page }) => {
    const onboarding = new OnboardingPages(page);
    await onboarding.forceShowAfterLanding();
    await onboarding.advanceToEnd();
    await onboarding.expectLocalCompleted();
  });

  test('guest shared product link: defers the tour until leaving the gallery', async ({ page }) => {
    await startCustomerJourneyAtRoot(page);
    await page.evaluate((key) => window.localStorage.removeItem(key), ONBOARDING_STORAGE_KEY);

    await page.goto(shopPathWithSearch(`/gallery?product=${E2E_PRODUCT_UIDS.A1}`), {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId(tid.gallery.lightbox)).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
    await expect(page.getByTestId(tid.onboarding.root)).toBeHidden();

    // Leave gallery entirely (mobile Accueil still lands on gallery). Cart is
    // a different route, so share deferral clears and the tour can open.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(tid.gallery.lightbox)).toBeHidden({ timeout: 10_000 });
    await clickVisible(page.getByTestId(tid.tabBar.cart));
    await expect(page).toHaveURL(/\/cart\/?/, { timeout: MAX_ACTION_TIMEOUT_MS });
    await expect(page.getByTestId(tid.onboarding.root)).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
  });

  test('account: replay from Mon compte reopens the tour', async ({ page }) => {
    const auth = new AuthPages(page);
    const onboarding = new OnboardingPages(page);
    await auth.registerFromMobileOrders(uniqueEmail('ui-onboarding-mobile'), testPassword);
    await auth.openMobileAccount();
    await clickVisible(page.getByTestId(tid.account.onboardingReplay));
    await onboarding.expectOpen();
    await onboarding.dismissWithClose();
  });
});
