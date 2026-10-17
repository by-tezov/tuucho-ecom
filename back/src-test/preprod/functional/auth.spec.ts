import { test, expect } from '../../dev/support/fixtures.js';
import { AuthPages } from '../../dev/support/pages/auth.pages.js';
import { MOBILE, registerConfirmAndLogin } from '../support/criticalPath.js';

test.describe('Preprod mobile auth', () => {
  test('mobile create account: confirm from folder mail then password login', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const { email } = await registerConfirmAndLogin(page);
    expect(email).toMatch(/@pamsurin\.test$/i);
  });

  test('mobile OTP login: reaches the account after a password session', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const { email } = await registerConfirmAndLogin(page);
    const auth = new AuthPages(page);
    await auth.logout();
    await auth.loginWithOtpFromMobileOrders(email);
    await auth.expectMobileAuthenticated();
  });
});
