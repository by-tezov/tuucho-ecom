import { test, expect } from '../../../support/fixtures.js';
import { enableAllShopPaymentMethods, uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { AddressPages } from '../../../support/pages/address.pages.js';
import { AccountPages } from '../../../support/pages/account.pages.js';
import { tid } from '../../../support/selectors.js';
import { clickVisible, viewOrdersControl } from '../../../support/interact.js';

type Surface = 'web' | 'mobile';

async function runColissimoHomeCardOrder(
  page: import('patchright/test').Page,
  surface: Surface,
): Promise<void> {
  const email = uniqueEmail(`${surface}-colissimo`);
  const auth = new AuthPages(page);
  if (surface === 'mobile') {
    await auth.registerFromMobileOrders(email, testPassword);
    await auth.openMobileAccount();
  } else {
    await auth.registerFromDesktopAccountModal(email, testPassword);
    await auth.openDesktopAccount();
  }

  await new AddressPages(page).addHomeLivraison();

  const gallery = new GalleryPages(page);
  await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'M' });

  const cart = new CartPages(page);
  await cart.goto();
  await cart.selectCourierByCode('colissimo-home');
  await cart.selectFirstAddress();

  const colissimo = page.locator(
    `[data-testid="${tid.cart.courierOption}"][data-courier-code="colissimo-home"]`,
  );
  await expect(colissimo).toBeChecked();
  // Solo FR packet from manager courier/colissimo-home.json.
  await expect(colissimo.locator('xpath=ancestor::label[1]')).toContainText(/5[,.]99/);

  const orderNumber = await cart.addTestCardAndPayToSuccess();
  expect(orderNumber.length).toBeGreaterThan(3);

  if (surface === 'mobile') {
    await clickVisible(viewOrdersControl(page.getByTestId(tid.cart.orderSuccess)));
  } else {
    await clickVisible(viewOrdersControl(page));
  }
  const account = new AccountPages(page);
  await expect(page.getByTestId(tid.orders.list)).toBeVisible();
  await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
  await expect(account.orderCard(orderNumber)).toContainText(/Colissimo/i);
}

test.describe('Functional Colissimo home delivery', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });

  test('web Colissimo home fee then card order: shows Colissimo on Commandes', async ({ page }) => {
    await runColissimoHomeCardOrder(page, 'web');
  });

  test('mobile Colissimo home fee then card order: shows Colissimo on Commandes', async ({ page }) => {
    await runColissimoHomeCardOrder(page, 'mobile');
  });
});
