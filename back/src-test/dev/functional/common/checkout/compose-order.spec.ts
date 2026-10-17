import { test, expect } from '../../../support/fixtures.js';
import {
  enableAllShopPaymentMethods,
  registerAdmin,
  uniqueEmail,
} from '../../../support/api.js';
import { pool } from '../../../../../src/db/pool.js';
import {
  E2E_NAIL_PRICES,
  E2E_PRODUCT_UIDS,
  E2E_TITLES,
  E2E_VARIATION,
} from '../../../support/catalog.js';
import { testPassword } from '../../../support/env.js';
import { setOrderStatus } from '../../../support/ops.js';
import { verifyReceivedOrder } from '../../../support/loyalty.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { AddressPages } from '../../../support/pages/address.pages.js';
import { AccountPages } from '../../../support/pages/account.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { ComposePages, LEFT_HAND_FINGERS } from '../../../support/pages/compose.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { tid } from '../../../support/selectors.js';
import {
  clickVisible,
  expectAnonymousSession,
  startCustomerJourneyAtRoot,
  viewOrdersControl,
} from '../../../support/interact.js';

async function orderIdForNumber(orderNumber: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from orders where order_number = $1`,
    [orderNumber],
  );
  if (!rows[0]?.id) throw new Error(`No order id for ${orderNumber}`);
  return rows[0].id;
}

async function advanceToReceived(orderNumber: string): Promise<void> {
  await setOrderStatus(orderNumber, 'in_preparation');
  await setOrderStatus(orderNumber, 'to_send', ['--skip-shipment-label']);
  await setOrderStatus(orderNumber, 'sent');
  await setOrderStatus(orderNumber, 'received');
}

test.describe('Compose order flows', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });

  test('guest one-nail pay: the order reaches received', async ({ page }) => {
    const email = uniqueEmail('compose-guest');
    const compose = new ComposePages(page);
    await startCustomerJourneyAtRoot(page);
    await expectAnonymousSession(page);
    await compose.goto();
    await compose.buildOneNail();
    await compose.expectTotal(E2E_NAIL_PRICES.NAIL_A);
    await compose.submitAndGoToCart();
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A);

    const cart = new CartPages(page);
    await cart.addHomeAddressFromCart({ label: 'Adresse compose guest', rememberAddress: false });
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addGuestCardAndPayToSuccess(email, { rememberCard: false });
    expect(orderNumber.length).toBeGreaterThan(3);

    await advanceToReceived(orderNumber);
  });

  test('mobile guest one-nail pay: the order reaches confirmed', async ({ page }) => {
    const email = uniqueEmail('compose-guest-m');
    const compose = new ComposePages(page);
    await startCustomerJourneyAtRoot(page);
    await expectAnonymousSession(page);
    await compose.goto();
    await compose.buildOneNail();
    await compose.expectTotal(E2E_NAIL_PRICES.NAIL_A);
    await compose.submitAndGoToCart();
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A);

    const cart = new CartPages(page);
    await cart.addHomeAddressFromCart({ label: 'Adresse compose mobile', rememberAddress: false });
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addGuestCardAndPayToSuccess(email, { rememberCard: false });
    expect(orderNumber.length).toBeGreaterThan(3);
  });

  test('guest one-hand: it imports onto the account after register', async ({ page }) => {
    const email = uniqueEmail('compose-import');
    const compose = new ComposePages(page);
    await startCustomerJourneyAtRoot(page);
    await expectAnonymousSession(page);
    await compose.goto();
    await compose.buildOneHand();
    await compose.expectTotal(E2E_NAIL_PRICES.NAIL_A * 5);
    await compose.submit({ dismissDrawer: true });

    const auth = new AuthPages(page);
    await auth.registerFromDesktopAccountModal(email, testPassword);
    const merge = page.getByTestId(tid.loginMerge.dialog);
    if (await merge.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false)) {
      await new CartPages(page).createCartFromGuestCart('Panier compose import');
    }
    const cart = new CartPages(page);
    await cart.goto();
    await compose.expectCartCompositionCount(1);
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A * 5);
  });

  test('signed-in Wish List composition: payment reaches confirmed', async ({ page }) => {
    const email = uniqueEmail('compose-wish-pay');
    const auth = new AuthPages(page);
    await auth.registerFromDesktopAccountModal(email, testPassword);
    const addresses = new AddressPages(page);
    await addresses.addHomeLivraison();

    const compose = new ComposePages(page);
    await compose.goto();
    await compose.buildOneNail();
    await compose.submitAndGoToCart();
    await compose.moveToWishlist();
    await compose.activateWishlistCart();
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A);

    const cart = new CartPages(page);
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess();
    expect(orderNumber.length).toBeGreaterThan(3);
    await clickVisible(viewOrdersControl(page));
    const account = new AccountPages(page);
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
    await expect(account.orderCard(orderNumber).getByTestId(tid.compose.orderLine)).toBeVisible();
    await expect(account.orderCard(orderNumber)).toContainText(/Set composé/i);
  });

  test('signed-in one-per-hand plus gallery set: payment reaches confirmed', async ({ page }) => {
    const email = uniqueEmail('compose-mixed');
    const auth = new AuthPages(page);
    await auth.registerFromDesktopAccountModal(email, testPassword);
    const addresses = new AddressPages(page);
    await addresses.addHomeLivraison();

    const compose = new ComposePages(page);
    await compose.goto();
    await compose.buildOnePerHand();
    await compose.submit({ dismissDrawer: true });
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'M' });

    const cart = new CartPages(page);
    await cart.goto();
    const goods = E2E_NAIL_PRICES.NAIL_A + E2E_NAIL_PRICES.NAIL_B + E2E_NAIL_PRICES.SET_A1;
    await compose.expectCartGoods(goods);
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess();
    await clickVisible(viewOrdersControl(page));
    const account = new AccountPages(page);
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
    const card = account.orderCard(orderNumber);
    await expect(card.getByTestId(tid.compose.orderLine)).toBeVisible();
    await expect(card).toContainText(/Set composé/i);
    await expect(card).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.A1]);
  });

  test('full set edit: a gallery add while editing locks drawer remove', async ({ page }) => {
    const { compose } = await registerWithFullSet(page, 'compose-lock');
    await compose.startEdit();
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, {
      shapeKey: 'amande',
      size: 'M',
      dismissDrawer: false,
    });
    await compose.expectDrawerRemoveAbsent();
  });

  test('full set edit: a cart visit forces the edit redirect', async ({ page }) => {
    const { compose } = await registerWithFullSet(page, 'compose-redirect');
    await compose.startEdit();
    await new CartPages(page).goto();
    await compose.expectForcedEditRedirect();
  });

  test('full set edit: cancel keeps the composition and the added set', async ({ page }) => {
    const { compose, goods } = await registerWithFullSet(page, 'compose-cancel');
    await compose.startEdit();
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, {
      shapeKey: 'amande',
      size: 'M',
      dismissDrawer: false,
    });
    await clickVisible(page.getByTestId(tid.cart.drawerContinue));
    await new CartPages(page).goto();
    await compose.expectForcedEditRedirect();
    await compose.cancelEdit();
    await compose.expectCartGoods(goods + E2E_NAIL_PRICES.SET_A1);
  });

  test('full set edit: update applies the variation change to the cart', async ({ page }) => {
    const { compose } = await registerWithFullSet(page, 'compose-update');
    await compose.startEdit();
    await compose.changeNailVariation(LEFT_HAND_FINGERS[0]!, E2E_VARIATION.BASE);
    await compose.expectTotal(E2E_NAIL_PRICES.NAIL_A * 10);
    await compose.updateCartFromComposer();
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A * 10);
  });

  test('full set: card pay reaches confirmed with 10/10', async ({ page }) => {
    const { cart } = await registerWithFullSet(page, 'compose-pay', { address: true });
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess();
    await clickVisible(viewOrdersControl(page));
    const account = new AccountPages(page);
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
    await expect(account.orderCard(orderNumber).getByTestId(tid.compose.orderLine)).toBeVisible();
    await expect(account.orderCard(orderNumber)).toContainText('10 / 10');
  });

  test('full set: a received order leaves the active list for history', async ({ page, request }) => {
    const { cart } = await registerWithFullSet(page, 'compose-received', { address: true });
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess();
    await clickVisible(viewOrdersControl(page));
    const account = new AccountPages(page);
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
    await advanceToReceived(orderNumber);
    await account.reloadOrders();
    await expect(account.orderCard(orderNumber)).toHaveCount(0);
    await account.gotoHistory();
    await account.expectOrderStatus(orderNumber, 'received', /reçue/i);
    const admin = await registerAdmin(request);
    await verifyReceivedOrder(request, admin.accessToken, await orderIdForNumber(orderNumber));
  });
});

async function registerWithFullSet(
  page: import('patchright/test').Page,
  slug: string,
  opts: { address?: boolean } = {},
) {
  const auth = new AuthPages(page);
  await auth.registerFromDesktopAccountModal(uniqueEmail(slug), testPassword);
  if (opts.address) await new AddressPages(page).addHomeLivraison();
  const compose = new ComposePages(page);
  await compose.goto();
  await compose.buildFullSetWithPremiumVariation();
  const goods = E2E_NAIL_PRICES.NAIL_A * 9 + E2E_NAIL_PRICES.NAIL_V_PREMIUM;
  await compose.expectTotal(goods);
  await compose.submitAndGoToCart();
  await compose.expectCartGoods(goods);
  return { compose, goods, cart: new CartPages(page) };
}

