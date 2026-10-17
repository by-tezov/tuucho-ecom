// Shared desktop and mobile account coverage.
import { test, expect } from '../../../support/fixtures.js';
import { apiJsonRetryRateLimit, uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { AccountPages } from '../../../support/pages/account.pages.js';
import { AddressPages } from '../../../support/pages/address.pages.js';
import { tid } from '../../../support/selectors.js';
import { clickVisible, fillVisible } from '../../../support/interact.js';

async function registerAndOpenAccount(page: import('patchright/test').Page, email: string) {
  const auth = new AuthPages(page);
  await auth.registerFromDesktopAccountModal(email, testPassword);
  await auth.openDesktopAccount();
}

async function openPasswordlessAccount(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  slug: string,
) {
  const email = uniqueEmail(slug);
  await apiJsonRetryRateLimit(request, 'POST', '/auth/register-otp-skip', {
    data: { email, gdprConsent: { accepted: true }, language: 'fr' },
    expectedStatus: 201,
  });
  const auth = new AuthPages(page);
  await auth.loginWithOtpFromDesktopAccountModal(email);
  await auth.openDesktopAccount();
  return { auth, email, account: new AccountPages(page) };
}

test.describe('Functional account', () => {
  test('profile: an empty name shows a field error', async ({ page }) => {
    await registerAndOpenAccount(page, uniqueEmail('ui-profile-empty'));
    await clickVisible(page.getByTestId(tid.account.saveProfile));
    await expect(page.getByRole('alert').first()).toBeVisible();
  });

  test('profile: name and phone can be saved', async ({ page }) => {
    await registerAndOpenAccount(page, uniqueEmail('ui-profile-save'));
    const account = new AccountPages(page);
    await account.fillProfile('Ada', 'Lovelace', '0601020304');
    await expect(page.getByText(/enregistr|succès|saved|mis à jour/i)).toBeVisible();
  });

  test('home livraison address: the address is added', async ({ page }) => {
    await registerAndOpenAccount(page, uniqueEmail('ui-home-addr'));
    const addresses = new AddressPages(page);
    await addresses.addHomeLivraison();
    await expect(page.getByTestId(tid.account.addressesPage)).toBeVisible();
    await expect(page.getByText(/Ada Lovelace|10 rue de Test|75001/i).first()).toBeVisible();
  });

  test('home address extra fields: company name, complement, and extra information can be saved', async ({ page }) => {
    await registerAndOpenAccount(page, uniqueEmail('ui-home-full'));
    const addresses = new AddressPages(page);
    await addresses.addHomeLivraisonFull();
    await expect(page.getByTestId(tid.account.addressesPage)).toBeVisible();
    await expect(page.getByText(/Lumen/i).first()).toBeVisible();
    await expect(page.getByText(/Bâtiment B|3e étage/i).first()).toBeVisible();
    await expect(page.getByText(/interphone|Pam/i).first()).toBeVisible();
  });

  test('company mode: empty raison sociale shows required error', async ({ page }) => {
    await registerAndOpenAccount(page, uniqueEmail('ui-company-req'));
    const addresses = new AddressPages(page);
    await addresses.openAddHomeFromAccount();
    await clickVisible(page.getByTestId(tid.address.addCompany));
    await fillVisible(page.getByTestId(tid.address.line1), '10 rue de Test');
    await fillVisible(page.getByTestId(tid.address.postal), '75001');
    await fillVisible(page.getByTestId(tid.address.city), 'Paris');
    await clickVisible(page.getByTestId(tid.address.submit));
    await expect(page.getByRole('alert').filter({ hasText: /raison sociale/i })).toBeVisible();
  });

  test('Mondial Relay pickup point: search finds a point and it is added', async ({ page }) => {
    await registerAndOpenAccount(page, uniqueEmail('ui-mr-point'));
    const addresses = new AddressPages(page);
    await addresses.addMondialRelayPickup('75001');
    await expect(page.getByTestId(tid.account.addressesPage)).toBeVisible();
    await expect(page.getByText(/Mondial Relay/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('payment methods page: it opens with the add-card control', async ({ page }) => {
    await registerAndOpenAccount(page, uniqueEmail('ui-pay'));
    const account = new AccountPages(page);
    await account.gotoPayments();
    await expect(page.getByTestId(tid.account.paymentPage)).toBeVisible();
    await expect(page.getByTestId(tid.account.addCard)).toBeVisible();
  });

  test('orders: stay empty until a real order exists', async ({ page }) => {
    await registerAndOpenAccount(page, uniqueEmail('ui-orders'));
    const account = new AccountPages(page);
    await account.gotoOrders();
    await expect(page.getByTestId(tid.orders.list)).toBeVisible();
    await expect(page.getByTestId(tid.orders.item)).toHaveCount(0);
  });

  test('history: stays empty until a real order exists', async ({ page }) => {
    await registerAndOpenAccount(page, uniqueEmail('ui-history'));
    const account = new AccountPages(page);
    await account.gotoHistory();
    await expect(page.getByTestId(tid.orders.historyList)).toBeVisible();
    await expect(page.getByTestId(tid.orders.item)).toHaveCount(0);
  });

  test('passwordless account: name and phone can be saved', async ({ page, request }) => {
    const { account } = await openPasswordlessAccount(page, request, 'ui-unlock-profile');
    await account.fillProfile('Ada', 'Lovelace', '0601020304');
    await expect(page.getByText(/enregistr|succès|saved|mis à jour/i)).toBeVisible();
  });

  for (const section of [
    { title: 'informations', slug: 'informations', heading: /^informations$/i, saveProfileFirst: true },
    { title: 'email change', slug: 'email', heading: /changer d.adresse email/i, saveProfileFirst: false },
    { title: 'password creation', slug: 'password', heading: /créer un mot de passe/i, saveProfileFirst: false },
    { title: 'account deletion', slug: 'deletion', heading: /supprimer mon compte/i, saveProfileFirst: false },
  ]) {
    test(`passwordless account: unlocks ${section.title} with a mailed code`, async ({ page, request }) => {
      const { auth, email, account } = await openPasswordlessAccount(page, request, `ui-unlock-${section.slug}`);
      // A blank profile is filled in without a code. The mailed step-up
      // appears only once a name or a phone is already stored.
      if (section.saveProfileFirst) {
        await account.fillProfile('Ada', 'Lovelace', '0601020304');
        await expect(page.getByText(/enregistr|succès|saved|mis à jour/i)).toBeVisible();
      }
      const button = page
        .getByRole('heading', { name: section.heading })
        .locator(
          'xpath=ancestor::*[count(.//h2)=1 and .//button[contains(., "Déverrouiller")]][1]',
        )
        .getByRole('button', { name: /déverrouiller/i });
      await auth.unlockSectionWithMailedOtp(button, email);
      await expect(button).toHaveCount(0);
    });
  }

  test('passwordless account: unlocks sign-in methods with a mailed code', async ({ page, request }) => {
    const { auth, email } = await openPasswordlessAccount(page, request, 'ui-unlock-methods');
    const signInMethods = page.getByTestId(tid.account.signInMethods);
    await expect(signInMethods).toBeVisible();
    const button = signInMethods.getByRole('button', { name: /déverrouiller/i });
    await auth.unlockSectionWithMailedOtp(button, email);
    await expect(button).toHaveCount(0);
  });

});
