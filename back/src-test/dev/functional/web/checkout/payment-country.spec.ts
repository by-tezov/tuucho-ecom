import { test, expect } from '../../../support/fixtures.js';
import {
  createAddress,
  createBeHomeAddress,
  createBePickupAddress,
  enableAllShopPaymentMethods,
  registerUser,
  uniqueEmail,
} from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { tid } from '../../../support/selectors.js';

async function prepareAuthenticatedCart(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  email: string,
  seedAddress?: (request: import('patchright/test').APIRequestContext, accessToken: string) => Promise<void>,
) {
  const { accessToken } = await registerUser(request, { email, password: testPassword });
  if (seedAddress) await seedAddress(request, accessToken);
  const auth = new AuthPages(page);
  await auth.loginFromDesktopAccountModal(email, testPassword);
  const gallery = new GalleryPages(page);
  await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'M' });
  const cart = new CartPages(page);
  await cart.goto();
  return { cart, accessToken };
}

test.describe('Functional checkout payment countries', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });

  test('Bancontact: is primary with a BE home address', async ({ page, request }) => {
    const email = uniqueEmail('pay-be-home-ui');
    const { cart } = await prepareAuthenticatedCart(page, request, email, createBeHomeAddress);
    await cart.selectCourierByCode('colissimo-home');
    await cart.selectAddressByLabel(/Belgique E2E/i);
    await expect(page.getByTestId(tid.cart.payBancontact)).toBeVisible();
  });

  test('Bancontact: is primary with a BE pickup address', async ({ page, request }) => {
    const email = uniqueEmail('pay-be-pickup-ui');
    const { cart } = await prepareAuthenticatedCart(page, request, email, createBePickupAddress);
    await cart.selectCourierByCode('mondial-relay-point');
    await cart.selectAddressByLabel(/Point relais BE E2E/i);
    await expect(page.getByTestId(tid.cart.payBancontact)).toBeVisible();
  });

  test('Bancontact: moves out of primary for a FR home address', async ({ page, request }) => {
    const email = uniqueEmail('pay-fr-home-ui');
    const { cart } = await prepareAuthenticatedCart(page, request, email, createAddress);
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    await expect(page.getByTestId(tid.cart.payBancontact)).toHaveCount(0);
    await cart.expectBancontactListedInPaymentOverflow();
  });
});
