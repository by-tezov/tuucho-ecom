import type { APIRequestContext, Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { pool } from '../../../src/db/pool.js';
import { enableAllShopPaymentMethods, registerAdmin } from './api.js';
import { testPassword } from './env.js';
import { reveal, startCustomerJourneyAtRoot, desktopLoginButton } from './interact.js';
import { advanceOrderToReceived, verifyReceivedOrder } from './loyalty.js';
import { AuthPages } from './pages/auth.pages.js';
import { CartPages } from './pages/cart.pages.js';
import { GalleryPages } from './pages/gallery.pages.js';
import { E2E_PRODUCT_UIDS } from './catalog.js';
import { tid } from './selectors.js';
import { shopPath } from './shopPath.js';

export function isMobilePage(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

export function amountPattern(amount: number): RegExp {
  const fixed = amount.toFixed(2).replace('.', '[,.]');
  return new RegExp(`${fixed}\\s*€`);
}

export function parseEuroAmount(text: string): number {
  const match = text.match(/(\d+[,.]\d{2})/);
  if (!match) throw new Error(`could not parse euro amount from "${text}"`);
  return Number(match[1].replace(',', '.'));
}

/** Program earn rate. Isolated tests load the same public env as the API. */
export function loyaltyValuePer100(): number {
  const parsed = Number(process.env.LOYALTY_VALUE_PER_100 ?? '10');
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`LOYALTY_VALUE_PER_100 is not a usable rate: ${process.env.LOYALTY_VALUE_PER_100}`);
  }
  return parsed;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** 10% of paid merchandise (or whatever LOYALTY_VALUE_PER_100 says), to the cent. */
export function expectedLoyaltyEarnFromMerchandise(merchandise: number): number {
  return Math.round(((merchandise * loyaltyValuePer100()) / 100) * 100) / 100;
}

async function readCartMerchandiseEuro(page: Page): Promise<number> {
  return parseEuroAmount(await page.getByTestId(tid.cart.subtotal).innerText());
}

/** Volume remise shown on the recap. Absent when the cart has not reached a tier. */
async function readCartRulesDiscountEuro(page: Page): Promise<number> {
  const discount = page.getByTestId(tid.cart.rulesDiscount);
  if ((await discount.count()) === 0) return 0;
  return parseEuroAmount(await discount.innerText());
}

/**
 * Compare the on-page cagnotte to LOYALTY_VALUE_PER_100 of what the shopper
 * pays for the sets: sous-total minus the volume remise. Shipping, rule gifts
 * and the loyalty preview API are not inputs. One cent off fails.
 */
export async function expectCartLoyaltyEarnMatchesMerchandise(page: Page): Promise<void> {
  await expect(async () => {
    const merchandise = await readCartMerchandiseEuro(page);
    const remise = await readCartRulesDiscountEuro(page);
    const paid = Math.round((merchandise - remise) * 100) / 100;
    const expected = expectedLoyaltyEarnFromMerchandise(paid);
    const expectedCents = toCents(expected);
    const earn = page.getByTestId(tid.cart.loyaltyEarn);
    if (expectedCents === 0) {
      await expect(earn).toHaveCount(0);
      return;
    }
    await reveal(earn);
    await expect(earn).toBeVisible();
    const displayed = parseEuroAmount(await earn.innerText());
    const displayedCents = toCents(displayed);
    if (displayedCents !== expectedCents) {
      throw new Error(
        `cagnotte ${displayed.toFixed(2)} € (${displayedCents} cents) != expected ${expected.toFixed(2)} € (${expectedCents} cents) from merchandise ${merchandise.toFixed(2)} € after volume remise ${remise.toFixed(2)} € (paid ${paid.toFixed(2)} €) at ${loyaltyValuePer100()}/100`,
      );
    }
  }).toPass({ timeout: 15_000 });
}

export async function ensureLoyaltyAdmin(request: APIRequestContext): Promise<string> {
  await enableAllShopPaymentMethods(request);
  const admin = await registerAdmin(request);
  return admin.accessToken;
}

export async function teardownLoyaltyAdmin(
  _request: APIRequestContext,
  _adminToken: string | undefined,
): Promise<void> {
  // The loyalty programme is always on. Nothing to restore.
}

export async function ensureLoggedOut(page: Page): Promise<void> {
  const auth = new AuthPages(page);
  await page.goto('/');
  if (isMobilePage(page)) {
    const ordersTab = page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('button', { name: 'Commandes', exact: true });
    if (!(await ordersTab.isVisible().catch(() => false))) return;
    await auth.openMobileAccount();
    await auth.logout();
    await expect(
      page
        .getByRole('navigation', { name: 'Navigation principale' })
        .getByRole('button', { name: /se connecter/i }),
    ).toBeVisible({ timeout: 15_000 });
    return;
  }
  if (
    !(await page
      .getByRole('banner')
      .getByRole('button', { name: 'Mon compte', exact: true })
      .isVisible()
      .catch(() => false))
  ) {
    return;
  }
  await auth.openDesktopAccount();
  await auth.logout();
  await expect(desktopLoginButton(page)).toBeVisible({ timeout: 15_000 });
}

export async function loginAsCustomer(page: Page, email: string, password = testPassword): Promise<void> {
  const auth = new AuthPages(page);
  await ensureLoggedOut(page);
  if (isMobilePage(page)) {
    await auth.loginFromMobileOrders(email, password);
    return;
  }
  await auth.loginFromDesktopAccountModal(email, password);
  await auth.openDesktopAccount();
}

export async function openLoyaltyPage(page: Page, email: string): Promise<void> {
  await loginAsCustomer(page, email);
  await page.goto(shopPath('/account/loyalty'));
  await expect(page.getByTestId('account-loyalty-page')).toBeVisible({ timeout: 15_000 });
}

export async function loginAndOpenSeededCart(page: Page, email: string): Promise<CartPages> {
  await loginAsCustomer(page, email);
  const cart = new CartPages(page);
  await cart.goto();
  await expect(page.getByTestId(tid.cart.line).first()).toBeVisible({ timeout: 15_000 });
  await cart.selectFirstHomeCourier();
  await cart.selectFirstAddress();
  return cart;
}

export async function addSeededProductToCart(page: Page): Promise<void> {
  await ensureLoggedOut(page);
  const gallery = new GalleryPages(page);
  await startCustomerJourneyAtRoot(page);
  await gallery.goto();
  await expect(page.getByTestId(tid.gallery.page)).toBeVisible({ timeout: 15_000 });
  await expect(gallery.cards().first()).toBeVisible({ timeout: 15_000 });
  if (!isMobilePage(page)) {
    await expect(desktopLoginButton(page)).toBeVisible();
  }
  await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, {
    shapeKey: 'amande',
    size: 'M',
    dismissDrawer: true,
  });
}

export function cartBanner(page: Page) {
  return page.getByRole('status').filter({ hasText: /articles en attente|panier/i });
}

export async function expectBannerWithoutEarn(page: Page): Promise<void> {
  const banner = cartBanner(page);
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner.getByText(/tu gagneras/i)).toHaveCount(0);
}

export async function expectBannerWithEarn(page: Page): Promise<void> {
  const banner = cartBanner(page);
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner.getByText(/tu gagneras/i)).toBeVisible({ timeout: 15_000 });
  await expect(banner.locator('strong').first()).toBeVisible();
}

export async function findOrderIdByNumber(orderNumber: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `select id::text as id from orders where order_number = $1 limit 1`,
    [orderNumber],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`order ${orderNumber} not found`);
  return id;
}

export async function grantLoyaltyForOrder(
  request: APIRequestContext,
  adminToken: string,
  orderId: string,
): Promise<void> {
  await advanceOrderToReceived(request, adminToken, orderId);
  await verifyReceivedOrder(request, adminToken, orderId);
}
