import type { APIRequestContext, Page } from 'patchright/test';
import { test, expect } from '../../../support/fixtures.js';
import {
  apiJson,
  enableAllShopPaymentMethods,
  pickPurchasableVariant,
  registerUser,
  uniqueEmail,
} from '../../../support/api.js';
import {
  E2E_ACCESSORY_TITLES,
  E2E_ACCESSORY_UIDS,
  E2E_PRODUCT_UIDS,
  E2E_TITLES,
} from '../../../support/catalog.js';
import { waitForMail } from '../../../support/mail.js';
import { initVoucher } from '../../../support/ops.js';
import { AccountPages } from '../../../support/pages/account.pages.js';
import { AddressPages } from '../../../support/pages/address.pages.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import {
  clickVisible,
  reveal,
  startCustomerJourneyAtRoot,
  viewOrdersControl,
} from '../../../support/interact.js';
import { tid } from '../../../support/selectors.js';

const MOBILE = { width: 390, height: 633 };

async function seedExistingAccountCart(
  request: APIRequestContext,
  accessToken: string,
): Promise<void> {
  const variant = await pickPurchasableVariant(request, {
    token: accessToken,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.A1],
  });
  await apiJson(request, 'POST', '/account/cart', {
    token: accessToken,
    data: {
      productId: variant.productId,
      shapeKey: variant.shapeKey,
      lengthKey: variant.lengthKey,
      size: variant.size,
      quantity: 1,
    },
    expectedStatus: 200,
  });
}

async function openAnonymousCart(page: Page, productUid = E2E_PRODUCT_UIDS.A2): Promise<CartPages> {
  await startCustomerJourneyAtRoot(page);
  const gallery = new GalleryPages(page);
  await gallery.addSeededProduct(productUid, { shapeKey: 'carré', size: 'M' });
  const cart = new CartPages(page);
  await cart.goto();
  await expect(page.getByTestId(tid.guest.email)).toBeVisible({ timeout: 15_000 });
  return cart;
}

async function expectConfirmedOrder(page: Page, orderNumber: string) {
  await clickVisible(viewOrdersControl(page.getByTestId(tid.cart.orderSuccess)));
  const account = new AccountPages(page);
  await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
  return account.orderCard(orderNumber);
}

async function mergeAnonymousIntoExistingCart(page: Page, request: APIRequestContext) {
  const shopper = await registerUser(request, { email: uniqueEmail('order-cart-password') });
  await seedExistingAccountCart(request, shopper.accessToken);
  const cart = await openAnonymousCart(page, E2E_PRODUCT_UIDS.A2);
  await new AuthPages(page).loginFromGuestPrompt(shopper.email, shopper.password);
  await cart.mergeGuestIntoExistingCart();
  return { cart, page };
}

async function createNamedCartFromGuestOtp(page: Page, request: APIRequestContext) {
  const shopper = await registerUser(request, { email: uniqueEmail('order-cart-otp') });
  await seedExistingAccountCart(request, shopper.accessToken);
  const cart = await openAnonymousCart(page, E2E_PRODUCT_UIDS.A2);
  await new AuthPages(page).registerFromGuestPrompt(shopper.email);
  await cart.createCartFromGuestCart('Panier mobile OTP');
  return cart;
}

test.describe('Mobile order pathways from the public root', () => {
  test.beforeEach(async ({ request, page }) => {
    await page.setViewportSize(MOBILE);
    await enableAllShopPaymentMethods(request);
  });

  test('mobile password login: multiple sets, a paid accessory, and a voucher reach a card order', async ({
    page,
    request,
  }) => {
    const shopper = await registerUser(request, { email: uniqueEmail('order-login-password') });
    const voucherCode = `e2e-mobile-percent-${Date.now()}`;
    await initVoucher(voucherCode, { kind: 'percent', percent: 15 });

    await startCustomerJourneyAtRoot(page);
    const auth = new AuthPages(page);
    await auth.loginFromMobileOrders(shopper.email, shopper.password);

    await test.step('Expected: the normal Commandes login authenticates the owner before any order data is created', async () => {
      await expect(page.getByTestId(tid.auth.loginForm)).toBeHidden();
      await auth.openMobileAccount();
      await expect(page.getByTestId(tid.account.profileForm)).toBeVisible();
    });

    await new AddressPages(page).addHomeLivraison();
    const gallery = new GalleryPages(page);
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'S' });
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A2, { shapeKey: 'carré', size: 'M' });

    const cart = new CartPages(page);
    await cart.goto();
    await cart.addAccessoryFromCarousel(E2E_ACCESSORY_UIDS.GLUE_DOSES, {
      packLabel: 'x5',
      title: E2E_ACCESSORY_TITLES[E2E_ACCESSORY_UIDS.GLUE_DOSES],
    });

    await test.step('Expected: the cart visibly contains both requested sets and the paid x5 accessory, because all three must be snapshotted into the order', async () => {
      await expect(page.getByTestId(tid.cart.line)).toHaveCount(2);
      for (const uid of [E2E_PRODUCT_UIDS.A1, E2E_PRODUCT_UIDS.A2]) {
        await expect(
          page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${uid}"]`),
        ).toHaveCount(1);
      }
      await expect(
        page.locator(
          `[data-testid="${tid.cart.accessoryLine}"][data-product-uid="${E2E_ACCESSORY_UIDS.GLUE_DOSES}"][data-origin="user"]`,
        ),
      ).toContainText(/Doses de colle.*x5|x5.*Doses de colle/i);
    });

    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    await cart.applyVoucher(voucherCode);

    await test.step('Expected: a valid percent voucher is confirmed against the completed delivery selection and visibly reduces the payable total', async () => {
      await expect(page.getByTestId(tid.cart.voucherSuccess)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(new RegExp(`Code promo\\s*:\\s*${voucherCode}`, 'i'))).toBeVisible();
    });

    const orderNumber = await cart.addTestCardAndPayToSuccess();
    const order = await expectConfirmedOrder(page, orderNumber);

    await test.step('Expected: the persisted order keeps every paid line and the exact voucher code, proving checkout did not rebuild a different cart after payment', async () => {
      await reveal(order, { block: 'center' });
      await expect(order).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.A1]);
      await expect(order).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.A2]);
      await expect(order).toContainText(E2E_ACCESSORY_TITLES[E2E_ACCESSORY_UIDS.GLUE_DOSES]);
      await expect(order).toContainText(voucherCode);
      await expect(order).toContainText(/x5/);
    });
  });

  test('mobile passwordless login: PayPal authorization reaches a confirmed order', async ({
    page,
    request,
  }) => {
    const shopper = await registerUser(request, { email: uniqueEmail('order-login-otp') });
    await startCustomerJourneyAtRoot(page);
    const auth = new AuthPages(page);
    await auth.loginWithOtpFromMobileOrders(shopper.email);

    await test.step('Expected: the mailbox OTP closes the public login form because possession of the registered email was verified', async () => {
      await expect(page.getByTestId(tid.auth.loginForm)).toBeHidden();
    });

    const gallery = new GalleryPages(page);
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.B1, { shapeKey: 'amande', size: 'M' });
    const cart = new CartPages(page);
    await cart.goto();
    await cart.addHomeAddressFromCart();
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    await cart.selectPaypal();
    await cart.openPayConfirm();

    await test.step('Expected: choosing PayPal exposes an explicit final authorization action before leaving for Stripe', async () => {
      await expect(page.getByTestId(tid.cart.confirmPay)).toContainText(/PayPal|Continuer/i);
    });

    const orderNumber = await cart.completePaypalSuccessFlow();
    const order = await expectConfirmedOrder(page, orderNumber);

    await test.step('Expected: returning from the PayPal sandbox persists one confirmed PayPal order for the authenticated shopper', async () => {
      await expect(order).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.B1]);
      await expect(order).toContainText(/PayPal/i);
    });
  });

  test('mobile cart login: merge keeps the account line and the anonymous line', async ({
    page,
    request,
  }) => {
    const { page: cartPage } = await mergeAnonymousIntoExistingCart(page, request);
    await expect(cartPage.getByTestId(tid.guest.email)).toBeHidden({ timeout: 15_000 });
    await expect(
      cartPage.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${E2E_PRODUCT_UIDS.A1}"]`),
    ).toHaveCount(1);
    await expect(
      cartPage.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${E2E_PRODUCT_UIDS.A2}"]`),
    ).toHaveCount(1);
  });

  test('mobile cart login: the merged cart card pay reaches confirmed with both products', async ({
    page,
    request,
  }) => {
    const { cart } = await mergeAnonymousIntoExistingCart(page, request);
    await cart.addHomeAddressFromCart();
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess();
    const order = await expectConfirmedOrder(page, orderNumber);
    await expect(order).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.A1]);
    await expect(order).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.A2]);
  });

  test('mobile cart OTP: the new cart keeps only the anonymous line', async ({ page, request }) => {
    await createNamedCartFromGuestOtp(page, request);
    await expect(page.getByTestId(tid.guest.email)).toBeHidden({ timeout: 15_000 });
    await expect(
      page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${E2E_PRODUCT_UIDS.A2}"]`),
    ).toHaveCount(1);
    await expect(
      page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${E2E_PRODUCT_UIDS.A1}"]`),
    ).toHaveCount(0);
  });

  test('mobile cart OTP: the new cart card pay reaches confirmed without the account cart', async ({
    page,
    request,
  }) => {
    const cart = await createNamedCartFromGuestOtp(page, request);
    await cart.addHomeAddressFromCart();
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess();
    const order = await expectConfirmedOrder(page, orderNumber);
    await expect(order).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.A2]);
    await expect(order).not.toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.A1]);
  });

  test('mobile guest voucher: covers a paid accessory order completely without opening Stripe', async ({
    page,
  }) => {
    const voucherCode = `e2e-mobile-guest-free-${Date.now()}`;
    // Voucher amounts are expressed in euros. Keep this deliberately above
    // any seeded product + delivery combination so this scenario tests the
    // zero-total branch rather than depending on catalogue pricing.
    await initVoucher(voucherCode, { kind: 'amount', amount: 99_999 });
    const email = uniqueEmail('order-guest-free');
    const cart = await openAnonymousCart(page, E2E_PRODUCT_UIDS.A1);
    await cart.addAccessoryFromCarousel(E2E_ACCESSORY_UIDS.GLUE_DOSES, {
      packLabel: 'x5',
      title: E2E_ACCESSORY_TITLES[E2E_ACCESSORY_UIDS.GLUE_DOSES],
    });
    await cart.addHomeAddressFromCart({ rememberAddress: false });
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    await cart.applyVoucher(voucherCode);

    await test.step('Expected: the authoritative voucher preview reduces the guest total to €0.00, so no card or PayPal choice is required', async () => {
      await expect(page.getByTestId(tid.cart.voucherSuccess)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId(tid.cart.paySubmit)).toContainText(/0[,.]00\s*€/);
    });

    const sinceMs = Date.now() - 1_000;
    const orderNumber = await cart.completeGuestFreeOrderToSuccess(email);

    await test.step('Expected: guest identity and CGU acceptance still create a confirmation and email, while no account-only Orders link is exposed', async () => {
      expect(orderNumber).toMatch(/^CMD-/);
      await expect(viewOrdersControl(page.getByTestId(tid.cart.orderSuccess))).toHaveCount(0);
      await waitForMail({
        kind: 'user',
        toIncludes: email,
        subjectIncludes: 'Confirmation de votre commande',
        sinceMs,
        timeoutMs: 15_000,
      });
    });
  });
});
