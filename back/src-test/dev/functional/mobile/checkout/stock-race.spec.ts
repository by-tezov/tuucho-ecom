import { openPinnedPage, test, expect } from '../../../support/fixtures.js';
import { enableAllShopPaymentMethods, uniqueEmail } from '../../../support/api.js';
import { loadTestEnv } from '../../../support/env.js';
import { E2E_PRODUCT_UIDS, resetE2eOosStock } from '../../../support/catalog.js';
import { AddressPages } from '../../../support/pages/address.pages.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { tid } from '../../../support/selectors.js';
import { clickVisible, reveal, skipOnboardingOnContext, startCustomerJourneyAtRoot } from '../../../support/interact.js';
import { actionDeadline } from '../../../support/timeouts.js';
import { setOrderStatus } from '../../../support/ops.js';

const MOBILE = { width: 390, height: 633 };

/** The stock race starts after both customers are already authenticated.
 * Create those independent sessions directly against the disposable API,
 * then install each opaque refresh cookie in its matching browser context.
 * This avoids making the race depend on a separate mobile-auth navigation
 * assertion, which is covered in the auth suite. */
async function authenticateContext(
  context: import('patchright/test').BrowserContext,
  email: string,
): Promise<void> {
  const { apiBaseUrl } = loadTestEnv();
  const response = await fetch(`${apiBaseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'E2eTest1!',
      gdprConsent: { accepted: true },
      language: 'fr',
    }),
  });
  if (response.status !== 201) {
    throw new Error(`could not create stock-race account: ${response.status} ${await response.text()}`);
  }
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('refresh_token='));
  const token = cookie?.match(/^refresh_token=([^;]+)/)?.[1];
  if (!token) throw new Error('stock-race registration returned no refresh cookie');
  const apiUrl = new URL(apiBaseUrl);
  await context.addCookies([
    {
      name: 'refresh_token',
      value: decodeURIComponent(token),
      domain: apiUrl.hostname,
      path: '/auth',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function prepareMobileOosCheckout(
  page: import('patchright/test').Page,
  cardNumber?: string,
): Promise<CartPages> {
  await startCustomerJourneyAtRoot(page, 'authenticated');
  await new AuthPages(page).openMobileAccount();

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
  await cart.addSavedTestCardFromProfile('Cliente mobile E2E', cardNumber);
  await cart.selectSavedCard();
  return cart;
}

async function startPayment(page: import('patchright/test').Page): Promise<void> {
  const pay = page.getByTestId(tid.cart.paySubmit);
  await reveal(pay);
  await expect(pay).toBeEnabled({ timeout: 15_000 });
  await pay.click();
}

async function waitForReleasedReservation(page: import('patchright/test').Page): Promise<void> {
  const deadline = actionDeadline();
  do {
    await startPayment(page);
    const confirm = page.getByTestId(tid.cart.confirmPay);
    const unavailable = page.getByTestId(tid.cart.confirmError).or(page.getByTestId(tid.cart.paymentError));
    await expect(confirm.or(unavailable).first()).toBeVisible({ timeout: 15_000 });
    if (await confirm.isVisible()) return;

    await clickVisible(
      page.getByRole('dialog', { name: /confirmer le paiement/i }).getByRole('button', { name: /annuler/i }),
    );
    await page.waitForTimeout(750);
  } while (Date.now() < deadline);
  throw new Error('payment_failed did not release the mobile customer reservation in time');
}

test.describe('Mobile stock race: two customers', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
    await resetE2eOosStock();
  });

  test('mobile two separate browser windows: declined A payment releases the last item for B', async ({
    page,
  }) => {
    // Separate browser contexts give the customers independent cookies and
    // local storage while retaining the runner's authenticated local-browser
    // configuration for the isolated loopback API.
    const contextOptions = {
      baseURL: loadTestEnv().frontBaseUrl,
      viewport: MOBILE,
      locale: 'fr-FR',
      ignoreHTTPSErrors: true,
    };
    // `page` comes from the functional fixture's persistent Chrome instance;
    // its Browser is therefore configured for this repo's loopback API.
    const customerBrowser = page.context().browser();
    if (!customerBrowser) throw new Error('functional browser is unavailable');
    const contextA = await customerBrowser.newContext(contextOptions);
    const contextB = await customerBrowser.newContext(contextOptions);
    await skipOnboardingOnContext(contextA);
    await skipOnboardingOnContext(contextB);
    await authenticateContext(contextA, uniqueEmail('mobile-oos-denied-a'));
    await authenticateContext(contextB, uniqueEmail('mobile-oos-denied-b'));
    const pageA = await openPinnedPage(contextA, 'mobile');
    const pageB = await openPinnedPage(contextB, 'mobile');

    try {
      // Account bootstrap and Stripe Element setup both initialize global
      // browser-provider state. Keep that non-racing preparation serial; the
      // actual behaviour under test begins only when A reserves the final
      // unit and B subsequently retries payment from its separate window.
      const cartA = await prepareMobileOosCheckout(pageA, '4000000000000341');
      const cartB = await prepareMobileOosCheckout(pageB);
      expect(pageA.context()).not.toBe(pageB.context());

      // A reserves the only product, then Stripe declines its card. B sees
      // the temporary unavailability only until the failed payment webhook
      // frees A's reservation.
      await cartA.openPayConfirm();
      await cartA.confirmPay();
      await expect(pageA.getByTestId(tid.cart.confirmError)).toBeVisible({ timeout: 15_000 });
      await expect(pageA.getByTestId(tid.cart.confirmError)).toContainText(/refus|declin|declined|failed/i);
      await clickVisible(
        pageA
          .getByRole('dialog', { name: /confirmer le paiement/i })
          .getByRole('button', { name: /annuler/i }),
      );

      await waitForReleasedReservation(pageB);
      await cartB.confirmPay();
      const orderNumber = await cartB.expectOrderSuccess();
      expect(orderNumber.length).toBeGreaterThan(3);
      // The fixture deliberately contains one unit. This scenario proves B
      // can obtain it once A's declined-payment reservation is released;
      // release B's confirmed allocation afterwards so the independent web
      // OOS scenarios start from the seeded stock too.
      await setOrderStatus(orderNumber, 'cancelled');
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
