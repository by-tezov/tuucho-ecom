import { expect, request as playwrightRequest, type Page } from 'patchright/test';
import { test } from '../../../support/fixtures.js';
import { registerUser, uniqueEmail } from '../../../support/api.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { loadTestEnv } from '../../../support/env.js';
import { extractOtpFromMail, waitForMail } from '../../../support/mail.js';
import { checkVisible, clickVisible, dismissOnboardingIfPresent, fillVisible, startCustomerJourneyAtRoot, typeOtpVisible } from '../../../support/interact.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { tid } from '../../../support/selectors.js';

async function openGuestCart(page: Page) {
  await startCustomerJourneyAtRoot(page);
  await dismissOnboardingIfPresent(page);
  const gallery = new GalleryPages(page);
  await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A2, { shapeKey: 'carré', size: 'S' });
  await new CartPages(page).goto();
  await expect(page.getByTestId(tid.guest.email)).toBeVisible({ timeout: 15_000 });
}

async function completeGuestOtp(
  page: Page,
  email: string,
  sinceMs: number,
): Promise<void> {
  const otp = page.getByTestId(tid.guest.otp);
  await expect(otp).toBeVisible({ timeout: 15_000 });
  const mail = await waitForMail({ kind: 'user', toIncludes: email, sinceMs, timeoutMs: 15_000 });
  await typeOtpVisible(otp, extractOtpFromMail(mail));
  await clickVisible(page.getByTestId(tid.guest.otpSubmit));
  await expect(page.getByTestId(tid.guest.email)).toBeHidden({ timeout: 15_000 });
  await resolveGuestMergeIfPresent(page);
}

async function resolveGuestMergeIfPresent(page: Page): Promise<void> {
  const merge = page.getByTestId(tid.loginMerge.dialog);
  if (await merge.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)) {
    await new CartPages(page).createCartFromGuestCart('Panier OTP E2E');
  }
}

async function openGuestEmailLogin(page: Page): Promise<void> {
  const password = page.getByTestId(tid.guest.password);
  const continueWithEmail = page.getByTestId(tid.guest.login);
  await expect(continueWithEmail.or(password).first()).toBeVisible({ timeout: 15_000 });
  if (await password.isVisible().catch(() => false)) return;
  await clickVisible(continueWithEmail);
  await expect(password).toBeVisible({ timeout: 15_000 });
}

async function requestGuestOtp(page: Page, email: string): Promise<number> {
  await fillVisible(page.getByTestId(tid.guest.email), email);
  await openGuestEmailLogin(page);
  await expect(page.getByTestId(tid.guest.password)).toBeVisible();
  const sinceMs = Date.now() - 1_000;
  await clickVisible(page.getByTestId(tid.guest.forgot));
  await expect(page.getByTestId(tid.guest.password)).toBeHidden();
  // The server reveals whether consent is needed only after the first submit:
  // existing accounts advance straight to OTP; a new address moves to the
  // account-creation consent screen and then retries the same OTP request.
  const otp = page.getByTestId(tid.guest.otp);
  const accountConsent = page.getByTestId('guest-checkout-account-gdpr');
  await clickVisible(page.getByTestId(tid.guest.loginSubmit));
  await Promise.race([
    otp.waitFor({ state: 'visible', timeout: 15_000 }),
    accountConsent.waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
  if (await accountConsent.isVisible()) {
    await expect(accountConsent).toBeVisible({ timeout: 15_000 });
    await checkVisible(accountConsent);
    await clickVisible(page.getByTestId('guest-checkout-account-consent-submit'));
    await expect(otp).toBeVisible({ timeout: 15_000 });
  }
  return sinceMs;
}

test.describe('Cart authentication', () => {
  test('web existing shopper: can connect from cart by signup OTP', async ({ page }) => {
    await page.setViewportSize({ width: 1_280, height: 900 });
    const api = await playwrightRequest.newContext({ baseURL: loadTestEnv().apiBaseUrl });
    const existing = await registerUser(api, { email: uniqueEmail('cart-web-existing') });
    await api.dispose();

    await openGuestCart(page);
    const sinceMs = await requestGuestOtp(page, existing.email);
    await completeGuestOtp(page, existing.email, sinceMs);
  });

  test('web guest OTP account creation: asks for legal consent only after a new email is submitted', async ({ page }) => {
    await page.setViewportSize({ width: 1_280, height: 900 });
    await openGuestCart(page);

    const email = uniqueEmail('cart-web-otp');
    await fillVisible(page.getByTestId(tid.guest.email), email);

    // The guest-payment checkbox is distinct from account creation. The
    // latter must remain absent until the backend confirms this is a new
    // address, avoiding a CGU prompt for ordinary existing-account login.
    await expect(page.getByTestId('guest-checkout-account-gdpr')).toHaveCount(0);

    const sinceMs = await requestGuestOtp(page, email);
    await completeGuestOtp(page, email, sinceMs);
  });

  test('mobile existing shopper: connects from cart by OTP', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 633 });
    await connectExistingShopperViaCartOtp(page);
  });

  test('mobile existing shopper: a cancelled registration password explains itself on cart login', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 633 });
    const existing = await connectExistingShopperViaCartOtp(page);
    await new AuthPages(page).logout();
    await expect(page.getByTestId(tid.tabBar.orders)).toContainText(/se connecter/i, {
      timeout: 15_000,
    });
    await openGuestCart(page);
    await openGuestEmailLogin(page);
    await expect(page.getByTestId(tid.guest.forgot)).toBeVisible();
    await fillVisible(page.getByTestId(tid.guest.email), existing.email);
    await fillVisible(page.getByTestId(tid.guest.password), existing.password);
    await clickVisible(page.getByTestId(tid.guest.loginSubmit));
    await expect(page.getByRole('alert').filter({ hasText: /annulé lors de la vérification/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId(tid.guest.email)).toBeVisible();
  });
});

async function connectExistingShopperViaCartOtp(page: Page) {
  const api = await playwrightRequest.newContext({ baseURL: loadTestEnv().apiBaseUrl });
  const existing = await registerUser(api, { email: uniqueEmail('cart-mobile-existing') });
  await api.dispose();
  await openGuestCart(page);
  const signupSinceMs = await requestGuestOtp(page, existing.email);
  await completeGuestOtp(page, existing.email, signupSinceMs);
  return existing;
}
