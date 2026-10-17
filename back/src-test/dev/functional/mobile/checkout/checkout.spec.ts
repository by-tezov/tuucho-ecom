import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { AddressPages } from '../../../support/pages/address.pages.js';
import { AccountPages } from '../../../support/pages/account.pages.js';
import { tid } from '../../../support/selectors.js';
import { clickVisible, viewOrdersControl } from '../../../support/interact.js';

const MOBILE = { width: 390, height: 633 };

test.describe('Mobile checkout: customer journeys', () => {
  test('mobile complete login: Commandes, account creation, logout, and login all reach the account', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const email = uniqueEmail('mobile-login');
    const auth = new AuthPages(page);

    await auth.registerFromMobileOrders(email, testPassword);
    // Registration creates the session; visit the actual account menu, then
    // leave it as a customer would so the login form is genuinely exercised.
    await auth.openMobileAccount();
    await auth.logout();
    await auth.loginFromMobileOrders(email, testPassword);
    await auth.openMobileAccount();
    await expect(page.getByTestId(tid.account.profileForm)).toBeVisible();
  });

  test('mobile connected customer: address, gallery, card order, and Commandes all complete', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const email = uniqueEmail('mobile-connected-order');
    const auth = new AuthPages(page);
    await auth.registerFromMobileOrders(email, testPassword);
    await auth.openMobileAccount();

    const addresses = new AddressPages(page);
    await addresses.addHomeLivraison();
    const gallery = new GalleryPages(page);
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A2, { shapeKey: 'carré', size: 'M' });

    const cart = new CartPages(page);
    await cart.goto();
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess();
    expect(orderNumber.length).toBeGreaterThan(3);

    await clickVisible(viewOrdersControl(page.getByTestId(tid.cart.orderSuccess)));
    const account = new AccountPages(page);
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
  });
});
