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

async function createVoucherViaUi(page: import('patchright/test').Page, adminUi: AdminPages) {
  const stamp = Date.now().toString(36).slice(-6);
  await adminUi.openSection(adminNav.vouchers);
  await adminUi.expectHeading(adminNav.vouchers);
  await clickVisible(page.getByRole('button', { name: /créer un voucher/i }));
  const voucherCode = `ADMV${stamp}`.toUpperCase();
  await fillVisible(page.getByLabel(/^code/i).first(), voucherCode);
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 14);
  await fillVisible(page.getByLabel(/^fin$/i), end.toISOString().slice(0, 10));
  await fillVisible(page.getByRole('spinbutton', { name: /pourcentage \(%\)/i }), '5');
  await clickVisible(page.getByRole('button', { name: /^créer$/i }));
  return voucherCode;
}

async function createCartRuleViaUi(page: import('patchright/test').Page, adminUi: AdminPages) {
  const stamp = Date.now().toString(36).slice(-6);
  await adminUi.openSection(adminNav.cartRules);
  await adminUi.expectHeading(adminNav.cartRules);
  await clickVisible(page.getByRole('button', { name: /créer une règle/i }));
  const ruleCode = `admr${stamp}`;
  await fillVisible(page.getByLabel(/code \(slug/i), ruleCode);
  await page.getByRole('combobox', { name: /type/i }).selectOption({ label: 'Franco de port' });
  await clickVisible(page.getByRole('button', { name: /créer|enregistrer/i }).last());
  return ruleCode;
}

test.describe('Functional admin commerce', () => {
  adminSurfaceTests(test, expect, 'voucher create appears in the list', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    const voucherCode = await createVoucherViaUi(page, adminUi);
    await expect(page.getByText(voucherCode)).toBeVisible({ timeout: 15_000 });
  });

  adminSurfaceTests(test, expect, 'voucher disable marks inactive', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    const voucherCode = await createVoucherViaUi(page, adminUi);
    await expect(page.getByText(voucherCode)).toBeVisible({ timeout: 15_000 });
    await clickVisible(page.getByRole('button', { name: new RegExp(voucherCode, 'i') }).first());
    const voucherToggle = page.getByRole('switch', {
      name: new RegExp(`activer ${voucherCode}`, 'i'),
    });
    await expect(voucherToggle).toBeVisible({ timeout: 15_000 });
    if ((await voucherToggle.getAttribute('aria-checked')) === 'true') {
      await clickVisible(voucherToggle);
    }
    await expect(page.getByText(/^inactif$/i).first()).toBeVisible({ timeout: 15_000 });
  });

  adminSurfaceTests(test, expect, 'cart rule create appears in the list', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    const ruleCode = await createCartRuleViaUi(page, adminUi);
    await expect(page.getByText(new RegExp(ruleCode, 'i')).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  adminSurfaceTests(test, expect, 'cart rule disable marks inactive', async (page, request) => {
    const { adminUi } = await signInAdmin(page, request);
    const ruleCode = await createCartRuleViaUi(page, adminUi);
    await expect(page.getByText(new RegExp(ruleCode, 'i')).first()).toBeVisible({
      timeout: 15_000,
    });
    await clickVisible(page.getByRole('button', { name: new RegExp(ruleCode, 'i') }).first());
    const ruleToggle = page.getByRole('switch', { name: new RegExp(`activer ${ruleCode}`, 'i') });
    await expect(ruleToggle).toBeVisible({ timeout: 15_000 });
    if ((await ruleToggle.getAttribute('aria-checked')) === 'true') {
      await clickVisible(ruleToggle);
    }
    await expect(page.getByText(/inactive|inactif/i).first()).toBeVisible({ timeout: 15_000 });
  });

  adminSurfaceTests(test, expect, 'loyalty small credit', async (page, request) => {
    const { seed, adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.loyalty);
    await adminUi.expectHeading(/fidélité/i);
    await clickVisible(page.locator('summary').filter({ hasText: /créditer/i }));
    await fillVisible(page.getByLabel(/e-mail client/i), seed.customer.email);
    await fillVisible(page.getByLabel(/montant \(€\)/i), '1');
    await fillVisible(page.getByLabel(/motif/i), 'Crédit test admin fonctionnel');
    await clickVisible(page.getByRole('button', { name: /^créditer$/i }).last());
    const confirm = page.getByTestId(tid.confirm.confirm);
    if (await confirm.isVisible().catch(() => false)) await clickVisible(confirm);
    await expect(page.getByText(/cagnotte créditée/i).first()).toBeVisible({ timeout: 15_000 });
  });

  adminSurfaceTests(test, expect, 'gift list shows seeded offer', async (page, request) => {
    const { seed, adminUi } = await signInAdmin(page, request);
    await adminUi.openSection(adminNav.gift);
    await adminUi.expectHeading(adminNav.gift);
    await expect(page.getByText(seed.giftGiverEmail).first()).toBeVisible({ timeout: 15_000 });
  });
});
