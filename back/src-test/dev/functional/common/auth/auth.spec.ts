// Shared desktop and mobile authentication coverage.
import { test, expect } from '../../../support/fixtures.js';
import { registerUser, uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { extractTokenFromMail, waitForMail } from '../../../support/mail.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { tid } from '../../../support/selectors.js';
import { clickVisible, fillVisible, reveal } from '../../../support/interact.js';

const RULE_IDS = ['minLength', 'uppercase', 'lowercase', 'digit', 'special'] as const;

/** Passwords that fail exactly one mandatory complexity rule each. */
const WEAK_BY_RULE: Record<(typeof RULE_IDS)[number], string> = {
  minLength: 'Aa1!', // too short
  uppercase: 'abcdefg1!',
  lowercase: 'ABCDEFG1!',
  digit: 'Abcdefgh!',
  special: 'Abcdefg1',
};

async function openPasswordRules(page: import('patchright/test').Page) {
  const auth = new AuthPages(page);
  await auth.openDesktopRegisterModal();
  await fillVisible(page.getByTestId(tid.auth.email), uniqueEmail('pwd-rules'));
  await clickVisible(page.getByTestId('auth-toggle-password-rules'));
  return auth;
}

test.describe('Functional auth', () => {
  test('register password rules: an empty password leaves every rule neutral', async ({ page }) => {
    const auth = await openPasswordRules(page);
    for (const id of RULE_IDS) {
      await expect(auth.passwordRule(id)).toHaveAttribute('data-state', 'neutral');
    }
  });

  for (const id of RULE_IDS) {
    test(`register password rule ${id}: shows pending when only that rule fails`, async ({ page }) => {
      const auth = await openPasswordRules(page);
      await fillVisible(page.getByTestId(tid.auth.password), WEAK_BY_RULE[id]);
      await reveal(auth.passwordRule(id));
      await expect(auth.passwordRule(id)).toHaveAttribute('data-state', 'pending');
      for (const other of RULE_IDS) {
        if (other === id) continue;
        await expect(auth.passwordRule(other)).toHaveAttribute('data-state', 'passed');
      }
    });
  }

  test('register password rules: a strong password marks every rule passed', async ({ page }) => {
    const auth = await openPasswordRules(page);
    await fillVisible(page.getByTestId(tid.auth.password), testPassword);
    for (const id of RULE_IDS) {
      await expect(auth.passwordRule(id)).toHaveAttribute('data-state', 'passed');
    }
  });

  test('register weak password: consent then shows the password alert', async ({ page }) => {
    await openPasswordRules(page);
    await fillVisible(page.getByTestId(tid.auth.password), WEAK_BY_RULE.special);
    await clickVisible(page.getByTestId(tid.auth.submit));
    await expect(page.getByTestId(tid.auth.consent)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId(tid.auth.consent).check();
    await clickVisible(page.getByTestId(tid.auth.consentSubmit));
    // The app also mounts an empty assertive live region (role="alert") on
    // document.body. Scope to the password message so that region is not a
    // second match.
    const passwordAlert = page.getByRole('alert').filter({ hasText: /critères|sécurité|mot de passe/i });
    await expect(passwordAlert).toBeVisible({ timeout: 15_000 });
  });

  test('register and email confirmation: login then opens the account', async ({ page }) => {
    const email = uniqueEmail('ui-confirm');
    const auth = new AuthPages(page);
    await auth.registerAndConfirmEmailFromDesktopAccountModal(email, testPassword);
    // Register authenticates; log out so login can be exercised for real.
    await auth.logout();
    await auth.loginFromDesktopAccountModal(email, testPassword);
    await auth.openDesktopAccount();
  });

  test('registration mail: the confirmation token is dumped', async ({ page }) => {
    const email = uniqueEmail('ui-reg');
    const sinceMs = Date.now() - 500;
    const auth = new AuthPages(page);
    await auth.registerFromDesktopAccountModal(email, testPassword);

    const userMail = await waitForMail({
      kind: 'user',
      toIncludes: email,
      sinceMs,
      timeoutMs: 15_000,
    });
    expect(extractTokenFromMail(userMail)).toBeTruthy();
  });

  test('registration mail: the spy copy is dumped', async ({ page }) => {
    const email = uniqueEmail('ui-reg-spy');
    const sinceMs = Date.now() - 500;
    const auth = new AuthPages(page);
    await auth.registerFromDesktopAccountModal(email, testPassword);
    await waitForMail({ kind: 'spy', sinceMs, timeoutMs: 15_000 });
  });

  test('desktop mailbox OTP login: the shopper reaches the account', async ({ page, request }) => {
    const { email } = await registerUser(request, { email: uniqueEmail('ui-desktop-otp') });
    const auth = new AuthPages(page);
    await auth.loginWithOtpFromDesktopAccountModal(email);
    await auth.openDesktopAccount();
    await expect(page.getByTestId(tid.account.profileForm)).toBeVisible();
  });

  test('mobile login: the shopper reaches the account', async ({ page }) => {
    const email = uniqueEmail('ui-login');
    await page.setViewportSize({ width: 390, height: 633 });
    const auth = new AuthPages(page);
    await auth.registerFromMobileOrders(email, testPassword);
    await auth.openMobileAccount();
    await auth.logout();
    await auth.loginFromMobileOrders(email, testPassword);
    await auth.openMobileAccount();
    await expect(page.getByTestId(tid.account.profileForm)).toBeVisible();
  });

  test('mobile register and email confirmation: login then opens the account', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 633 });
    const email = uniqueEmail('ui-full-flow');
    const auth = new AuthPages(page);

    await auth.registerAndConfirmEmailFromMobileOrders(email, testPassword);
    // Confirmation is a full-document email-link navigation; the fresh
    // document intentionally has no in-memory session. Log in through the
    // public mobile flow before opening the account menu.
    await auth.loginFromMobileOrders(email, testPassword);
    await auth.openMobileAccount();
    await expect(page.getByTestId(tid.account.profileForm)).toBeVisible();
  });

  test('create account without consent: opens the dedicated legal-consent step', async ({ page }) => {
    const auth = new AuthPages(page);
    await auth.openDesktopRegisterModal();
    await fillVisible(page.getByTestId(tid.auth.email), uniqueEmail('noconsent'));
    await fillVisible(page.getByTestId(tid.auth.password), testPassword);
    await clickVisible(page.getByTestId(tid.auth.submit));
    await expect(page.getByTestId(tid.auth.consent)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(tid.auth.consentSubmit)).toBeVisible();
  });
});
