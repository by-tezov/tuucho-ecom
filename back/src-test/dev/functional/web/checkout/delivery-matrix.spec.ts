import { test, expect } from '../../../support/fixtures.js';
import { enableAllShopPaymentMethods, uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { AddressPages } from '../../../support/pages/address.pages.js';
import { reveal } from '../../../support/interact.js';
import { tid } from '../../../support/selectors.js';

/**
 * Checkout delivery × payment matrix. Saved-card radio (`cart-pay-card`) only
 * appears after a card is remembered; a fresh account shows PayPal, new-card,
 * and Bancontact in the payment overflow until a BE delivery address is selected.
 */
async function registerAddOneSetOpenCart(page: import('patchright/test').Page, slug: string) {
  const auth = new AuthPages(page);
  await auth.registerFromDesktopAccountModal(uniqueEmail(slug), testPassword);
  await auth.openDesktopAccount();
  const gallery = new GalleryPages(page);
  await gallery.goto();
  await expect(gallery.cards().first()).toBeVisible();
  await gallery.addFirstAvailableToCart(1);
  const cart = new CartPages(page);
  await cart.goto();
  await reveal(page.getByTestId(tid.cart.page));
  return cart;
}

test.describe('Functional checkout delivery options', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });

  test('cart: PayPal, Bancontact overflow, and new-card are offered', async ({ page }) => {
    const cart = await registerAddOneSetOpenCart(page, 'chk-matrix-pay');
    await expect(page.getByTestId(tid.cart.payPaypal)).toBeVisible();
    await expect(page.getByTestId(tid.cart.payBancontact)).toHaveCount(0);
    await cart.expectBancontactListedInPaymentOverflow();
    await expect(page.getByTestId(tid.cart.payNewCard)).toBeVisible();
  });

  test('cart: courier options and add-address are offered', async ({ page }) => {
    await registerAddOneSetOpenCart(page, 'chk-matrix-courier');
    const courierSection = page.locator('section[aria-labelledby="cart-courier-heading"]');
    await expect(courierSection).toBeVisible();
    // Listed radios and "+ autres" are both on screen once couriers settle.
    // One `.or()` locator then matches two nodes and fails strict mode.
    await expect.poll(async () => {
      const options = await courierSection.getByTestId(tid.cart.courierOption).count();
      const more = await courierSection.getByRole('button', { name: /\+ autres/i }).count();
      return options > 0 || more > 0;
    }).toBe(true);
    await expect(page.getByTestId(tid.cart.addAddress)).toBeVisible();
  });

  test('Mondial Relay picker: selects a point, confirms it, and saves recipient details', async ({
    page,
  }) => {
    const auth = new AuthPages(page);
    await auth.registerFromDesktopAccountModal(uniqueEmail('delivery-mondial'), testPassword);
    await auth.openDesktopAccount();
    await new AddressPages(page).addMondialRelayPickup('75001');
    await expect(page.getByTestId(tid.account.addressesPage)).toBeVisible();
    await expect(page.getByText(/Mondial Relay/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
  });
});
