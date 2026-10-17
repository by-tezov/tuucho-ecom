import { test, expect } from '../../../support/fixtures.js';
import { registerUser, uniqueEmail } from '../../../support/api.js';
import {
  assignRolesViaApi,
  createStaffRoleViaApi,
  seedAdminWorkbench,
  seedStaffWithRole,
  seedSuperAdmin,
} from '../../../support/adminSeed.js';
import {
  AdminPages,
  ADMIN_SECTIONS_EXCEPT_REVIEWS,
  adminNav,
  adminSurfaceTests,
} from '../../../support/pages/admin.pages.js';
import { clickVisible, fillVisible } from '../../../support/interact.js';
import { tid } from '../../../support/selectors.js';

/** Create a staff role from the Roles form (already on create view). */
async function fillAndSaveRole(
  page: import('patchright/test').Page,
  opts: {
    label: string;
    parent?: RegExp;
    grants?: RegExp[];
    assignable?: RegExp[];
    targetable?: RegExp[];
  },
): Promise<void> {
  await fillVisible(page.getByPlaceholder(/préparateur/i), opts.label);

  if (opts.parent) {
    await clickVisible(page.getByRole('button', { name: /hérite de/i }));
    await clickVisible(page.getByRole('button', { name: opts.parent }));
    await clickVisible(page.getByRole('button', { name: /^valider$/i }));
  }

  for (const grant of opts.grants ?? []) {
    const toggle = page.getByRole('switch', { name: grant });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await clickVisible(toggle);
  }

  if (opts.assignable?.length) {
    await clickVisible(page.getByRole('button', { name: /rôles attribuables\s*:/i }));
    for (const role of opts.assignable) {
      await clickVisible(page.getByRole('button', { name: role }));
    }
    await clickVisible(page.getByRole('button', { name: /^valider$/i }));
  }

  if (opts.targetable?.length) {
    await clickVisible(page.getByRole('button', { name: /comptes modifiables\s*:/i }));
    for (const role of opts.targetable) {
      await clickVisible(page.getByRole('button', { name: role }));
    }
    await clickVisible(page.getByRole('button', { name: /^valider$/i }));
  }

  await clickVisible(page.getByRole('button', { name: /^enregistrer$/i }));
  await expect(page.getByText(new RegExp(`rôle «?\\s*${opts.label}`, 'i'))).toBeVisible({
    timeout: 15_000,
  });
}

/** Assign roles on an account from the Roles page "Rôles des comptes" search. */
async function assignRolesOnAccount(
  page: import('patchright/test').Page,
  email: string,
  roleLabels: string[],
): Promise<void> {
  const search = page.getByRole('search');
  await fillVisible(search.getByLabel(/e-mail utilisateur/i), email);
  await clickVisible(search.getByRole('button', { name: /rechercher/i }));
  const row = page
    .getByRole('list', { name: /rôles des comptes/i })
    .getByRole('listitem')
    .filter({ hasText: email });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await clickVisible(row.getByRole('button', { name: /^rôles\s*:/i }));
  for (const label of roleLabels) {
    await clickVisible(page.getByRole('button', { name: label, exact: true }));
  }
  await clickVisible(page.getByRole('button', { name: /^valider$/i }));
  await clickVisible(page.getByTestId(tid.confirm.confirm));
  await expect(page.getByText(/rôle changé/i)).toBeVisible({ timeout: 15_000 });
}

async function startRoleCreate(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
) {
  const admin = await seedSuperAdmin(request);
  const assignee = await registerUser(request, { email: uniqueEmail('role-assignee') });
  const adminUi = new AdminPages(page);
  await adminUi.signInFromShop(admin.email, admin.password);
  await adminUi.openSection(adminNav.roles);
  await adminUi.expectHeading(adminNav.roles);
  await expect(page.getByRole('heading', { name: /rôles des comptes/i })).toBeVisible({
    timeout: 15_000,
  });
  const supportLabel = `Support ${Date.now().toString(36).slice(-5)}`;
  await clickVisible(page.getByRole('button', { name: /\+?\s*nouveau rôle/i }));
  await adminUi.expectHeading(/créer un rôle/i);
  return { adminUi, assignee, supportLabel };
}

async function createSupportRole(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
) {
  const created = await startRoleCreate(page, request);
  await fillAndSaveRole(page, {
    label: created.supportLabel,
    parent: /^préparateur$/i,
    grants: [/accès\s*:\s*contact/i],
    assignable: [/^préparateur$/i],
    targetable: [/^client$/i, /^préparateur$/i],
  });
  return created;
}

async function signInInheritedRole(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
) {
  const admin = await seedSuperAdmin(request);
  const stamp = Date.now().toString(36).slice(-5);
  const role = await createStaffRoleViaApi(request, admin.accessToken, {
    label: `Support ${stamp}`,
    grants: [{ permission: 'messages', granted: true, dominant: false }],
    parents: ['preparator'],
    assignable: ['preparator'],
    assignableDominant: false,
    targetable: ['user', 'preparator'],
    targetableDominant: false,
  });
  const assignee = await registerUser(request, { email: uniqueEmail('inherit') });
  const assigneeId = String(assignee.user.id ?? '');
  expect(assigneeId).toBeTruthy();
  await assignRolesViaApi(request, admin.accessToken, assigneeId, [role.code]);
  const adminUi = new AdminPages(page);
  await adminUi.signInFromShop(assignee.email, assignee.password);
  return adminUi;
}

async function signInDelegate(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
) {
  const admin = await seedSuperAdmin(request);
  const workbench = await seedAdminWorkbench(request);
  const stamp = Date.now().toString(36).slice(-5);
  const chefRole = await createStaffRoleViaApi(request, admin.accessToken, {
    label: `Chef ${stamp}`,
    assignable: ['preparator'],
    assignableDominant: false,
    targetable: ['user', 'preparator'],
    targetableDominant: false,
  });
  const chef = await registerUser(request, { email: uniqueEmail('chef') });
  const chefId = String(chef.user.id ?? '');
  expect(chefId).toBeTruthy();
  await assignRolesViaApi(request, admin.accessToken, chefId, [chefRole.code]);
  const adminUi = new AdminPages(page);
  await adminUi.signInFromShop(chef.email, chef.password);
  return { adminUi, customerEmail: workbench.customer.email };
}

test.describe('Functional admin access and roles', () => {
  adminSurfaceTests(test, expect, 'super-admin shell shows Accueil and every section', async (page, request) => {
    const admin = await seedSuperAdmin(request);
    const adminUi = new AdminPages(page);
    await adminUi.signInFromShop(admin.email, admin.password);
    await adminUi.expectHeading(/administration/i);
    await expect(page.getByRole('heading', { name: /à traiter maintenant/i })).toBeVisible({
      timeout: 15_000,
    });
    for (const label of ADMIN_SECTIONS_EXCEPT_REVIEWS) {
      await adminUi.expectSectionVisible(label);
    }
    await adminUi.expectSectionVisible(adminNav.reviews);
  });

  adminSurfaceTests(test, expect, 'role create with parent and grant lists', async (page, request) => {
    const { supportLabel } = await startRoleCreate(page, request);
    await fillAndSaveRole(page, {
      label: supportLabel,
      parent: /^préparateur$/i,
      grants: [/accès\s*:\s*contact/i],
      assignable: [/^préparateur$/i],
      targetable: [/^client$/i, /^préparateur$/i],
    });
  });

  adminSurfaceTests(test, expect, 'assign custom role on Roles search', async (page, request) => {
    const { assignee, supportLabel } = await createSupportRole(page, request);
    await assignRolesOnAccount(page, assignee.email, [supportLabel]);
  });

  adminSurfaceTests(test, expect, 'users detail shows the role chip read-only', async (page, request) => {
    const { adminUi, assignee, supportLabel } = await createSupportRole(page, request);
    await assignRolesOnAccount(page, assignee.email, [supportLabel]);
    await adminUi.openSection(adminNav.users);
    await adminUi.expectHeading(adminNav.users);
    const staffOnly = page.getByRole('switch', { name: /équipe uniquement/i });
    await expect(staffOnly).toBeVisible({ timeout: 15_000 });
    if ((await staffOnly.getAttribute('aria-checked')) !== 'true') await clickVisible(staffOnly);
    await fillVisible(page.getByLabel(/e-mail utilisateur/i), assignee.email);
    await clickVisible(page.getByRole('button', { name: /rechercher/i }));
    await clickVisible(page.getByRole('button', { name: assignee.email }));
    const userDetail = page.getByRole('dialog', { name: assignee.email });
    await expect(userDetail).toBeVisible({ timeout: 15_000 });
    await expect(userDetail.getByText(supportLabel, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(userDetail.getByRole('button', { name: /^rôles\s*:/i })).toHaveCount(0);
  });

  adminSurfaceTests(test, expect, 'preparator nav hides commerce and roles', async (page, request) => {
    const preparator = await seedStaffWithRole(request, 'preparator', 'prep');
    const adminUi = new AdminPages(page);
    await adminUi.signInFromShop(preparator.email, preparator.password);
    await adminUi.expectSectionVisible(adminNav.orders);
    await adminUi.expectSectionVisible(adminNav.libraryStock);
    await adminUi.expectSectionHidden(adminNav.vouchers);
    await adminUi.expectSectionHidden(adminNav.roles);
    await adminUi.expectSectionHidden(adminNav.users);
    await adminUi.expectForbiddenUrlRedirectsHome('/admin/roles');
  });

  adminSurfaceTests(test, expect, 'inherited role nav shows orders stock contact and roles', async (page, request) => {
    const adminUi = await signInInheritedRole(page, request);
    await adminUi.expectSectionVisible(adminNav.orders);
    await adminUi.expectSectionVisible(adminNav.libraryStock);
    await adminUi.expectSectionVisible(adminNav.contact);
    await adminUi.expectSectionVisible(adminNav.roles);
    await adminUi.expectSectionHidden(adminNav.vouchers);
  });

  adminSurfaceTests(test, expect, 'inherited role Roles page is assign-only', async (page, request) => {
    const adminUi = await signInInheritedRole(page, request);
    await adminUi.openSection(adminNav.roles);
    await adminUi.expectHeading(adminNav.roles);
    await expect(page.getByRole('button', { name: /\+?\s*nouveau rôle/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /rôles des comptes/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  adminSurfaceTests(test, expect, 'delegate nav shows Roles only', async (page, request) => {
    const { adminUi } = await signInDelegate(page, request);
    await adminUi.expectSectionVisible(adminNav.roles);
    await adminUi.expectSectionHidden(adminNav.orders);
    await adminUi.expectSectionHidden(adminNav.vouchers);
    await adminUi.openSection(adminNav.roles);
    await adminUi.expectHeading(adminNav.roles);
    await expect(page.getByRole('button', { name: /\+?\s*nouveau rôle/i })).toHaveCount(0);
  });

  adminSurfaceTests(test, expect, 'delegate can assign only the listed preparator role', async (page, request) => {
    const { adminUi, customerEmail } = await signInDelegate(page, request);
    await adminUi.openSection(adminNav.roles);
    await adminUi.expectHeading(adminNav.roles);
    const search = page.getByRole('search');
    await fillVisible(search.getByLabel(/e-mail utilisateur/i), customerEmail);
    await clickVisible(search.getByRole('button', { name: /rechercher/i }));
    const customerRow = page
      .getByRole('list', { name: /rôles des comptes/i })
      .getByRole('listitem')
      .filter({ hasText: customerEmail });
    await expect(customerRow).toBeVisible({ timeout: 15_000 });
    await clickVisible(customerRow.getByRole('button', { name: /^rôles\s*:/i }));
    await expect(page.getByRole('button', { name: /^préparateur$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /^manager$/i })).toHaveCount(0);
    await clickVisible(page.getByRole('button', { name: /^préparateur$/i }));
    await clickVisible(page.getByRole('button', { name: /^valider$/i }));
    await clickVisible(page.getByTestId(tid.confirm.confirm));
    await expect(page.getByText(/rôle changé/i)).toBeVisible({ timeout: 15_000 });
  });
});
