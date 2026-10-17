import { test, expect } from '../../../support/fixtures.js';
import { seedAdminWorkbench, seedSuperAdmin } from '../../../support/adminSeed.js';
import {
  AdminPages,
  adminNav,
  adminSurfaceTests,
} from '../../../support/pages/admin.pages.js';
import { clickVisible, fillVisible } from '../../../support/interact.js';

async function signInAdmin(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
) {
  const admin = await seedSuperAdmin(request);
  const seed = await seedAdminWorkbench(request);
  const adminUi = new AdminPages(page);
  await adminUi.signInFromShop(admin.email, admin.password);
  return { seed, adminUi };
}

test.describe('Functional admin settings and journals', () => {
  adminSurfaceTests(test, expect, 'preferences tabs open', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.preferences);
    await adminUi.expectHeading(adminNav.preferences);
    for (const tab of [/boutique/i, /livraison/i, /notifications/i, /technique/i]) {
      const tabBtn = page.getByRole('tab', { name: tab }).or(page.getByRole('button', { name: tab }));
      await clickVisible(tabBtn.first());
    }
    await clickVisible(
      page
        .getByRole('tab', { name: /livraison/i })
        .or(page.getByRole('button', { name: /livraison/i }))
        .first(),
    );
    await expect(page.getByText(/pays|transporteur|livraison/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  adminSurfaceTests(test, expect, 'activity journal opens', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.activity);
    await adminUi.expectHeading(/admin|journal/i);
    await expect(page.getByRole('button', { name: /effacer/i })).toBeVisible({ timeout: 15_000 });
  });

  adminSurfaceTests(test, expect, 'crons journal opens', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.crons);
    await adminUi.expectHeading(/^crons$/i);
    await expect(page.getByRole('list').filter({ hasText: /journal/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  adminSurfaceTests(test, expect, 'api log opens', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.apiLog);
    await adminUi.expectHeading(/^api$/i);
  });

  adminSurfaceTests(test, expect, 'impersonate unknown email shows an error', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.impersonate);
    await adminUi.expectHeading(/usurper/i);
    await fillVisible(page.getByLabel(/adresse email/i), 'nobody-missing@example.test');
    await clickVisible(page.getByRole('button', { name: /ouvrir le compte/i }));
    await expect(page.getByText(/aucun compte|adresse email valide/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  adminSurfaceTests(test, expect, 'impersonate customer then return to admin', async (page, request) => {
    const { seed, adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.impersonate);
    await adminUi.expectHeading(/usurper/i);
    await fillVisible(page.getByLabel(/adresse email/i), seed.customer.email);
    // The customer session opens in another tab. This admin page stays.
    const [customer] = await Promise.all([
      page.waitForEvent('popup', { timeout: 15_000 }),
      clickVisible(page.getByRole('button', { name: /ouvrir le compte/i })),
    ]);
    await expect(customer).toHaveURL(/\/account/, { timeout: 15_000 });
    await expect(customer.getByRole('heading', { name: /mon profil/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(customer.getByText(seed.customer.email).first()).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/impersonate/);
    await expect(page.getByRole('heading', { name: /usurper/i })).toBeVisible();

    await clickVisible(page.getByRole('link', { name: /retour à l.accueil/i }).first());
    await adminUi.expectDashboard();
    await customer.close();
  });
});
