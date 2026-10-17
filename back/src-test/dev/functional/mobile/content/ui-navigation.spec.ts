import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { findOpenChatSessionFor, replyToChatViaCli } from '../../../support/ops.js';
import { tid } from '../../../support/selectors.js';
import { checkVisible, clickVisible, fillVisible, reveal } from '../../../support/interact.js';
import { shopNavigatePath, shopPath } from '../../../support/shopPath.js';

const MOBILE = { width: 390, height: 633 };

const ACCOUNT_GROUP_TABS: Array<{ navKey: string; path: string; destination: string }> = [
  { navKey: 'account-profile', path: '/account', destination: tid.account.profileForm },
  { navKey: 'account-addresses', path: '/account/addresses', destination: tid.account.addressesPage },
  { navKey: 'account-payment', path: '/account/payment-methods', destination: tid.account.paymentPage },
  { navKey: 'account-notifications', path: '/account/notifications', destination: 'notifications-h' },
];

const MENU_ITEMS: Array<{ key: string; path: string | RegExp; destination: string }> = [
  { key: 'home', path: '/home', destination: 'hero-h' },
  { key: 'gallery', path: '/gallery', destination: tid.gallery.page },
  { key: 'gallery-nail', path: '/gallery-nail', destination: tid.compose.page },
  { key: 'guide-shapes', path: '/capsules', destination: 'page-h' },
  { key: 'guide-sizes', path: '/sizes', destination: 'guide-h' },
  { key: 'guide-application', path: '/pose', destination: 'page-h' },
  { key: 'contact', path: '/contact', destination: tid.contact.form },
  { key: 'about', path: '/about', destination: 'page-h' },
];

const MOBILE_BACK_PAGES: Array<{ path: string; hasBottom: boolean }> = [
  { path: '/home', hasBottom: true },
  { path: '/capsules', hasBottom: true },
  { path: '/sizes', hasBottom: true },
  { path: '/pose', hasBottom: true },
  { path: '/contact', hasBottom: true },
  { path: '/about', hasBottom: true },
  { path: '/legal', hasBottom: true },
  { path: '/privacy', hasBottom: true },
  { path: '/terms', hasBottom: true },
  { path: '/sales-terms', hasBottom: true },
  { path: '/sitemap', hasBottom: true },
  { path: '/auth/facebook-data-deletion', hasBottom: false },
];

const MOBILE_BACK_INTRO_PATHS = new Set(['/home', '/capsules', '/sizes', '/pose', '/about']);
const MOBILE_BACK_INTRO_PAGES = MOBILE_BACK_PAGES.filter((entry) =>
  MOBILE_BACK_INTRO_PATHS.has(entry.path),
);
const MOBILE_BACK_STANDARD_PAGES = MOBILE_BACK_PAGES.filter(
  (entry) => !MOBILE_BACK_INTRO_PATHS.has(entry.path),
);
const MOBILE_BACK_ACCOUNT_PAGES = [
  '/account',
  '/account/addresses',
  '/account/payment-methods',
  '/account/loyalty',
  '/account/notifications',
].map((path) => ({ path, hasBottom: true }));

async function openBurger(page: import('patchright/test').Page): Promise<void> {
  const toggle = page.getByTestId(tid.mobileNav.toggle);
  const panel = page.getByTestId(tid.mobileNav.panel);
  // Header closes the sheet in a passive effect after route changes. Give that
  // effect one paint to settle before a subsequent navigation-item opens the
  // burger again; otherwise it can close the just-clicked panel.
  await page.waitForTimeout(50);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if ((await toggle.getAttribute('aria-expanded')) === 'true') {
      await expect(panel).toBeVisible({ timeout: 1_500 });
      return;
    }
    await clickVisible(toggle);
    try {
      // The panel remains mounted while closed, so its CSS visibility is not
      // a reliable open-state signal. The toggle's ARIA state is authoritative
      // and avoids waiting on a click that was swallowed by the route cleanup.
      await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 1_500 });
      await expect(panel).toBeVisible({ timeout: 1_500 });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
      // The route's delayed cleanup can still close the first opening. A
      // real customer taps the visible toggle again; do the same once.
      await page.waitForTimeout(100);
    }
  }
}

function burgerGroupFor(navKey: string): RegExp | null {
  if (navKey.startsWith('guide-')) return /^guides$/i;
  if (navKey === 'contact' || navKey === 'about') return /^infos$/i;
  if (navKey.startsWith('account-')) return /^mon compte$/i;
  if (navKey.startsWith('orders-')) return /^commandes$/i;
  return null;
}

async function checkMobileRetour(
  page: import('patchright/test').Page,
  path: string,
  placement: 'top' | 'bottom',
): Promise<void> {
  await page.goto(shopPath('/gallery'), { waitUntil: 'domcontentloaded' });
  await page.goto(shopNavigatePath(path), { waitUntil: 'domcontentloaded' });
  const link = page.locator(`[data-testid="${tid.legal.back}"][data-placement="${placement}"]`);
  await reveal(link);
  const box = await link.boundingBox();
  if (!box) throw new Error(`${path}: ${placement} Retour has no bounding box`);
  // A real mouse click validates the control's hit area too. In particular,
  // this catches an intro hero painted over the top link on mobile.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(/\/gallery/);
  await expect(page.getByTestId(tid.gallery.page)).toBeVisible();
}

async function clickBurgerItem(page: import('patchright/test').Page, navKey: string): Promise<void> {
  const panel = page.getByTestId(tid.mobileNav.panel);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await openBurger(page);
      const groupName = burgerGroupFor(navKey);
      if (groupName) {
        const group = panel.getByRole('button', { name: groupName });
        if ((await group.getAttribute('aria-expanded')) !== 'true') {
          await clickVisible(group);
          await expect(group).toHaveAttribute('aria-expanded', 'true');
        }
      }
      const item = panel.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="${navKey}"]`);
      await clickVisible(item);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await page.waitForTimeout(100);
    }
  }
  throw lastError;
}

function menuUrl(path: string | RegExp): RegExp {
  return typeof path === 'string' ? new RegExp(`${path.replace(/\//g, '\\/')}$`) : path;
}

const BOTTOM_TABS: Array<{
  title: string;
  testId: string;
  url: RegExp;
  destination: string;
}> = [
  { title: 'Galerie', testId: tid.tabBar.gallery, url: /\/gallery$/, destination: tid.gallery.page },
  { title: 'Composition', testId: tid.tabBar.compose, url: /\/gallery-nail$/, destination: tid.compose.page },
  { title: 'Panier', testId: tid.tabBar.cart, url: /\/cart$/, destination: tid.cart.page },
  { title: 'Commandes', testId: tid.tabBar.orders, url: /\/orders\/history$/, destination: 'orders-history-h' },
];

test.describe('Mobile UI navigation: burger, tabs, and retour', () => {
  for (const item of MENU_ITEMS) {
    test(`mobile menu: ${item.key} opens`, async ({ page }) => {
      await page.setViewportSize(MOBILE);
      // `/` intentionally owns the entry splash; this navigation test is about
      // the menu itself, so start on the already-routable home page instead of
      // making the first menu click wait for the splash gate to release.
      await page.goto(shopPath('/home'));
      await expect(page.getByTestId(tid.mobileNav.toggle)).toBeVisible();
      await clickBurgerItem(page, item.key);
      await expect(page).toHaveURL(menuUrl(item.path));
      await expect(page.getByTestId(item.destination).or(page.locator(`#${item.destination}`))).toBeVisible();
    });
  }

  test('mobile menu: cart is present and Mon compte is hidden when anonymous', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(shopPath('/home'));
    await openBurger(page);
    await expect(page.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="gallery"]`)).toHaveCount(1);
    await expect(page.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="gallery-nail"]`)).toHaveCount(1);
    await expect(page.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="guide-shapes"]`)).toHaveCount(1);
    await expect(page.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="cart"]`)).toHaveCount(1);
    await expect(page.getByTestId(tid.mobileNav.panel).getByText(/mon compte/i)).toHaveCount(0);
  });

  for (const tab of ACCOUNT_GROUP_TABS) {
    test(`mobile burger Mon compte: ${tab.navKey} opens`, async ({ page }) => {
      await page.setViewportSize(MOBILE);
      const auth = new AuthPages(page);
      await auth.register(uniqueEmail(`ui-account-${tab.navKey}`), testPassword);
      await page.goto(shopPath('/account'));
      await expect(page.getByTestId(tid.account.profileForm)).toBeVisible();
      await clickBurgerItem(page, tab.navKey);
      await expect(page).toHaveURL(new RegExp(`${tab.path.replace(/\//g, '\\/')}$`));
      await expect(page.getByTestId(tab.destination).or(page.locator(`#${tab.destination}`))).toBeVisible();
      await openBurger(page);
      await expect(
        page.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="${tab.navKey}"]`),
      ).toHaveAttribute('aria-current', 'page');
    });
  }

  test('mobile burger Mon compte: orders item is hidden', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const auth = new AuthPages(page);
    await auth.register(uniqueEmail('ui-account-orders-hidden'), testPassword);
    await page.goto(shopPath('/account'));
    await expect(page.getByTestId(tid.account.profileForm)).toBeVisible();
    await openBurger(page);
    await expect(page.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="orders"]`)).toHaveCount(0);
  });

  for (const tab of BOTTOM_TABS) {
    test(`mobile bottom tab: ${tab.title} navigates with active state`, async ({ page }) => {
      await page.setViewportSize(MOBILE);
      const auth = new AuthPages(page);
      await auth.register(uniqueEmail(`ui-tab-${tab.title}`), testPassword);
      await page.goto(shopPath('/gallery'));
      const control = page.getByTestId(tab.testId);
      await clickVisible(control);
      await expect(page).toHaveURL(tab.url);
      if (tab.destination === 'orders-history-h') {
        // A newly created account has no active order, so this tab deliberately
        // opens history. Anchor the route: /orders would otherwise also accept
        // /orders/history and hide a wrong destination.
        await expect(page.locator('#orders-history-h')).toHaveText('Historique des commandes');
      } else {
        await expect(page.getByTestId(tab.destination)).toBeVisible();
      }
      await expect(control).toHaveAttribute('aria-current', 'page');
    });
  }

  test('mobile anonymous Commandes tab: opens unified connect and creates an email account', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await clickVisible(page.getByTestId(tid.tabBar.orders));
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId(tid.auth.useEmailInstead)).toBeVisible();
    await clickVisible(page.getByTestId(tid.auth.useEmailInstead));
    await expect(page.getByTestId(tid.auth.loginForm)).toBeVisible();
    await fillVisible(page.getByTestId(tid.auth.email), uniqueEmail('ui-tab-register'));
    await fillVisible(page.getByTestId(tid.auth.password), testPassword);
    await clickVisible(page.getByTestId(tid.auth.submit));
    await expect(page.getByTestId(tid.auth.consent)).toBeVisible({ timeout: 15_000 });
    await checkVisible(page.getByTestId(tid.auth.consent));
    await clickVisible(page.getByTestId(tid.auth.consentSubmit));
    await expect(page.getByTestId(tid.auth.loginForm)).toBeHidden({ timeout: 15_000 });
  });

  for (const target of MOBILE_BACK_INTRO_PAGES) {
    test(`mobile top Retour: works on ${target.path}`, async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await checkMobileRetour(page, target.path, 'top');
    });
    test(`mobile bottom Retour: works on ${target.path}`, async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await checkMobileRetour(page, target.path, 'bottom');
    });
  }

  for (const target of MOBILE_BACK_STANDARD_PAGES) {
    test(`mobile top Retour: works on ${target.path}`, async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await checkMobileRetour(page, target.path, 'top');
    });
    if (target.hasBottom) {
      test(`mobile bottom Retour: works on ${target.path}`, async ({ page }) => {
        await page.setViewportSize(MOBILE);
        await checkMobileRetour(page, target.path, 'bottom');
      });
    }
  }

  for (const placement of ['top', 'bottom'] as const) {
    for (const target of MOBILE_BACK_ACCOUNT_PAGES) {
      test(`mobile account ${placement} Retour: works on ${target.path}`, async ({ page }) => {
        await page.setViewportSize(MOBILE);
        const auth = new AuthPages(page);
        await auth.register(uniqueEmail(`ui-retour-${placement}`), testPassword);
        await checkMobileRetour(page, target.path, placement);
      });
    }
  }

  test('mobile Mondial Relay Retour: returns to addresses', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const auth = new AuthPages(page);
    await auth.registerFromMobileOrders(uniqueEmail('ui-mr-back'), testPassword);
    await page.goto(shopPath('/account/addresses'));
    await clickVisible(page.getByTestId(tid.account.addAddress));
    await clickVisible(page.getByTestId(tid.address.deliveryPickup));
    await expect(page.getByTestId(tid.mondial.page)).toBeVisible({ timeout: 15_000 });
    await clickVisible(page.getByTestId(tid.mondial.back));
    await expect(page).toHaveURL(/\/account\/addresses/);
    await expect(page.getByTestId(tid.account.addressesPage)).toBeVisible();
  });

  test('burger Contact chat: sends a customer message and displays the operator CLI reply', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    const auth = new AuthPages(page);
    const email = uniqueEmail('ui-contact-chat');
    await auth.register(email, testPassword);
    await page.goto(shopPath('/gallery'));
    await clickBurgerItem(page, 'about');
    await expect(page).toHaveURL(/\/about/);
    await expect(page.locator('#page-h')).toHaveText('À propos');
    await clickBurgerItem(page, 'contact');
    await expect(page).toHaveURL(/\/contact/);
    const chat = page.getByTestId('account-contact-chat');
    await expect(chat).toBeVisible();
    const customerMessage = `Bonjour, test chat client ${Date.now()}.`;
    const ownerReply = `Bonjour, réponse opérateur ${Date.now()}.`;
    await fillVisible(chat.getByPlaceholder(/écris ton message/i), customerMessage);
    // The mobile send control intentionally exposes only its paper-plane
    // icon; its stable semantic hook is the submit type, not a translated
    // accessible label that does not exist in the rendered UI.
    await clickVisible(chat.locator('button[type="submit"]'));
    await expect(chat.getByRole('log').getByText(customerMessage, { exact: true })).toHaveCount(1);

    const sessionId = await findOpenChatSessionFor(email);
    await replyToChatViaCli(sessionId, ownerReply);
    await expect(chat.getByRole('log').getByText(ownerReply, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(chat.getByText(/conversation terminée|discussion terminée|lecture seule/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('mobile anonymous Contact: keeps the simple contact form', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(shopPath('/contact'));
    const form = page.getByTestId(tid.contact.form);
    await expect(form).toBeVisible();
    await expect(form.getByTestId(tid.contact.email)).toBeVisible();
    await expect(form.getByTestId(tid.contact.identity)).toBeVisible();
    await expect(form.getByTestId(tid.contact.message)).toBeVisible();
    await expect(page.getByTestId('account-contact-chat')).toHaveCount(0);
  });
});
