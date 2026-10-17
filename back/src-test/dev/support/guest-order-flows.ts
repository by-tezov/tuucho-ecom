import type { Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { uniqueEmail } from './api.js';
import { testPassword } from './env.js';
import { E2E_PRODUCT_UIDS } from './catalog.js';
import { extractGuestManageToken, waitForMail } from './mail.js';
import { AuthPages } from './pages/auth.pages.js';
import { GalleryPages } from './pages/gallery.pages.js';
import { CartPages } from './pages/cart.pages.js';
import { AccountPages } from './pages/account.pages.js';
import { tid } from './selectors.js';
import { startCustomerJourneyAtRoot, expectAnonymousSession } from './interact.js';
import { shopPathWithSearch } from './shopPath.js';

export async function placeGuestOrder(
  page: Page,
  opts: { email?: string; rememberAddress: boolean; rememberCard: boolean },
): Promise<{ email: string; orderNumber: string; manageToken: string }> {
  const email = opts.email ?? uniqueEmail('guest-claim');
  const gallery = new GalleryPages(page);
  await startCustomerJourneyAtRoot(page);
  await gallery.goto();
  await expect(page.getByTestId(tid.gallery.page)).toBeVisible({ timeout: 15_000 });
  await expect(gallery.cards().first()).toBeVisible({ timeout: 15_000 });
  // Wait for AuthContext to settle on the anonymous branch before adding:
  // adding while it is still "loading" follows the authenticated cart path,
  // then the route correctly refreshes back to an empty guest cart.
  await expectAnonymousSession(page);
  // Use a known seeded public set so the cart page can hydrate the same
  // product id after the anonymous SPA navigation.
  await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, {
    shapeKey: 'amande',
    size: 'M',
    dismissDrawer: false,
  });
  await page.getByTestId(tid.cart.drawerCheckout).click();
  await expect(page).toHaveURL(/\/cart\/?$/);

  const cart = new CartPages(page);
  await expect(page.getByTestId(tid.cart.page)).toBeVisible();
  await expect(page.getByTestId(tid.cart.line).first()).toBeVisible({ timeout: 15_000 });
  await cart.addHomeAddressFromCart({
    label: opts.rememberAddress ? 'Adresse guest mémorisée' : 'Adresse guest ponctuelle',
    rememberAddress: opts.rememberAddress,
  });
  await cart.selectFirstHomeCourier();
  await cart.selectFirstAddress();

  const sinceMs = Date.now() - 1_000;
  const orderNumber = await cart.addGuestCardAndPayToSuccess(email, {
    rememberCard: opts.rememberCard,
  });
  const mail = await waitForMail({
    kind: 'user',
    toIncludes: email,
    subjectIncludes: 'Confirmation de votre commande',
    sinceMs,
    timeoutMs: 15_000,
  });
  return { email, orderNumber, manageToken: extractGuestManageToken(mail) };
}

export async function createAccountForGuestEmail(page: Page, email: string): Promise<void> {
  const auth = new AuthPages(page);
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await auth.registerFromMobileOrders(email, testPassword);
    await auth.openMobileAccount();
  } else {
    await auth.registerFromDesktopAccountModal(email, testPassword);
    await auth.openDesktopAccount();
  }
}

/** Seed the existing-email branch without logging the browser in. */
export async function createExistingAccount(email: string): Promise<void> {
  const base = process.env.PAM_API_BASE_URL;
  if (!base) throw new Error('PAM_API_BASE_URL is required for guest account setup.');
  const response = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: testPassword,
      gdprConsent: { accepted: true },
      language: 'fr',
    }),
  });
  if (response.status !== 201) {
    throw new Error(`Guest existing-account setup failed with HTTP ${response.status}.`);
  }
}

export async function loginGuestEmail(page: Page, email: string): Promise<void> {
  const auth = new AuthPages(page);
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await auth.loginFromMobileOrders(email, testPassword);
    await auth.openMobileAccount();
  } else {
    await auth.loginFromDesktopAccountModal(email, testPassword);
    await auth.openDesktopAccount();
  }
}

export async function expectGuestOrderAndSavedDataAbsent(page: Page, orderNumber: string): Promise<void> {
  const account = new AccountPages(page);
  await account.gotoOrders();
  await expect(account.orderCard(orderNumber)).toHaveCount(0);

  await account.gotoAddresses();
  await expect(page.getByText(/Adresse guest mémorisée|Adresse guest ponctuelle|10 rue de Test/i)).toHaveCount(0);

  await account.gotoPayments();
  await expect(page.getByText(/4242/)).toHaveCount(0);
}

export async function openGuestClaim(page: Page, manageToken: string): Promise<void> {
  await page.goto(shopPathWithSearch(`/account/manage-order?token=${encodeURIComponent(manageToken)}`));
  await expect(page).toHaveURL(/\/orders\/?$/);
}

export async function expectClaimedOrder(page: Page, orderNumber: string): Promise<void> {
  const account = new AccountPages(page);
  await account.gotoOrders();
  await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
}

export async function expectClaimedAddress(page: Page, remembered: boolean): Promise<void> {
  const account = new AccountPages(page);
  await account.gotoAddresses();
  const address = page.getByText(
    remembered ? 'Adresse guest mémorisée' : 'Adresse guest ponctuelle',
    { exact: true },
  );
  await expect(address).toHaveCount(remembered ? 1 : 0);
}

export async function expectClaimedCard(page: Page, remembered: boolean): Promise<void> {
  const account = new AccountPages(page);
  await account.gotoPayments();
  await expect(page.getByText(/4242/)).toHaveCount(remembered ? 1 : 0);
}

export async function claimGuestOrder(
  page: Page,
  orderNumber: string,
  manageToken: string,
  expectSavedCheckout: boolean,
): Promise<void> {
  await openGuestClaim(page, manageToken);
  await expectClaimedOrder(page, orderNumber);
  await expectClaimedAddress(page, expectSavedCheckout);
  await expectClaimedCard(page, expectSavedCheckout);
}
