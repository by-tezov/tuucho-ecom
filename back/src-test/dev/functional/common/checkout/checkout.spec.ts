// Shared desktop and mobile checkout coverage.
import { test, expect } from '../../../support/fixtures.js';
import {
  enableAllShopPaymentMethods,
  uniqueEmail,
  createAddress,
  createBeHomeAddress,
  placeFreeOrder,
  registerUser,
} from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { E2E_PRODUCT_UIDS, E2E_TITLES } from '../../../support/catalog.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { AddressPages } from '../../../support/pages/address.pages.js';
import { AccountPages } from '../../../support/pages/account.pages.js';
import { tid } from '../../../support/selectors.js';
import { initVoucher } from '../../../support/ops.js';
import { clickVisible, reveal, viewOrdersControl } from '../../../support/interact.js';

async function ensureLoggedIn(page: import('patchright/test').Page, email: string, mobile = false) {
  const auth = new AuthPages(page);
  if (mobile) {
    await auth.registerFromMobileOrders(email, testPassword);
    await auth.openMobileAccount();
    return;
  }
  await auth.registerFromDesktopAccountModal(email, testPassword);
  await auth.openDesktopAccount();
}

type Surface = 'web' | 'mobile';

/** Validate collapses every voucher_* reason into voucher_invalid, so a
 * restricted code shows the same sentence as an unknown one. */
const RESTRICTED_VOUCHER_REFUSAL = 'Ce code promo n’existe pas.';

async function loginForVoucher(
  page: import('patchright/test').Page,
  email: string,
  password: string,
  surface: Surface,
) {
  const auth = new AuthPages(page);
  if (surface === 'mobile') {
    await auth.loginFromMobileOrders(email, password);
    return;
  }
  await auth.loginFromDesktopAccountModal(email, password);
}

/** Address, courier, and one nail set, so a voucher refusal is the allow-list
 * and not a missing delivery choice. */
async function cartReadyForVoucher(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  account: { email: string; password: string; accessToken: string },
  surface: Surface,
) {
  await createAddress(request, account.accessToken);
  await loginForVoucher(page, account.email, account.password, surface);
  const gallery = new GalleryPages(page);
  await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'M' });
  const cart = new CartPages(page);
  await cart.goto();
  await cart.selectFirstHomeCourier();
  await cart.selectFirstAddress();
  return cart;
}

/** Percent voucher whose allow-list is exactly `owner`. */
async function voucherRestrictedTo(
  request: import('patchright/test').APIRequestContext,
  label: string,
) {
  const owner = await registerUser(request, { email: uniqueEmail(label) });
  const userId = typeof owner.user.id === 'string' ? owner.user.id : '';
  if (!userId) throw new Error(`register returned no user id for ${owner.email}`);
  const code = `e2e-ui-user-${label}-${Date.now().toString(36)}`;
  await initVoucher(code, { kind: 'percent', percent: 15 }, { maxPerUser: 0, users: [userId] });
  return { owner, code };
}

async function ensureHomeAddressAndSeededCart(
  page: import('patchright/test').Page,
  email: string,
  productUid: string = E2E_PRODUCT_UIDS.A1,
) {
  await ensureLoggedIn(page, email);
  const addresses = new AddressPages(page);
  await addresses.addHomeLivraison();

  const gallery = new GalleryPages(page);
  // Land on gallery after the address overlay settle so a deferred
  // history reclaim cannot undo the add's route mid-drawer.
  await gallery.goto();
  await gallery.addSeededProduct(productUid, { shapeKey: 'amande', size: 'M' });

  const cart = new CartPages(page);
  await cart.goto();
  await cart.selectFirstHomeCourier();
  await cart.selectFirstAddress();
  return cart;
}

test.describe('Functional checkout matrix', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });
  test('cart payment surface: PayPal, Bancontact, and new-card are offered when no card is saved', async ({ page }) => {
    const email = uniqueEmail('chk-pay-surface');
    await ensureLoggedIn(page, email);
    const gallery = new GalleryPages(page);
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1);
    const cart = new CartPages(page);
    await cart.goto();
    await expect(page.getByText(/vide pour le moment/i)).toHaveCount(0);
    await reveal(page.getByTestId(tid.cart.payPaypal));
    await expect(page.getByTestId(tid.cart.payPaypal)).toBeVisible();
    await expect(page.getByTestId(tid.cart.payBancontact)).toHaveCount(0);
    await cart.expectBancontactListedInPaymentOverflow();
    await expect(page.getByTestId(tid.cart.payNewCard)).toBeVisible();
    await expect(page.getByTestId(tid.cart.payCard)).toHaveCount(0);
  });

  test('PayPal full: sandbox authorization succeeds and the order is placed', async ({ page }) => {
    const cart = await ensureHomeAddressAndSeededCart(page, uniqueEmail('chk-paypal-full'));
    await cart.selectPaypal();
    await cart.openPayConfirm();
    await reveal(page.getByTestId(tid.cart.confirmPay));
    await expect(page.getByTestId(tid.cart.confirmPay)).toContainText(/PayPal|Continuer/i);
    const orderNumber = await cart.completePaypalSuccessFlow();
    expect(orderNumber.length).toBeGreaterThan(3);

    // Do not stop at Stripe's sandbox return: the final customer-visible
    // proof is a persisted, confirmed order in the account order list.
    await clickVisible(viewOrdersControl(page));
    const account = new AccountPages(page);
    await expect(page.getByTestId(tid.orders.list)).toBeVisible();
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
  });

  test('Bancontact full: sandbox authorization succeeds and the order is placed', async ({ page, request }) => {
    const email = uniqueEmail('chk-bancontact-full');
    const { accessToken } = await registerUser(request, { email, password: testPassword });
    await createBeHomeAddress(request, accessToken);
    const auth = new AuthPages(page);
    await auth.loginFromDesktopAccountModal(email, testPassword);
    const gallery = new GalleryPages(page);
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'M' });
    const cart = new CartPages(page);
    await cart.goto();
    await cart.selectCourierByCode('colissimo-home');
    await cart.selectAddressByLabel(/Belgique E2E/i);
    await cart.selectBancontact();
    await cart.openPayConfirm();
    await reveal(page.getByTestId(tid.cart.confirmPay));
    await expect(page.getByTestId(tid.cart.confirmPay)).toContainText(/Bancontact|Continuer/i);
    const orderNumber = await cart.completeBancontactSuccessFlow();
    expect(orderNumber.length).toBeGreaterThan(3);

    await clickVisible(viewOrdersControl(page));
    const account = new AccountPages(page);
    await expect(page.getByTestId(tid.orders.list)).toBeVisible();
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
    await expect(account.orderCard(orderNumber)).toContainText(/Bancontact/i);
  });

  test('new_card 4242: card is collected in the pay sheet and the order succeeds', async ({ page }) => {
    const cart = await ensureHomeAddressAndSeededCart(page, uniqueEmail('chk-card-full'));
    const orderNumber = await cart.addTestCardAndPayToSuccess();
    expect(orderNumber.length).toBeGreaterThan(3);

    await clickVisible(viewOrdersControl(page));
    const account = new AccountPages(page);
    await expect(page.getByTestId(tid.orders.list)).toBeVisible();
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
  });

  test('percent voucher: it applies after the address and the courier are set', async ({ page }) => {
    const stamp = Date.now();
    const code = `e2e-ui-pct-${stamp}`;
    await initVoucher(code, { kind: 'percent', percent: 15 }, { maxPerUser: 0 });
    const cart = await ensureHomeAddressAndSeededCart(page, uniqueEmail('chk-voucher'));
    await cart.applyVoucher(code);
    await expect(page.getByTestId(tid.cart.voucherSuccess)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(new RegExp(`Code promo\\s*:\\s*${code}`, 'i'))).toBeVisible();
  });

  test('default per-user cap: blocks re-applying a voucher after a free order', async ({ page, request }) => {
    const stamp = Date.now();
    const code = `e2e-ui-cap-${stamp}`;
    await initVoucher(code, { kind: 'amount', amount: 99_999 });
    const email = uniqueEmail('chk-voucher-cap');
    const { accessToken, password } = await registerUser(request, { email });
    const addressId = (await createAddress(request, accessToken)).id;
    await placeFreeOrder(request, accessToken, { voucherCode: code, addressId });

    const auth = new AuthPages(page);
    await auth.loginFromDesktopAccountModal(email, password);

    const gallery = new GalleryPages(page);
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'M' });

    const cart = new CartPages(page);
    await cart.goto();
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    await cart.applyVoucher(code);
    await expect(page.getByTestId(tid.cart.voucherError)).toBeVisible({ timeout: 15_000 });
  });

  test('min-buy voucher: shows an error when the cart is below the floor', async ({ page }) => {
    const stamp = Date.now();
    const code = `e2e-ui-min-${stamp}`;
    await initVoucher(code, { kind: 'amount', amount: 5 }, { maxPerUser: 0, minBuy: 99_999 });
    const cart = await ensureHomeAddressAndSeededCart(page, uniqueEmail('chk-voucher-min'));
    await cart.applyVoucher(code);
    await expect(page.getByTestId(tid.cart.voucherError)).toBeVisible({ timeout: 15_000 });
  });

  test('web user-restricted voucher: the listed account can apply it', async ({ page, request }) => {
    const { owner, code } = await voucherRestrictedTo(request, 'chk-user-allow');
    const cart = await cartReadyForVoucher(page, request, owner, 'web');
    await cart.applyVoucher(code);
    await expect(page.getByTestId(tid.cart.voucherSuccess)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(new RegExp(`Code promo\\s*:\\s*${code}`, 'i'))).toBeVisible();
  });

  test('mobile user-restricted voucher: the listed account can apply it', async ({ page, request }) => {
    const { owner, code } = await voucherRestrictedTo(request, 'chk-user-allow-m');
    const cart = await cartReadyForVoucher(page, request, owner, 'mobile');
    await cart.applyVoucher(code);
    await expect(page.getByTestId(tid.cart.voucherSuccess)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(new RegExp(`Code promo\\s*:\\s*${code}`, 'i'))).toBeVisible();
  });

  test('web user-restricted voucher: another account is refused', async ({ page, request }) => {
    const { code } = await voucherRestrictedTo(request, 'chk-user-deny');
    const other = await registerUser(request, { email: uniqueEmail('chk-user-other') });
    const cart = await cartReadyForVoucher(page, request, other, 'web');
    await cart.applyVoucher(code);
    await expect(page.getByTestId(tid.cart.voucherError)).toContainText(RESTRICTED_VOUCHER_REFUSAL, {
      timeout: 15_000,
    });
  });

  test('mobile user-restricted voucher: another account is refused', async ({ page, request }) => {
    const { code } = await voucherRestrictedTo(request, 'chk-user-deny-m');
    const other = await registerUser(request, { email: uniqueEmail('chk-user-other-m') });
    const cart = await cartReadyForVoucher(page, request, other, 'mobile');
    await cart.applyVoucher(code);
    await expect(page.getByTestId(tid.cart.voucherError)).toContainText(RESTRICTED_VOUCHER_REFUSAL, {
      timeout: 15_000,
    });
  });

  test('mobile multi-product cart: the order completes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 633 });
    const email = uniqueEmail('chk-mobile-multi');
    await ensureLoggedIn(page, email, true);

    const addresses = new AddressPages(page);
    await addresses.addHomeLivraison();

    const gallery = new GalleryPages(page);
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'S' });
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A2, { shapeKey: 'carré', size: 'M' });

    const cart = new CartPages(page);
    await cart.goto();
    await reveal(page.getByTestId(tid.cart.page));

    const lines = page.getByTestId(tid.cart.line);
    await expect(lines).toHaveCount(2, { timeout: 15_000 });
    await reveal(lines.nth(0), { block: 'center', holdMs: 500 });
    await expect(
      page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${E2E_PRODUCT_UIDS.A1}"]`),
    ).toHaveCount(1);
    await expect(
      page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${E2E_PRODUCT_UIDS.A2}"]`),
    ).toHaveCount(1);
    await expect(page.getByText(E2E_TITLES[E2E_PRODUCT_UIDS.A1]).first()).toBeVisible();
    await expect(page.getByText(E2E_TITLES[E2E_PRODUCT_UIDS.A2]).first()).toBeVisible();
    await reveal(lines.nth(1), { block: 'center', holdMs: 700 });

    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess();
    expect(orderNumber.length).toBeGreaterThan(3);

    await clickVisible(viewOrdersControl(page));
    const account = new AccountPages(page);
    await expect(page.getByTestId(tid.orders.list)).toBeVisible();
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
    const orderCard = account.orderCard(orderNumber);
    await reveal(orderCard, { block: 'center', holdMs: 800 });
    await expect(orderCard.getByText(E2E_TITLES[E2E_PRODUCT_UIDS.A1]).first()).toBeVisible();
    await expect(orderCard.getByText(E2E_TITLES[E2E_PRODUCT_UIDS.A2]).first()).toBeVisible();
  });
});
