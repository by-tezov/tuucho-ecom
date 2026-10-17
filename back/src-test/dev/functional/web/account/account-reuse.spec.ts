import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { AddressPages } from '../../../support/pages/address.pages.js';
import { AccountPages } from '../../../support/pages/account.pages.js';

test.describe('Desktop returning customer', () => {
  // Stay on the suite's single persistent Chrome: clear cookies + a new tab
  // simulate a returning visit without launchPersistentContext / browser.launch.
  test('web fresh session: register, logout, and login keep the account data', async ({
    page,
    context,
  }) => {
    const email = uniqueEmail('web-returning-customer');

    const auth = new AuthPages(page);
    await auth.registerFromDesktopAccountModal(email, testPassword);
    await auth.openDesktopAccount();
    const addresses = new AddressPages(page);
    await addresses.addHomeLivraison();
    await auth.logout();

    await context.clearCookies();
    const returning = await context.newPage();
    try {
      await page.close({ runBeforeUnload: false }).catch(() => undefined);
      const returningAuth = new AuthPages(returning);
      await returningAuth.loginFromDesktopAccountModal(email, testPassword);
      await returningAuth.openDesktopAccount();
      const account = new AccountPages(returning);
      await account.gotoAddresses();
      await expect(returning.getByText(/Maison E2E.*10 rue de Test/i)).toBeVisible();
    } finally {
      // Leave `returning` as the sole open tab for the next test's tab swap.
      for (const open of context.pages()) {
        if (open === returning || open.isClosed()) continue;
        await open.close({ runBeforeUnload: false }).catch(() => undefined);
      }
    }
  });
});
