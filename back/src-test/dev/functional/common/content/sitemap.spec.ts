// Shared desktop and mobile coverage: /sitemap must not dead-end an
// anonymous visitor on RequireAuth's account/orders pages.
import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { shopNavigatePath } from '../../../support/shopPath.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { tid } from '../../../support/selectors.js';

test.describe('Functional sitemap auth gating', () => {
  test('anonymous visitor: sees no Mon compte / Commandes en cours links', async ({ page }) => {
    const res = await page.goto(shopNavigatePath('/sitemap'));
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator('#sitemap-h')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Mon compte', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Commandes en cours', exact: true })).toHaveCount(0);
  });

  test('signed-in visitor: sees Mon compte links that actually open the account', async ({ page }) => {
    const auth = new AuthPages(page);
    await auth.registerFromDesktopAccountModal(uniqueEmail('ui-sitemap'), testPassword);
    await page.goto(shopNavigatePath('/sitemap'));
    const accountLink = page.getByRole('link', { name: 'Mon compte', exact: true });
    await expect(accountLink).toBeVisible({ timeout: 15_000 });
    await accountLink.click();
    await expect(page.getByTestId(tid.account.profileForm)).toBeVisible({ timeout: 15_000 });
  });
});
