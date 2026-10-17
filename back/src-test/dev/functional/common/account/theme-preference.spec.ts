import { expect, type Page } from 'patchright/test';
import { test } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { clickVisible } from '../../../support/interact.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { tid } from '../../../support/selectors.js';

type Surface = 'web' | 'mobile';

async function openAuthenticatedAccount(page: Page, surface: Surface): Promise<void> {
  const auth = new AuthPages(page);
  const email = uniqueEmail(`${surface}-theme`);
  await page.emulateMedia({ colorScheme: 'light' });

  if (surface === 'web') {
    await page.setViewportSize({ width: 1280, height: 900 });
    await auth.registerFromDesktopAccountModal(email, testPassword);
    await auth.openDesktopAccount();
    return;
  }

  await page.setViewportSize({ width: 390, height: 633 });
  await auth.registerFromMobileOrders(email, testPassword);
  await auth.openMobileAccount();
}

async function expectTheme(page: Page, preference: 'light' | 'dark' | 'system', resolved: 'light' | 'dark') {
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme-preference', preference);
  await expect(root).toHaveAttribute('data-theme', resolved);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('psn-theme-preference-v1')))
    .toBe(preference);
}

async function appearanceGroup(page: Page) {
  const appearance = page
    .getByRole('region', { name: 'Mon profil', exact: true })
    .getByRole('group', { name: 'Apparence' });
  await expect(appearance).toBeVisible({ timeout: 15_000 });
  return appearance;
}

async function selectAppearance(page: Page, surface: Surface, mode: 'dark' | 'light' | 'system'): Promise<void> {
  await openAuthenticatedAccount(page, surface);
  const appearance = await appearanceGroup(page);
  const buttonName = mode === 'dark' ? 'Sombre' : mode === 'light' ? 'Clair' : 'Système';
  const button = appearance.getByRole('button', { name: buttonName });
  if (mode === 'system') await page.emulateMedia({ colorScheme: 'dark' });
  await clickVisible(button);
  await expectTheme(page, mode, mode === 'light' ? 'light' : 'dark');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  if (mode === 'system') {
    await page.emulateMedia({ colorScheme: 'light' });
    await expectTheme(page, 'system', 'light');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.getByTestId(tid.account.profileForm)).toBeVisible();
}

test.describe('Theme preference switch', () => {
  for (const surface of ['web', 'mobile'] as const) {
    test(`${surface} account appearance: dark can be selected`, async ({ page }) => {
      await selectAppearance(page, surface, 'dark');
    });
    test(`${surface} account appearance: light can be selected`, async ({ page }) => {
      await selectAppearance(page, surface, 'light');
    });
    test(`${surface} account appearance: system follows the live OS theme`, async ({ page }) => {
      await selectAppearance(page, surface, 'system');
    });
  }
});
