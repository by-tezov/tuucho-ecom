import { expect, test } from './fixtures.js';
import { apiJson, registerUser, uniqueEmail } from './api.js';
import { reveal } from './interact.js';
import {
  creditCustomerWallet,
  expireDueLoyaltyLots,
  fetchAccountLoyaltyPreview,
  fetchAccountLoyaltyWallet,
  forceActiveLotsExpiresAt,
  placeGuestPaidCardOrder,
  placePaidCardOrder,
  seedCartLine,
} from './loyalty.js';
import { testPassword } from './env.js';
import { E2E_PRODUCT_UIDS } from './catalog.js';
import {
  addSeededProductToCart,
  amountPattern,
  ensureLoggedOut,
  ensureLoyaltyAdmin,
    expectBannerWithEarn,
    expectBannerWithoutEarn,
    grantLoyaltyForOrder,
    loginAndOpenSeededCart,
    loginAsCustomer,
    openLoyaltyPage,
    parseEuroAmount,
    teardownLoyaltyAdmin,
    expectCartLoyaltyEarnMatchesMerchandise,
} from './loyalty-flows.js';
import {
  claimGuestOrder,
  createAccountForGuestEmail,
  createExistingAccount,
  expectGuestOrderAndSavedDataAbsent,
  loginGuestEmail,
} from './guest-order-flows.js';
import { AuthPages } from './pages/auth.pages.js';
import { AddressPages } from './pages/address.pages.js';
import { extractOtpFromMail, waitForMail } from './mail.js';
import { shopPath } from './shopPath.js';
import { CartPages } from './pages/cart.pages.js';
import { GalleryPages } from './pages/gallery.pages.js';
import { tid } from './selectors.js';

async function loginToken(request: import('patchright/test').APIRequestContext, email: string) {
  const { body } = await apiJson<{ accessToken?: string }>(request, 'POST', '/auth/login', {
    data: { email, password: testPassword },
    expectedStatus: 200,
  });
  if (!body.accessToken) throw new Error('login missing accessToken');
  return body.accessToken;
}

/** After a guest claim the registration password is cancelled. OTP still connects. */
async function loginTokenViaOtp(request: import('patchright/test').APIRequestContext, email: string) {
  const sinceMs = Date.now() - 500;
  await apiJson(request, 'POST', '/auth/request-otp', {
    data: { email, purpose: 'login' },
    expectedStatus: 200,
  });
  const otp = extractOtpFromMail(
    await waitForMail({
      kind: 'user',
      toIncludes: email,
      sinceMs,
      timeoutMs: 15_000,
      subjectIncludes: 'code de connexion',
    }),
  );
  const { body } = await apiJson<{ accessToken?: string }>(request, 'POST', '/auth/verify-otp', {
    data: { email, code: otp, purpose: 'login', rememberMe: false },
    expectedStatus: 200,
  });
  if (!body.accessToken) throw new Error('OTP login missing accessToken');
  return body.accessToken;
}

async function firstAddressId(
  request: import('patchright/test').APIRequestContext,
  accessToken: string,
): Promise<string> {
  const { body } = await apiJson<{ addresses?: Array<{ id?: string }> }>(
    request,
    'GET',
    '/account/addresses',
    { token: accessToken, expectedStatus: 200 },
  );
  const id = body.addresses?.find((row) => row.id)?.id;
  if (!id) throw new Error('expected at least one saved address');
  return id;
}

/**
 * Shared suites run from both `web/loyalty` and `mobile/loyalty` spec files.
 * Separate `test(\`web ${title}\`)` and `test(\`mobile ${title}\`)` calls keep
 * desktop indexes (1-1000) and mobile indexes (1001-2000) on different source lines.
 * `title` is `<what is tested>: <what is expected>`.
 */
function surfaceTest(
  surface: 'web' | 'mobile',
  title: string,
  fn: Parameters<typeof test>[1],
): void {
  if (surface === 'web') {
    test(`web ${title}`, fn);
  } else {
    test(`mobile ${title}`, fn);
  }
}

/**
 * Mobile cart must be seeded through the gallery UI (same as the working
 * checkout matrix). API-only cart seeding leaves the SPA without a cart
 * journey that CartPages.goto can open reliably on handset.
 */
async function openMobileUiSeededCart(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  email: string,
): Promise<{ accessToken: string; addressId: string }> {
  const auth = new AuthPages(page);
  await ensureLoggedOut(page);
  await auth.registerFromMobileOrders(email, testPassword);
  await auth.openMobileAccount();

  const addresses = new AddressPages(page);
  await addresses.addHomeLivraison();

  const gallery = new GalleryPages(page);
  await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'M' });

  const cart = new CartPages(page);
  await cart.goto();
  await expect(page.getByTestId('cart-page')).toBeVisible({ timeout: 15_000 });
  await cart.selectFirstHomeCourier();
  await cart.selectFirstAddress();

  const accessToken = await loginToken(request, email);
  const addressId = await firstAddressId(request, accessToken);
  return { accessToken, addressId };
}

/** Registers the full loyalty browser matrix for one surface (web or mobile). */
export function registerLoyaltyFunctionalSuites(surface: 'web' | 'mobile'): void {
  if (surface === 'web') {
    test.describe(`Fidélité ${surface}, bannière panier`, () => {
      let adminToken: string;

      test.beforeAll(async ({ request }) => {
        adminToken = await ensureLoyaltyAdmin(request);
      });

      test.afterAll(async ({ request }) => {
        await teardownLoyaltyAdmin(request, adminToken);
      });

      test(`${surface} bannière guest: le montant à gagner est affiché`, async ({ page }) => {
        await addSeededProductToCart(page);
        await page.goto(shopPath('/gallery'));
        await expectBannerWithEarn(page);
      });

      test(`${surface} bannière connectée couverte: aucun montant à gagner n’est affiché`, async ({
        page,
        request,
      }) => {
        const email = uniqueEmail(`loy-banner-cover-${surface}`);
        const customer = await registerUser(request, { email });
        await seedCartLine(request, customer.accessToken);
        await creditCustomerWallet(request, adminToken, customer.email, 10_000, 'cover merchandise');
        await loginAsCustomer(page, email);
        await page.goto(shopPath('/gallery'));
        await expectBannerWithoutEarn(page);
      });

      test(`${surface} bannière connectée: le montant à gagner est affiché`, async ({ page, request }) => {
        const email = uniqueEmail(`loy-banner-earn-${surface}`);
        const customer = await registerUser(request, { email });
        await seedCartLine(request, customer.accessToken, 1);
        await loginAsCustomer(page, email);
        await page.goto(shopPath('/gallery'));
        await expectBannerWithEarn(page);
      });
    });
  } else {
    // CartBanner is CSS-hidden below 1024px; handset earn lives in the cart callout.
    test.describe(`Fidélité ${surface}, callout gain panier`, () => {
      let adminToken: string;

      test.beforeAll(async ({ request }) => {
        adminToken = await ensureLoyaltyAdmin(request);
      });

      test.afterAll(async ({ request }) => {
        await teardownLoyaltyAdmin(request, adminToken);
      });

      test(`${surface} callout gain: il reste visible avec un solde nul`, async ({ page, request }) => {
        const email = uniqueEmail(`loy-callout-earn-${surface}`);
        await openMobileUiSeededCart(page, request, email);
        await expect(page.getByText(/tu gagneras/i)).toBeVisible({ timeout: 15_000 });
      });

    });
  }

  test.describe(`Fidélité ${surface}, utilisation cagnotte panier`, () => {
    let adminToken: string;

    test.beforeAll(async ({ request }) => {
      adminToken = await ensureLoyaltyAdmin(request);
    });

    test.afterAll(async ({ request }) => {
      await teardownLoyaltyAdmin(request, adminToken);
    });

    surfaceTest(surface, 'switch cagnotte: le gain affiché baisse', async ({ page, request }) => {
      const email = uniqueEmail(`loy-use-${surface}`);
      let accessToken: string;
      let addressId: string;

      if (surface === 'mobile') {
        ({ accessToken, addressId } = await openMobileUiSeededCart(page, request, email));
        await creditCustomerWallet(request, adminToken, email, 5, 'wallet use');
        // Remount cart so wallet balance is picked up after the admin credit.
        await page.getByTestId('tab-bar-gallery').click();
        await expect(page.getByTestId('gallery-page')).toBeVisible({ timeout: 15_000 });
        const cart = new CartPages(page);
        await cart.goto();
        await cart.selectFirstHomeCourier();
        await cart.selectFirstAddress();
      } else {
        const customer = await registerUser(request, { email });
        accessToken = customer.accessToken;
        ({ addressId } = await seedCartLine(request, accessToken));
        // Credit before first cart open — CartPages.goto is a no-op when the
        // cart page is already visible, so a post-open credit would leave a
        // stale availableBalance of 0 and hide the wallet switch.
        await creditCustomerWallet(request, adminToken, email, 5, 'wallet use');
        await loginAndOpenSeededCart(page, email);
      }

      const without = await fetchAccountLoyaltyPreview(request, accessToken, {
        addressId,
        applyLoyalty: false,
      });
      const withWallet = await fetchAccountLoyaltyPreview(request, accessToken, {
        addressId,
        applyLoyalty: true,
      });
      expect(without.loyaltyEarn).toBeGreaterThan(withWallet.loyaltyEarn);

      const earnCallout = page.getByText(/tu gagneras/i);
      await reveal(earnCallout);
      const before = parseEuroAmount(await earnCallout.innerText());
      expect(before).toBeCloseTo(without.loyaltyEarn, 2);

      const walletSwitch = page.getByRole('switch', { name: /utiliser ma cagnotte/i });
      await reveal(walletSwitch);
      await walletSwitch.click();
      await expect(page.getByText(/crédit fidélité/i)).toBeVisible({ timeout: 15_000 });
      const after = parseEuroAmount(await earnCallout.innerText());
      expect(after).toBeLessThan(before);
      expect(after).toBeCloseTo(withWallet.loyaltyEarn, 2);
    });

    async function openEmptyWalletCart(
      page: import('patchright/test').Page,
      request: import('patchright/test').APIRequestContext,
      walletSurface: 'web' | 'mobile',
    ) {
      const email = uniqueEmail(`loy-use-empty-${walletSurface}`);
      if (walletSurface === 'mobile') {
        await openMobileUiSeededCart(page, request, email);
        return;
      }
      const customer = await registerUser(request, { email });
      await seedCartLine(request, customer.accessToken);
      await loginAndOpenSeededCart(page, email);
    }

    surfaceTest(surface, 'cagnotte sans solde: le switch est absent', async ({ page, request }) => {
      await openEmptyWalletCart(page, request, surface);
      await expect(page.getByRole('switch', { name: /utiliser ma cagnotte/i })).toHaveCount(0);
    });

    surfaceTest(surface, 'cagnotte sans solde: le gain reste visible', async ({ page, request }) => {
      await openEmptyWalletCart(page, request, surface);
      await expect(page.getByText(/tu gagneras/i)).toBeVisible({ timeout: 15_000 });
    });

    surfaceTest(surface, 'cagnotte au centime: elle suit l’ajout puis le retrait d’un set', async ({
      page,
      request,
    }) => {
      const email = uniqueEmail(`loy-earn-cents-${surface}`);
      if (surface === 'mobile') {
        await openMobileUiSeededCart(page, request, email);
      } else {
        const customer = await registerUser(request, { email });
        await seedCartLine(request, customer.accessToken);
        await loginAndOpenSeededCart(page, email);
      }

      await test.step('Expected: the recap cagnotte is exactly 10% of paid merchandise, not shipping', async () => {
        await expectCartLoyaltyEarnMatchesMerchandise(page);
      });

      const gallery = new GalleryPages(page);
      await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A2, { shapeKey: 'amande', size: 'M' });
      const cart = new CartPages(page);
      await cart.goto();
      await expect(
        page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${E2E_PRODUCT_UIDS.A2}"]`),
      ).toBeVisible({ timeout: 15_000 });
      if (surface === 'mobile') {
        await cart.selectFirstHomeCourier();
        await cart.selectFirstAddress();
      }

      await test.step('Expected: two sets earn 10% of the sous-total after the volume remise, to the cent', async () => {
        await expectCartLoyaltyEarnMatchesMerchandise(page);
      });

      await cart.removeNailByUid(E2E_PRODUCT_UIDS.A2);
      await test.step('Expected: removing the second set restores the previous cagnotte, to the cent', async () => {
        await expectCartLoyaltyEarnMatchesMerchandise(page);
      });
    });
  });

  test.describe(`Fidélité ${surface}, page cagnotte`, () => {
    let adminToken: string;

    test.beforeAll(async ({ request }) => {
      adminToken = await ensureLoyaltyAdmin(request);
    });

    test.afterAll(async ({ request }) => {
      await teardownLoyaltyAdmin(request, adminToken);
    });

    surfaceTest(surface, 'crédit admin: le solde affiché correspond au crédit', async ({ page, request }) => {
      const email = uniqueEmail(`loy-page-credit-${surface}`);
      const customer = await registerUser(request, { email });
      await creditCustomerWallet(request, adminToken, customer.email, 9.75, 'page credit');
      await openLoyaltyPage(page, email);
      await expect(
        page.getByTestId('account-loyalty-page').getByText(amountPattern(9.75)).first(),
      ).toBeVisible({ timeout: 15_000 });
    });

    surfaceTest(surface, 'alerte burn: elle est visible, puis absente après expiration', async ({
      page,
      request,
    }) => {
      const email = uniqueEmail(`loy-burn-${surface}`);
      const customer = await registerUser(request, { email });
      const userId = String(customer.user.id ?? '');
      expect(userId.length).toBeGreaterThan(0);

      await creditCustomerWallet(request, adminToken, customer.email, 6.5, 'burn ui');
      const noticeExpires = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      expect(await forceActiveLotsExpiresAt(userId, noticeExpires)).toBeGreaterThan(0);
      const wallet = await fetchAccountLoyaltyWallet(request, customer.accessToken);
      expect(wallet.burnNoticeAmount ?? 0).toBeGreaterThan(0);

      await openLoyaltyPage(page, email);
      await expect(page.getByRole('status').filter({ hasText: /utilise|avant|perdu/i })).toBeVisible({
        timeout: 15_000,
      });

      await forceActiveLotsExpiresAt(userId, new Date(Date.now() - 1_000));
      expect(await expireDueLoyaltyLots()).toBeGreaterThan(0);
      await page.reload();
      await expect(page.getByTestId('account-loyalty-page')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('status').filter({ hasText: /utilise|avant|perdu/i })).toHaveCount(0);
      await expect(page.getByTestId('account-loyalty-page').getByText(/périmé/i)).toBeVisible();
    });

    surfaceTest(surface, 'validation d’une commande connectée: le gain est crédité sur la cagnotte', async ({ page, request }) => {
      const email = uniqueEmail(`loy-earn-user-${surface}`);
      const customer = await registerUser(request, { email });
      const placed = await placePaidCardOrder(request, customer.accessToken, { applyLoyalty: false });
      expect(placed.loyaltyEarn).toBeGreaterThan(0);
      await grantLoyaltyForOrder(request, adminToken, placed.orderId);
      const wallet = await fetchAccountLoyaltyWallet(request, customer.accessToken);
      expect(wallet.available).toBeCloseTo(placed.loyaltyEarn, 2);
      await openLoyaltyPage(page, email);
      await expect(
        page.getByTestId('account-loyalty-page').getByText(amountPattern(placed.loyaltyEarn)).first(),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe(`Fidélité ${surface}, guest rattachement + earn`, () => {
    let adminToken: string;

    test.beforeAll(async ({ request }) => {
      adminToken = await ensureLoyaltyAdmin(request);
    });

    test.afterAll(async ({ request }) => {
      await teardownLoyaltyAdmin(request, adminToken);
    });

    surfaceTest(surface, 'guest nouveau compte: le claim crédite la cagnotte', async ({
      page,
      request,
    }) => {
      await ensureLoggedOut(page);
      const email = uniqueEmail(`loy-guest-new-${surface}`);
      const guestOrder = await placeGuestPaidCardOrder(request, email);
      expect(guestOrder.loyaltyEarn).toBeGreaterThan(0);

      await createAccountForGuestEmail(page, email);
      await expectGuestOrderAndSavedDataAbsent(page, guestOrder.orderNumber);
      await claimGuestOrder(page, guestOrder.orderNumber, guestOrder.manageToken, false);
      await grantLoyaltyForOrder(request, adminToken, guestOrder.orderId);

      const token = await loginTokenViaOtp(request, email);
      const wallet = await fetchAccountLoyaltyWallet(request, token);
      expect(wallet.available).toBeCloseTo(guestOrder.loyaltyEarn, 2);

      await page.goto(shopPath('/account/loyalty'));
      await expect(page.getByTestId('account-loyalty-page')).toBeVisible({ timeout: 15_000 });
      await expect(
        page
          .getByTestId('account-loyalty-page')
          .getByText(amountPattern(guestOrder.loyaltyEarn))
          .first(),
      ).toBeVisible({ timeout: 15_000 });
    });

    surfaceTest(surface, 'guest compte existant: le claim crédite la cagnotte', async ({
      page,
      request,
    }) => {
      await ensureLoggedOut(page);
      const email = uniqueEmail(`loy-guest-exist-${surface}`);
      await createExistingAccount(email);
      const guestOrder = await placeGuestPaidCardOrder(request, email);
      expect(guestOrder.loyaltyEarn).toBeGreaterThan(0);

      await loginGuestEmail(page, email);
      await expectGuestOrderAndSavedDataAbsent(page, guestOrder.orderNumber);
      await claimGuestOrder(page, guestOrder.orderNumber, guestOrder.manageToken, false);
      await grantLoyaltyForOrder(request, adminToken, guestOrder.orderId);

      const token = await loginTokenViaOtp(request, email);
      const wallet = await fetchAccountLoyaltyWallet(request, token);
      expect(wallet.available).toBeCloseTo(guestOrder.loyaltyEarn, 2);

      await page.goto(shopPath('/account/loyalty'));
      await expect(page.getByTestId('account-loyalty-page')).toBeVisible({ timeout: 15_000 });
      await expect(
        page
          .getByTestId('account-loyalty-page')
          .getByText(amountPattern(guestOrder.loyaltyEarn))
          .first(),
      ).toBeVisible({ timeout: 15_000 });
    });
  });
}
