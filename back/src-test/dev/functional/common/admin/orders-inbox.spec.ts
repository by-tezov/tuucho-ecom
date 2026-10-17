import { test, expect } from '../../../support/fixtures.js';
import { seedAdminWorkbench, seedSuperAdmin } from '../../../support/adminSeed.js';
import {
  AdminPages,
  adminNav,
  adminSurfaceTests,
} from '../../../support/pages/admin.pages.js';
import { clickVisible, fillVisible } from '../../../support/interact.js';
import { setOrderStatus } from '../../../support/ops.js';
import { tid } from '../../../support/selectors.js';

type Page = import('patchright/test').Page;

async function signInAdmin(
  page: Page,
  request: import('patchright/test').APIRequestContext,
) {
  const admin = await seedSuperAdmin(request);
  const seed = await seedAdminWorkbench(request);
  const adminUi = new AdminPages(page);
  await adminUi.signInFromShop(admin.email, admin.password);
  return { seed, adminUi };
}

async function expectOrdersBrowseChrome(page: Page): Promise<void> {
  const mobileSelector = page.getByRole('button', { name: /statut\s*:/i });
  const desktopNav = page.getByRole('navigation', { name: /^statut$/i });
  await expect(mobileSelector.or(desktopNav).first()).toBeVisible({ timeout: 15_000 });
}

async function selectOrderStatus(
  page: Page,
  adminUi: AdminPages,
  orderNumber: string,
  label: RegExp,
): Promise<void> {
  await adminUi.closeOpenDialog();
  const orderHeading = page.getByRole('heading', { name: orderNumber, exact: true });
  if (await orderHeading.isVisible().catch(() => false)) {
    const back = page
      .getByRole('button', {
        name: /confirmée|en préparation|prête à être envoyée|envoyée|disponible|reçue|annulée|à vérifier|retour/i,
      })
      .first();
    await clickVisible(back);
    await expectOrdersBrowseChrome(page);
  }
  await expectOrdersBrowseChrome(page);
  const mobileSelector = page.getByRole('button', { name: /statut\s*:/i });
  const desktopNav = page.getByRole('navigation', { name: /^statut$/i });
  if (await mobileSelector.isVisible().catch(() => false)) {
    const current = (await mobileSelector.getAttribute('aria-label')) ?? '';
    if (label.test(current)) return;
    await clickVisible(mobileSelector);
    const sheet = page.getByRole('dialog').filter({ visible: true }).last();
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await clickVisible(sheet.getByRole('button', { name: label }));
    return;
  }
  const desktop = desktopNav.getByRole('button', { name: label });
  await expect(desktop.first()).toBeVisible({ timeout: 15_000 });
  if ((await desktop.first().getAttribute('aria-pressed')) === 'true') return;
  await clickVisible(desktop.first());
}

async function openOrderUnderFilter(
  page: Page,
  adminUi: AdminPages,
  orderNumber: string,
  filterName: RegExp,
): Promise<void> {
  await adminUi.closeOpenDialog();
  await adminUi.openSection(adminNav.orders);
  await adminUi.expectHeading(adminNav.orders);
  await selectOrderStatus(page, adminUi, orderNumber, filterName);
  const orderCard = page
    .getByRole('list', { name: /commandes/i })
    .getByRole('button')
    .filter({ hasText: orderNumber });
  await expect(orderCard.first()).toBeVisible({ timeout: 15_000 });
  await clickVisible(orderCard.first());
  await expect(page.getByRole('heading', { name: orderNumber, exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

async function expectRequestsBrowseChrome(page: Page): Promise<void> {
  const mobileSelector = page.getByRole('button', { name: /statut\s*:/i });
  const desktopNav = page.getByRole('navigation', { name: /^statut$/i });
  await expect(mobileSelector.or(desktopNav).first()).toBeVisible({ timeout: 15_000 });
}

async function selectRequestStatus(page: Page, adminUi: AdminPages, label: RegExp): Promise<void> {
  await adminUi.closeOpenDialog();
  const mobileSelector = page.getByRole('button', { name: /statut\s*:/i });
  const desktopNav = page.getByRole('navigation', { name: /^statut$/i });
  if (!(await mobileSelector.or(desktopNav).first().isVisible().catch(() => false))) {
    const back = page.getByRole('button', { name: /demandées|acceptées|refusées/i }).first();
    if (await back.isVisible().catch(() => false)) {
      await clickVisible(back);
      await expectRequestsBrowseChrome(page);
    }
  }
  await expectRequestsBrowseChrome(page);
  if (await mobileSelector.isVisible().catch(() => false)) {
    const current = (await mobileSelector.getAttribute('aria-label')) ?? '';
    if (label.test(current)) return;
    await clickVisible(mobileSelector);
    const sheet = page.getByRole('dialog').filter({ visible: true }).last();
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await clickVisible(sheet.getByRole('button', { name: label }));
    return;
  }
  const desktop = desktopNav.getByRole('button', { name: label });
  await expect(desktop.first()).toBeVisible({ timeout: 15_000 });
  if ((await desktop.first().getAttribute('aria-pressed')) === 'true') return;
  await clickVisible(desktop.first());
}

test.describe('Functional admin orders and inbox', () => {
  adminSurfaceTests(test, expect, 'order mark en préparation', async (page, request) => {
    const { seed, adminUi } = await signInAdmin(page, request);
    const orderNumber = seed.customer.orderNumber;
    await openOrderUnderFilter(page, adminUi, orderNumber, /^confirmée/i);
    await clickVisible(page.getByRole('button', { name: /passer en préparation/i }));
    await clickVisible(page.getByTestId(tid.confirm.confirm));
    await expect(page.getByText(`${orderNumber} : En préparation`)).toBeVisible({
      timeout: 15_000,
    });
  });

  adminSurfaceTests(test, expect, 'order mark prête à envoyer', async (page, request) => {
    const { seed, adminUi } = await signInAdmin(page, request);
    const orderNumber = seed.customer.orderNumber;
    await setOrderStatus(orderNumber, 'in_preparation');
    await openOrderUnderFilter(page, adminUi, orderNumber, /en préparation/i);
    await clickVisible(page.getByRole('button', { name: /passer à envoyer/i }));
    const skipLabel = page.getByRole('switch', { name: /passer sans générer l.étiquette/i });
    if (await skipLabel.isVisible().catch(() => false)) {
      if ((await skipLabel.getAttribute('aria-checked')) !== 'true') await clickVisible(skipLabel);
    }
    await clickVisible(page.getByTestId(tid.confirm.confirm));
    await expect(page.getByText(`${orderNumber} : Prête à être envoyée`)).toBeVisible({
      timeout: 15_000,
    });
  });

  adminSurfaceTests(test, expect, 'order mark envoyée', async (page, request) => {
    const { seed, adminUi } = await signInAdmin(page, request);
    const orderNumber = seed.customer.orderNumber;
    await setOrderStatus(orderNumber, 'in_preparation');
    await setOrderStatus(orderNumber, 'to_send', ['--skip-shipment-label']);
    await openOrderUnderFilter(page, adminUi, orderNumber, /prête à être envoyée/i);
    await clickVisible(page.getByRole('button', { name: /marquer envoyée/i }));
    await clickVisible(page.getByTestId(tid.confirm.confirm));
    await expect(page.getByText(`${orderNumber} : Envoyée`)).toBeVisible({ timeout: 15_000 });
  });

  adminSurfaceTests(test, expect, 'product request accept', async (page, request) => {
    const { seed, adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.requests);
    await adminUi.expectHeading(/demandes produit/i);
    await selectRequestStatus(page, adminUi, /^demandées/i);

    const requestRow = page
      .getByRole('list', { name: /demandes produit/i })
      .getByRole('button')
      .filter({ hasText: seed.customer.email });
    await expect(requestRow.first()).toBeVisible({ timeout: 15_000 });
    await clickVisible(requestRow.first());
    await expect(page.getByRole('dialog', { name: /^chargement/i })).toHaveCount(0, {
      timeout: 15_000,
    });
    const accept = page.getByRole('button', { name: /accepter et envoyer/i });
    await expect(accept).toBeVisible({ timeout: 15_000 });
    const priceField = page.getByRole('spinbutton', { name: /prix proposé/i });
    if (await priceField.isVisible().catch(() => false)) {
      const current = await priceField.inputValue();
      if (!current.trim()) await fillVisible(priceField, '12');
    }
    await fillVisible(page.getByRole('textbox', { name: /^message$/i }), 'Taille en fabrication.');
    await clickVisible(accept);
    await expect(page.getByRole('dialog', { name: /^chargement/i })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect
      .poll(
        async () => {
          await adminUi.closeOpenDialog();
          const mobile = page.getByRole('button', { name: /statut\s*:/i });
          const desktop = page.getByRole('navigation', { name: /^statut$/i });
          if (await mobile.or(desktop).first().isVisible().catch(() => false)) return true;
          const back = page.getByRole('button', { name: /demandées|acceptées|refusées/i }).first();
          if (await back.isVisible().catch(() => false)) {
            await clickVisible(back);
            return false;
          }
          await adminUi.openSection(adminNav.requests);
          return false;
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await selectRequestStatus(page, adminUi, /^acceptées/i);
    await expect(
      page
        .getByRole('list', { name: /demandes produit/i })
        .getByRole('button')
        .filter({ hasText: seed.customer.email })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  adminSurfaceTests(test, expect, 'chat reply', async (page, request) => {
    const { seed, adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.contact);
    await adminUi.expectHeading(/conversation|contact/i);
    const chatRow = page.getByRole('button').filter({ hasText: seed.customer.email }).first();
    await expect(chatRow).toBeVisible({ timeout: 15_000 });
    await clickVisible(chatRow);
    const composer = page.getByRole('textbox').or(page.locator('textarea')).last();
    await fillVisible(composer, 'Réponse admin fonctionnelle.');
    await clickVisible(page.getByRole('button', { name: /envoyer/i }).last());
    await expect(page.getByText('Réponse admin fonctionnelle.')).toBeVisible({ timeout: 15_000 });
  });

  adminSurfaceTests(test, expect, 'guest contact mark answered', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.contact);
    await adminUi.expectHeading(/conversation|contact/i);
    await clickVisible(page.getByRole('button', { name: /^invités/i }));
    await expect(page.getByRole('heading', { name: /contact/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    const guestRow = page.getByRole('button').filter({ hasText: 'Guest Admin Test' }).first();
    await expect(guestRow).toBeVisible({ timeout: 15_000 });
    await clickVisible(guestRow);
    await clickVisible(page.getByRole('button', { name: /marquer comme répondu/i }));
    await expect(page.getByText(/répondu|answered/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
