import { functionalChromeArgs, openPinnedPage, test, expect } from '../../../support/fixtures.js';
import type { Browser, Page } from 'patchright/test';
import { enableAllShopPaymentMethods, uniqueEmail } from '../../../support/api.js';
import { loadTestEnv, testPassword } from '../../../support/env.js';
import { E2E_PRODUCT_UIDS, E2E_TITLES, resetE2eOosStock } from '../../../support/catalog.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { AddressPages } from '../../../support/pages/address.pages.js';
import { AccountPages } from '../../../support/pages/account.pages.js';
import { tid } from '../../../support/selectors.js';
import { setOrderStatus } from '../../../support/ops.js';
import { clickVisible, reveal, skipOnboardingOnContext, viewOrdersControl } from '../../../support/interact.js';
import { actionDeadline } from '../../../support/timeouts.js';

async function ensureLoggedIn(page: import('patchright/test').Page, email: string) {
  const auth = new AuthPages(page);
  await auth.registerFromDesktopAccountModal(email, testPassword);
  await auth.openDesktopAccount();
}

async function paySeededHomeCart(
  page: import('patchright/test').Page,
  email: string,
  adds: Array<{ uid: string; shapeKey: string; size: string }>,
) {
  await ensureLoggedIn(page, email);
  const addresses = new AddressPages(page);
  await addresses.addHomeLivraison();
  const gallery = new GalleryPages(page);
  // Land on gallery once after the address overlay settle so a deferred
  // history reclaim cannot undo the first add's route mid-drawer.
  await gallery.goto();
  for (const add of adds) {
    await gallery.addSeededProduct(add.uid, { shapeKey: add.shapeKey, size: add.size });
  }
  const cart = new CartPages(page);
  await cart.goto();
  return cart;
}

async function prepareUncapturedOrder(page: import('patchright/test').Page, slug: string) {
  const cart = await paySeededHomeCart(page, uniqueEmail(slug), [
    { uid: E2E_PRODUCT_UIDS.B1, shapeKey: 'amande', size: 'L' },
  ]);
  await cart.selectFirstHomeCourier();
  await cart.selectFirstAddress();
  const orderNumber = await cart.addTestCardAndPayToSuccess();
  await clickVisible(viewOrdersControl(page));
  const account = new AccountPages(page);
  await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
  await setOrderStatus(orderNumber, 'in_preparation', ['--no-payment']);
  await account.reloadOrders();
  await account.expectOrderStatus(orderNumber, 'in_preparation', /préparation/i);
  return { account, orderNumber };
}

async function prepareOosCheckout(
  page: import('patchright/test').Page,
  email: string,
  cardNumber?: string,
) {
  await ensureLoggedIn(page, email);
  const addresses = new AddressPages(page);
  await addresses.addHomeLivraison();
  const gallery = new GalleryPages(page);
  await gallery.addSeededProduct(E2E_PRODUCT_UIDS.OOS, { shapeKey: 'amande', size: 'M' });

  const cart = new CartPages(page);
  await cart.goto();
  await cart.selectFirstHomeCourier();
  await cart.selectFirstAddress();
  // Race needs a remembered card so each attempt only confirms — profile
  // SetupIntent, not the cart new_card pay sheet.
  await cart.addSavedTestCardFromProfile('OOS Racer', cardNumber);
  await cart.selectSavedCard();
  return cart;
}

async function cancelConfirmedOrder(page: import('patchright/test').Page, orderNumber: string) {
  const account = new AccountPages(page);
  await account.gotoOrders();
  await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
  await account.cancelOrder(orderNumber);
  await account.gotoHistory();
  await account.expectOrderStatus(orderNumber, 'cancelled', /annul/i);
}

async function startPayment(page: import('patchright/test').Page) {
  const pay = page.getByTestId(tid.cart.paySubmit);
  await reveal(pay);
  await expect(pay).toBeEnabled({ timeout: 15_000 });
  await pay.click();
}

async function paymentReservationOutcome(page: import('patchright/test').Page) {
  const confirmed = page.getByTestId(tid.cart.confirmPay);
  const unavailable = page
    .getByTestId(tid.cart.confirmError)
    .or(page.getByTestId(tid.cart.paymentError))
    .or(page.getByRole('dialog', { name: /impossible de préparer le paiement/i }));
  await expect(confirmed.or(unavailable).first()).toBeVisible({ timeout: 15_000 });
  return (await confirmed.isVisible()) ? 'reserved' : 'unavailable';
}

async function waitForReleasedReservation(page: import('patchright/test').Page): Promise<void> {
  const deadline = actionDeadline();
  do {
    await startPayment(page);
    if ((await paymentReservationOutcome(page)) === 'reserved') return;

    // The payment_failed webhook is asynchronous. Close the rejected B
    // attempt and retry only until that webhook has released A's hold.
    const cancel = page
      .getByRole('dialog', { name: /confirmer le paiement/i })
      .getByRole('button', { name: /annuler/i });
    await clickVisible(cancel);
    await page.waitForTimeout(750);
  } while (Date.now() < deadline);

  throw new Error('payment_failed did not release the stock reservation in time');
}

function customerBrowser(page: Page): Browser {
  const browser = page.context().browser();
  if (!browser) throw new Error('functional browser is unavailable');
  return browser;
}

test.describe('Order flows: auth + multi-cart + OOS + cancel', () => {
  // These scenarios intentionally mutate the only OOS unit. Restore it for
  // every case so a timed-out predecessor cannot make the next one fail in
  // the gallery before it reaches its own race assertion.
  test.beforeEach(async ({ request }, testInfo) => {
    await enableAllShopPaymentMethods(request);
    if (/^(?:OOS race|OOS:)/.test(testInfo.title)) await resetE2eOosStock();
  });

  test('connected multi-variant: cart lines stay visible, then card pay reaches orders', async ({ page }) => {
    const email = uniqueEmail('flow-multi-var');
    const cart = await paySeededHomeCart(page, email, [
      { uid: E2E_PRODUCT_UIDS.A1, shapeKey: 'amande', size: 'S' },
      { uid: E2E_PRODUCT_UIDS.A1, shapeKey: 'carré', size: 'L' },
      { uid: E2E_PRODUCT_UIDS.A2, shapeKey: 'amande', size: 'M' },
    ]);

    // Assert multi-article / multi-variant cart is visibly populated.
    const lines = page.getByTestId(tid.cart.line);
    await expect(lines).toHaveCount(3, { timeout: 15_000 });
    await reveal(lines.nth(0), { block: 'center', holdMs: 500 });
    await expect(
      page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${E2E_PRODUCT_UIDS.A1}"]`),
    ).toHaveCount(2);
    await expect(
      page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${E2E_PRODUCT_UIDS.A2}"]`),
    ).toHaveCount(1);
    await expect(page.getByText(E2E_TITLES[E2E_PRODUCT_UIDS.A1]).first()).toBeVisible();
    await expect(page.getByText(E2E_TITLES[E2E_PRODUCT_UIDS.A2]).first()).toBeVisible();
    await reveal(lines.nth(2), { block: 'center', holdMs: 700 });

    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess();
    expect(orderNumber.length).toBeGreaterThan(3);

    await clickVisible(viewOrdersControl(page));
    const account = new AccountPages(page);
    await expect(page.getByTestId(tid.orders.list)).toBeVisible();
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
    const card = account.orderCard(orderNumber);
    await reveal(card, { block: 'center', holdMs: 800 });
    await expect(card.getByText(E2E_TITLES[E2E_PRODUCT_UIDS.A1]).first()).toBeVisible();
    await expect(card.getByText(E2E_TITLES[E2E_PRODUCT_UIDS.A2]).first()).toBeVisible();
  });

  test('full lifecycle with refresh: the order goes from confirmed to received in history', async ({ page }) => {
    const email = uniqueEmail('flow-lifecycle');
    const cart = await paySeededHomeCart(page, email, [
      { uid: E2E_PRODUCT_UIDS.A1, shapeKey: 'amande', size: 'M' },
      { uid: E2E_PRODUCT_UIDS.B1, shapeKey: 'carré', size: 'S' },
    ]);
    await expect(page.getByTestId(tid.cart.line)).toHaveCount(2);
    await reveal(page.getByTestId(tid.cart.line).first(), { block: 'center', holdMs: 500 });

    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess();

    await clickVisible(viewOrdersControl(page));
    const account = new AccountPages(page);
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
    await reveal(account.orderCard(orderNumber), { block: 'center', holdMs: 700 });

    await setOrderStatus(orderNumber, 'in_preparation');
    await account.reloadOrders();
    await account.expectOrderStatus(orderNumber, 'in_preparation', /préparation/i);
    await reveal(account.orderCard(orderNumber), { block: 'center', holdMs: 700 });

    await setOrderStatus(orderNumber, 'to_send', ['--skip-shipment-label']);
    await account.reloadOrders();
    await account.expectOrderStatus(orderNumber, 'to_send', /prête|envoy/i);
    await reveal(account.orderCard(orderNumber), { block: 'center', holdMs: 700 });

    await setOrderStatus(orderNumber, 'sent');
    await account.reloadOrders();
    await account.expectOrderStatus(orderNumber, 'sent', /envoyée/i);
    await reveal(account.orderCard(orderNumber), { block: 'center', holdMs: 700 });

    await setOrderStatus(orderNumber, 'received');
    // The fulfillment update happens outside the customer UI; refresh the
    // active page as a customer would before checking its new state.
    await account.reloadOrders();
    await expect(account.orderCard(orderNumber)).toHaveCount(0);

    await account.gotoHistory();
    await account.expectOrderStatus(orderNumber, 'received', /reçue/i);
    await reveal(account.orderCard(orderNumber), { block: 'center', holdMs: 900 });
  });

  test('cancel: confirmed (authorized, no capture) via UI, then history', async ({ page }) => {
    const email = uniqueEmail('flow-cancel-conf');
    const cart = await paySeededHomeCart(page, email, [
      { uid: E2E_PRODUCT_UIDS.A2, shapeKey: 'amande', size: 'M' },
    ]);
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess();

    await clickVisible(viewOrdersControl(page));
    const account = new AccountPages(page);
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
    await account.expectCancelAvailable(orderNumber, true);
    await account.cancelOrder(orderNumber);

    await account.gotoHistory();
    await account.expectOrderStatus(orderNumber, 'cancelled', /annul/i);
    await reveal(account.orderCard(orderNumber), { block: 'center', holdMs: 800 });
  });

  test('in_preparation without capture: the customer cancel control is hidden', async ({ page }) => {
    const { account, orderNumber } = await prepareUncapturedOrder(page, 'flow-cancel-prep-hidden');
    await account.expectCancelAvailable(orderNumber, false);
  });

  test('in_preparation without capture: ops cancel moves the order to history', async ({ page }) => {
    const { account, orderNumber } = await prepareUncapturedOrder(page, 'flow-cancel-prep-ops');
    await setOrderStatus(orderNumber, 'cancelled');
    await account.reloadOrders();
    await expect(account.orderCard(orderNumber)).toHaveCount(0);
    await account.gotoHistory();
    await account.expectOrderStatus(orderNumber, 'cancelled', /annul/i);
    await reveal(account.orderCard(orderNumber), { block: 'center', holdMs: 800 });
  });

  test('captured in_preparation payment: cancel is refused', async ({ page }) => {
    const email = uniqueEmail('flow-no-cancel');
    const cart = await paySeededHomeCart(page, email, [
      { uid: E2E_PRODUCT_UIDS.A1, shapeKey: 'carré', size: 'M' },
    ]);
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess();

    await clickVisible(viewOrdersControl(page));
    const account = new AccountPages(page);
    await account.expectCancelAvailable(orderNumber, true);

    // Default prep captures the PaymentIntent.
    await setOrderStatus(orderNumber, 'in_preparation');
    await account.reloadOrders();
    await account.expectOrderStatus(orderNumber, 'in_preparation', /préparation/i);
    await account.expectCancelAvailable(orderNumber, false);
    await reveal(account.orderCard(orderNumber), { block: 'center', holdMs: 900 });
  });

  test('multi-cart: a second cart with a different SKU can be created and selected', async ({ page }) => {
    const email = uniqueEmail('flow-multi-cart');
    await ensureLoggedIn(page, email);
    const gallery = new GalleryPages(page);
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'M' });

    const cart = new CartPages(page);
    await cart.goto();
    await expect(page.getByTestId(tid.cart.create)).toBeVisible({ timeout: 15_000 });
    await cart.createNamedCart('Panier E2E B');
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.B1, { shapeKey: 'carré', size: 'L' });
    await cart.goto();
    await expect(page.getByText(/Olive E2E Bravo|MG-E2E-B1/i).first()).toBeVisible({
      timeout: 10_000,
    });

    await cart.switchToOtherCart();
    await cart.goto();
    await expect(page.getByText(/Mango E2E Alpha|ME-E2E-A1/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('OOS race: two browsers, last unit, A pays, B gets size_unavailable', async ({ page }) => {
    const browser = customerBrowser(page);
    const contextOptions = { baseURL: loadTestEnv().frontBaseUrl, locale: 'fr-FR' as const };
    const contextA = await browser.newContext(contextOptions);
    const contextB = await browser.newContext(contextOptions);
    await skipOnboardingOnContext(contextA);
    await skipOnboardingOnContext(contextB);
    const pageA = await openPinnedPage(contextA);
    const pageB = await openPinnedPage(contextB);

    try {
      const emailA = uniqueEmail('flow-oos-a');
      const emailB = uniqueEmail('flow-oos-b');
      const [cartA, cartB] = await Promise.all([
        prepareOosCheckout(pageA, emailA),
        prepareOosCheckout(pageB, emailB),
      ]);

      const orderA = await (async () => {
        await cartA.openPayConfirm();
        await cartA.confirmPay();
        return cartA.expectOrderSuccess();
      })();
      expect(orderA.length).toBeGreaterThan(3);

      await cartB.attemptPayExpectError(/plus disponible|indisponible|unavailable|panier est vide|empty/i);
      // Keep the single-unit fixture usable by subsequent OOS scenarios.
      await cancelConfirmedOrder(pageA, orderA);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('OOS race: two independent browsers press Payer together, exactly one reserves and pays', async ({
    page,
  }) => {
    const browser = customerBrowser(page);
    // Use separate Chromium processes, not just two tabs/contexts. In a
    // headed run this opens two windows, while the separate cookie jars make
    // the customers and their concurrent checkout requests independent.
    const launch = {
      channel: 'chrome' as const,
      chromiumSandbox: true,
      headless: process.env.PAM_TEST_HEADLESS === '1',
      ignoreDefaultArgs: ['--disable-blink-features=AutomationControlled'],
      args: functionalChromeArgs(),
    };
    const browserA = await browser.browserType().launch(launch);
    const browserB = await browser.browserType().launch(launch);
    const contextOptions = { baseURL: loadTestEnv().frontBaseUrl, locale: 'fr-FR' };
    const contextA = await browserA.newContext(contextOptions);
    const contextB = await browserB.newContext(contextOptions);
    await skipOnboardingOnContext(contextA);
    await skipOnboardingOnContext(contextB);
    const pageA = await openPinnedPage(contextA);
    const pageB = await openPinnedPage(contextB);

    try {
      const [cartA, cartB] = await Promise.all([
        prepareOosCheckout(pageA, uniqueEmail('flow-oos-sim-a')),
        prepareOosCheckout(pageB, uniqueEmail('flow-oos-sim-b')),
      ]);

      // Both clicks begin together. Reservation, rather than Stripe, decides the winner.
      expect(pageA.context()).not.toBe(pageB.context());
      await Promise.all([startPayment(pageA), startPayment(pageB)]);
      const [outcomeA, outcomeB] = await Promise.all([
        paymentReservationOutcome(pageA),
        paymentReservationOutcome(pageB),
      ]);
      expect([outcomeA, outcomeB].filter((outcome) => outcome === 'reserved')).toHaveLength(1);
      expect([outcomeA, outcomeB].filter((outcome) => outcome === 'unavailable')).toHaveLength(1);

      const [winnerPage, winnerCart, loserPage] =
        outcomeA === 'reserved' ? [pageA, cartA, pageB] : [pageB, cartB, pageA];
      await winnerCart.confirmPay();
      const orderNumber = await winnerCart.expectOrderSuccess();
      expect(orderNumber.length).toBeGreaterThan(3);

      // The loser never reaches Stripe confirmation and receives the stock message.
      await expect(
        loserPage
          .getByTestId(tid.cart.confirmError)
          .or(loserPage.getByTestId(tid.cart.paymentError))
          .or(loserPage.getByRole('dialog', { name: /impossible de préparer le paiement/i }))
          .first(),
      ).toContainText(/plus disponible|indisponible|unavailable|panier est vide|empty/i);
      await cancelConfirmedOrder(winnerPage, orderNumber);
    } finally {
      await browserA.close();
      await browserB.close();
    }
  });

  test('OOS: A pays, cancels, then B can pay the released last unit', async ({ page }) => {
    const browser = customerBrowser(page);
    const contextOptions = { baseURL: loadTestEnv().frontBaseUrl, locale: 'fr-FR' as const };
    const contextA = await browser.newContext(contextOptions);
    const contextB = await browser.newContext(contextOptions);
    await skipOnboardingOnContext(contextA);
    await skipOnboardingOnContext(contextB);
    const pageA = await openPinnedPage(contextA);
    const pageB = await openPinnedPage(contextB);

    try {
      const [cartA, cartB] = await Promise.all([
        prepareOosCheckout(pageA, uniqueEmail('flow-oos-cancel-a')),
        prepareOosCheckout(pageB, uniqueEmail('flow-oos-cancel-b')),
      ]);

      await cartA.openPayConfirm();
      await cartA.confirmPay();
      const orderA = await cartA.expectOrderSuccess();
      await cancelConfirmedOrder(pageA, orderA);

      // Cancellation releases the confirmed reservation: B can now reserve before Stripe.
      await cartB.openPayConfirm();
      await cartB.confirmPay();
      const orderB = await cartB.expectOrderSuccess();
      expect(orderB.length).toBeGreaterThan(3);
      await cancelConfirmedOrder(pageB, orderB);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('OOS: A payment fails and is abandoned, then B can pay the released last unit', async ({
    page,
  }) => {
    const browser = customerBrowser(page);
    const contextOptions = { baseURL: loadTestEnv().frontBaseUrl, locale: 'fr-FR' as const };
    const contextA = await browser.newContext(contextOptions);
    const contextB = await browser.newContext(contextOptions);
    await skipOnboardingOnContext(contextA);
    await skipOnboardingOnContext(contextB);
    const pageA = await openPinnedPage(contextA);
    const pageB = await openPinnedPage(contextB);

    try {
      // Stripe's test card that attaches successfully but declines a charge:
      // A obtains the reservation, then fails at Stripe confirmation and
      // leaves the checkout without retrying.
      const [cartA, cartB] = await Promise.all([
        prepareOosCheckout(
          pageA,
          uniqueEmail('flow-oos-failed-a'),
          '4000000000000341',
        ),
        prepareOosCheckout(pageB, uniqueEmail('flow-oos-failed-b')),
      ]);

      await cartA.openPayConfirm();
      await cartA.confirmPay();
      await expect(pageA.getByTestId(tid.cart.confirmError)).toBeVisible({ timeout: 15_000 });
      await expect(pageA.getByTestId(tid.cart.confirmError)).toContainText(/refus|declin|declined|failed/i);
      await clickVisible(
        pageA
          .getByRole('dialog', { name: /confirmer le paiement/i })
          .getByRole('button', { name: /annuler/i }),
      );

      // The payment_failed webhook releases A's held reservation, so B can
      // reserve and pay without waiting for the reservation TTL to expire.
      await waitForReleasedReservation(pageB);
      await cartB.confirmPay();
      const orderB = await cartB.expectOrderSuccess();
      expect(orderB.length).toBeGreaterThan(3);
      await cancelConfirmedOrder(pageB, orderB);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
