import type { Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { AuthPages } from './auth.pages.js';
import { tid } from '../selectors.js';
import {
  clickVisible,
  desktopLoginButton,
  fillVisible,
  startCustomerJourneyAtRoot,
} from '../interact.js';
import { MAX_ACTION_TIMEOUT_MS } from '../timeouts.js';

/** French labels for admin navigation (suite locale is fr). */
export const adminNav = {
  home: 'Accueil',
  orders: 'Commandes',
  requests: 'Demandes produit',
  requestsTab: 'Demandes',
  contact: 'Contact',
  users: 'Utilisateurs',
  reviews: 'Avis clientes',
  libraryStock: 'Stock de la library',
  accessoryStock: 'Stock des accessoires',
  userLibraryStock: 'Stock de la user library',
  nailAvailability: 'Disponibilité ongles',
  cartRules: 'Règles panier',
  vouchers: 'Vouchers',
  loyalty: 'Fidélité / cagnotte',
  gift: 'Cadeaux',
  preferences: 'Préférences',
  roles: 'Rôles',
  impersonate: 'Usurper un compte',
  activity: 'Admin',
  crons: 'Crons',
  apiLog: 'API',
  more: 'Plus',
  exit: /quitter l.administration/i,
  pageTitle: 'Administration',
} as const;

/** Sections reachable from the sidebar / Plus sheet (not Accueil, not reviews). */
export const ADMIN_SECTIONS_EXCEPT_REVIEWS = [
  adminNav.orders,
  adminNav.requests,
  adminNav.contact,
  adminNav.users,
  adminNav.libraryStock,
  adminNav.accessoryStock,
  adminNav.userLibraryStock,
  adminNav.nailAvailability,
  adminNav.cartRules,
  adminNav.vouchers,
  adminNav.loyalty,
  adminNav.gift,
  adminNav.preferences,
  adminNav.roles,
  adminNav.impersonate,
  adminNav.activity,
  adminNav.crons,
  adminNav.apiLog,
] as const;

function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1_280) < 768;
}

/** Page object for the administration shell and section navigation. */
export class AdminPages {
  constructor(private readonly page: Page) {}

  shell(): ReturnType<Page['locator']> {
    return this.page.locator('.shell, [class*="shell"]').first();
  }

  sidebar(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('complementary').or(this.page.locator('aside')).first();
  }

  bottomNav(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('navigation', { name: adminNav.pageTitle }).last();
  }

  /** Wait until the admin dashboard (or any admin shell) is ready. */
  async expectDashboard(): Promise<void> {
    await expect(this.page).toHaveURL(/\/admin\/?$/, { timeout: MAX_ACTION_TIMEOUT_MS });
    await this.waitForAdminReady();
  }

  /** Access + strings loading modals sit above the shell; wait them out. */
  async waitForAdminReady(): Promise<void> {
    const loading = this.page.getByRole('dialog', { name: /^chargement/i });
    await expect(loading).toHaveCount(0, { timeout: MAX_ACTION_TIMEOUT_MS });
    if (isMobile(this.page)) {
      await expect(this.bottomNav()).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
      return;
    }
    await expect(this.page.getByRole('link', { name: adminNav.home }).first()).toBeVisible({
      timeout: MAX_ACTION_TIMEOUT_MS,
    });
  }

  /** Sign in from the shop as staff and land on the admin dashboard.
   * Customer login helpers wait for shop chrome; staff is redirected to
   * `/admin`. When that redirect races (mobile Orders → /login), fall back
   * to the visible Administration link a staff shopper would use. */
  async signInFromShop(email: string, password: string): Promise<void> {
    const auth = new AuthPages(this.page);
    await startCustomerJourneyAtRoot(this.page);
    if (isMobile(this.page)) {
      await auth.openMobileLoginFromOrders();
    } else {
      await clickVisible(desktopLoginButton(this.page));
      await auth.useEmailInstead();
    }
    await fillVisible(this.page.getByTestId(tid.auth.email), email);
    await fillVisible(this.page.getByTestId(tid.auth.password), password);
    await clickVisible(this.page.getByTestId(tid.auth.submit));
    await expect(this.page.getByTestId(tid.auth.loginForm)).toBeHidden({
      timeout: MAX_ACTION_TIMEOUT_MS,
    });
    await this.reachDashboardAfterStaffLogin();
  }

  /** Wait for `/admin`, or open Administration from the shop chrome. */
  async reachDashboardAfterStaffLogin(): Promise<void> {
    const adminUrl = /\/admin\/?$/;
    let openedFromShop = false;
    await expect
      .poll(
        async () => {
          if (adminUrl.test(this.page.url())) return true;
          if (!openedFromShop) {
            const adminLink = this.page.getByRole('link', { name: adminNav.pageTitle }).first();
            if (await adminLink.isVisible().catch(() => false)) {
              openedFromShop = true;
              await this.openAdministrationFromShop();
            }
          }
          return adminUrl.test(this.page.url());
        },
        { timeout: MAX_ACTION_TIMEOUT_MS },
      )
      .toBe(true);
    await this.waitForAdminReady();
  }

  /** Shop-side Administration entry (header slot; never inside the burger). */
  async openAdministrationFromShop(): Promise<void> {
    const adminEntry = this.page.getByRole('link', { name: /^administration$/i }).first();
    await expect(adminEntry).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
    await clickVisible(adminEntry);
  }

  /** Open a section by its French label. Desktop uses the sidebar; mobile
   * uses the bottom tabs for Orders / Demandes / Contact, else the Plus sheet. */
  async openSection(label: string): Promise<void> {
    await this.closeOpenDialog();
    await this.waitForAdminReady();
    if (!isMobile(this.page)) {
      const aside = this.page.getByRole('complementary').or(this.page.locator('aside')).first();
      const link = aside.getByRole('link', { name: new RegExp(`^${escapeRegExp(label)}$`) });
      // Fixed overflow sidebar: Patchright scrollIntoViewIfNeeded often cannot
      // bring a lower nav link into the viewport — wheel the aside first.
      const viewportH = this.page.viewportSize()?.height ?? 900;
      for (let i = 0; i < 16; i++) {
        const box = await link.boundingBox();
        if (box && box.y >= 8 && box.y + box.height <= viewportH - 8) break;
        await aside.hover({ force: true, timeout: 5_000 }).catch(() => undefined);
        await this.page.mouse.wheel(0, 240);
      }
      await clickVisible(link);
      return;
    }

    const bottom = this.bottomNav();
    if (label === adminNav.orders) {
      await clickVisible(bottom.getByRole('link', { name: adminNav.orders }));
      return;
    }
    if (label === adminNav.requests || label === adminNav.requestsTab) {
      await clickVisible(bottom.getByRole('link', { name: adminNav.requestsTab }));
      return;
    }
    if (label === adminNav.contact) {
      await clickVisible(bottom.getByRole('link', { name: adminNav.contact }));
      return;
    }

    await clickVisible(bottom.getByRole('button', { name: adminNav.more }));
    const sheet = this.page.getByRole('dialog').filter({ visible: true }).last();
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await clickVisible(sheet.getByRole('link', { name: new RegExp(escapeRegExp(label)) }));
  }

  async expectSectionVisible(label: string): Promise<void> {
    if (isMobile(this.page)) {
      if (label === adminNav.orders || label === adminNav.contact) {
        await expect(this.bottomNav().getByRole('link', { name: label })).toBeVisible();
        return;
      }
      if (label === adminNav.requests) {
        await expect(this.bottomNav().getByRole('link', { name: adminNav.requestsTab })).toBeVisible();
        return;
      }
      await clickVisible(this.bottomNav().getByRole('button', { name: adminNav.more }));
      const sheet = this.page.getByRole('dialog').last();
      await expect(sheet.getByRole('link', { name: new RegExp(escapeRegExp(label)) })).toBeVisible({
        timeout: 10_000,
      });
      await this.page.keyboard.press('Escape');
      return;
    }
    await expect(
      this.page.locator('aside').getByRole('link', { name: new RegExp(`^${escapeRegExp(label)}$`) }),
    ).toBeVisible();
  }

  async expectSectionHidden(label: string): Promise<void> {
    if (isMobile(this.page)) {
      if (label === adminNav.orders || label === adminNav.contact) {
        await expect(this.bottomNav().getByRole('link', { name: label })).toHaveCount(0);
        return;
      }
      if (label === adminNav.requests) {
        await expect(this.bottomNav().getByRole('link', { name: adminNav.requestsTab })).toHaveCount(0);
        return;
      }
      await clickVisible(this.bottomNav().getByRole('button', { name: adminNav.more }));
      const sheet = this.page.getByRole('dialog').last();
      await expect(sheet.getByRole('link', { name: new RegExp(escapeRegExp(label)) })).toHaveCount(0);
      // Close sheet: escape or close control.
      await this.page.keyboard.press('Escape');
      return;
    }
    await expect(
      this.page.locator('aside').getByRole('link', { name: new RegExp(`^${escapeRegExp(label)}$`) }),
    ).toHaveCount(0);
  }

  /** Dismiss an open admin detail dialog / sheet so the shell is clickable. */
  async closeOpenDialog(): Promise<void> {
    const dialog = this.page.getByRole('dialog').filter({ visible: true }).last();
    if ((await dialog.count()) === 0) return;
    const close = dialog.getByRole('button', { name: /fermer|close/i }).first();
    if (await close.isVisible().catch(() => false)) {
      await clickVisible(close);
    } else {
      await this.page.keyboard.press('Escape');
    }
    await expect(dialog).toBeHidden({ timeout: 15_000 });
  }

  async exitToShop(): Promise<void> {
    await this.closeOpenDialog();
    await clickVisible(this.page.getByRole('link', { name: adminNav.exit }));
    await expect(this.page).not.toHaveURL(/\/admin/, { timeout: MAX_ACTION_TIMEOUT_MS });
  }

  /** Type a forbidden admin URL and expect the layout to bounce home. */
  async expectForbiddenUrlRedirectsHome(path: string): Promise<void> {
    await this.page.goto(path);
    await this.expectDashboard();
  }

  heading(text: string | RegExp): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { name: text });
  }

  async expectHeading(text: string | RegExp): Promise<void> {
    await expect(this.heading(text).first()).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
  }

  async fillAndSubmitLoginOnPage(email: string, password: string): Promise<void> {
    const auth = new AuthPages(this.page);
    await auth.useEmailInstead();
    await fillVisible(this.page.getByTestId('auth-email'), email);
    await fillVisible(this.page.getByTestId('auth-password'), password);
    await clickVisible(this.page.getByTestId('auth-submit'));
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function adminSurfaceFromTitle(title: string): 'web' | 'mobile' {
  return /\bmobile\b/i.test(title) ? 'mobile' : 'web';
}

type AdminSurfaceRun = (
  page: Page,
  request: import('patchright/test').APIRequestContext,
) => Promise<void>;

/** Registers the same admin scenario once for desktop and once for mobile.
 * Titles stay `web admin: …` / `mobile admin: …` so indexes stay viewport-strict. */
export function adminSurfaceTests(
  testFn: typeof import('patchright/test').test,
  expectFn: typeof import('patchright/test').expect,
  title: string,
  run: AdminSurfaceRun,
): void {
  testFn(`web admin: ${title}`, async ({ page, request }, testInfo) => {
    expectFn(adminSurfaceFromTitle(testInfo.title)).toBe('web');
    await run(page, request);
  });
  testFn(`mobile admin: ${title}`, async ({ page, request }, testInfo) => {
    expectFn(adminSurfaceFromTitle(testInfo.title)).toBe('mobile');
    await page.setViewportSize({ width: 390, height: 844 });
    await run(page, request);
  });
}
