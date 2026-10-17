import { test, expect } from '../../../support/fixtures.js';
import { seedAdminWorkbench, seedSuperAdmin } from '../../../support/adminSeed.js';
import {
  AdminPages,
  adminNav,
  adminSurfaceTests,
} from '../../../support/pages/admin.pages.js';
import { clickVisible, fillVisible } from '../../../support/interact.js';
import { tid } from '../../../support/selectors.js';

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

async function bumpFirstStockQty(page: import('patchright/test').Page): Promise<void> {
  const row = page
    .getByRole('button')
    .filter({ has: page.locator('strong') })
    .filter({ hasText: /€/ })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await clickVisible(row);
  const dialog = page.getByRole('dialog').filter({ visible: true }).last();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const plus = dialog
    .getByRole('button', { name: /xs plus un/i })
    .or(dialog.getByRole('button', { name: /quantité plus un/i }))
    .first();
  const minus = dialog
    .getByRole('button', { name: /xs moins un/i })
    .or(dialog.getByRole('button', { name: /quantité moins un/i }))
    .first();
  await expect(plus).toBeVisible({ timeout: 15_000 });
  await clickVisible(plus);
  await clickVisible(page.getByRole('button', { name: /^enregistrer/i }));
  await expect(page.getByText(/enregistr/i).first()).toBeVisible({ timeout: 15_000 });
  await clickVisible(row);
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await clickVisible(minus);
  await clickVisible(page.getByRole('button', { name: /^enregistrer/i }));
}

async function openCustomerDetail(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
) {
  const { seed, adminUi } = await signInAdmin(page, request);
  await adminUi.openSection(adminNav.users);
  await adminUi.expectHeading(adminNav.users);
  await fillVisible(page.getByLabel(/e-mail utilisateur/i), seed.customer.email);
  await clickVisible(page.getByRole('button', { name: /rechercher/i }));
  const customerRow = page.getByRole('button', { name: seed.customer.email });
  await expect(customerRow).toBeVisible({ timeout: 15_000 });
  await clickVisible(customerRow);
  const detail = page.getByRole('dialog', { name: seed.customer.email });
  await expect(detail).toBeVisible({ timeout: 15_000 });
  return { seed, detail };
}

async function lockCustomer(
  page: import('patchright/test').Page,
  detail: import('patchright/test').Locator,
) {
  const lockSwitch = detail.getByRole('switch', { name: /^bloquer$/i });
  await expect(lockSwitch).toBeVisible({ timeout: 15_000 });
  await clickVisible(lockSwitch);
  const lockModal = page.getByRole('dialog', { name: /bloquer/i });
  await expect(lockModal).toBeVisible({ timeout: 15_000 });
  await fillVisible(
    lockModal.getByRole('textbox', { name: /^motif$/i }),
    'Blocage test admin fonctionnel',
  );
  await clickVisible(lockModal.getByRole('button', { name: /bloquer le compte/i }));
}

async function toggleNailSize(page: import('patchright/test').Page): Promise<void> {
  const row = page
    .getByRole('button')
    .filter({ has: page.locator('strong') })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await clickVisible(row);
  const dialog = page.getByRole('dialog').filter({ visible: true }).last();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const sizeToggle = dialog.getByRole('button', { name: /\bXS$/i }).first();
  await expect(sizeToggle).toBeVisible({ timeout: 15_000 });
  const before = await sizeToggle.getAttribute('aria-pressed');
  await clickVisible(sizeToggle);
  await clickVisible(page.getByRole('button', { name: /^enregistrer/i }));
  await expect(page.getByText(/enregistr/i).first()).toBeVisible({ timeout: 15_000 });
  await clickVisible(row);
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  if ((await sizeToggle.getAttribute('aria-pressed')) !== before) {
    await clickVisible(sizeToggle);
    await clickVisible(page.getByRole('button', { name: /^enregistrer/i }));
  }
}

test.describe('Functional admin stock and users', () => {
  adminSurfaceTests(test, expect, 'library stock edit restore', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.libraryStock);
    await adminUi.expectHeading(adminNav.libraryStock);
    await bumpFirstStockQty(page);
  });

  adminSurfaceTests(test, expect, 'accessory stock edit restore', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.accessoryStock);
    await adminUi.expectHeading(adminNav.accessoryStock);
    await bumpFirstStockQty(page);
  });

  adminSurfaceTests(test, expect, 'user-library stock edit restore', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.userLibraryStock);
    await adminUi.expectHeading(adminNav.userLibraryStock);
    await bumpFirstStockQty(page);
  });

  adminSurfaceTests(test, expect, 'nail availability toggle restore', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.nailAvailability);
    await adminUi.expectHeading(adminNav.nailAvailability);
    await toggleNailSize(page);
  });

  adminSurfaceTests(test, expect, 'client search opens user detail', async (page, request) => {
    const { detail } = await openCustomerDetail(page, request);
    await expect(detail).toBeVisible({ timeout: 15_000 });
  });

  adminSurfaceTests(test, expect, 'user detail hides the roles editor', async (page, request) => {
    const { detail } = await openCustomerDetail(page, request);
    await expect(detail.getByRole('button', { name: /^rôles\s*:/i })).toHaveCount(0);
  });

  adminSurfaceTests(test, expect, 'client activity shows the seeded order', async (page, request) => {
    const { seed } = await openCustomerDetail(page, request);
    const activity = page
      .getByRole('button', { name: /commandes|activité|voir les commandes/i })
      .first();
    await expect(activity).toBeVisible({ timeout: 15_000 });
    await clickVisible(activity);
    await expect(page.getByText(seed.customer.orderNumber)).toBeVisible({ timeout: 15_000 });
  });

  adminSurfaceTests(test, expect, 'client lock marks bloqué', async (page, request) => {
    const { detail } = await openCustomerDetail(page, request);
    await lockCustomer(page, detail);
    await expect(detail.getByText(/^bloqué$/i).first()).toBeVisible({ timeout: 15_000 });
  });

  adminSurfaceTests(test, expect, 'client unlock marks actif', async (page, request) => {
    const { detail } = await openCustomerDetail(page, request);
    await lockCustomer(page, detail);
    const unlockSwitch = detail.getByRole('switch', { name: /^débloquer$/i });
    await clickVisible(unlockSwitch);
    const confirm = page.getByTestId(tid.confirm.confirm);
    if (await confirm.isVisible().catch(() => false)) await clickVisible(confirm);
    await expect(detail.getByText(/^actif$/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
