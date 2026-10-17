import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { AccountPages } from '../../../support/pages/account.pages.js';
import { AddressPages } from '../../../support/pages/address.pages.js';
import { tid } from '../../../support/selectors.js';
import { shopPath } from '../../../support/shopPath.js';

async function registerAndOpenAccount(page: import('patchright/test').Page, email: string) {
  const auth = new AuthPages(page);
  await auth.register(email, testPassword);
  await page.goto(shopPath('/account'));
  await expect(page.getByTestId(tid.account.profileForm)).toBeVisible();
}

test.describe('Functional mobile account', () => {
  test('Mondial Relay pickup point: search finds a point and it is added', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 633 });
    await registerAndOpenAccount(page, uniqueEmail('ui-mr-point-m'));
    const addresses = new AddressPages(page);
    await addresses.addMondialRelayPickup('75001');
    await expect(page.getByTestId(tid.account.addressesPage)).toBeVisible();
    await expect(page.getByText(/Mondial Relay/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('addresses page: it opens with the add control', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 633 });
    await registerAndOpenAccount(page, uniqueEmail('ui-addr-m'));
    const account = new AccountPages(page);
    await account.gotoAddresses();
    await expect(page.getByTestId(tid.account.addAddress)).toBeVisible();
  });
});
