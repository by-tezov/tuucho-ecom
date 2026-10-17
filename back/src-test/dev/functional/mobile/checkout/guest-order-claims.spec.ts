import { test } from '../../../support/fixtures.js';
import {
  claimGuestOrder,
  createAccountForGuestEmail,
  createExistingAccount,
  expectClaimedAddress,
  expectClaimedCard,
  expectClaimedOrder,
  expectGuestOrderAndSavedDataAbsent,
  loginGuestEmail,
  openGuestClaim,
  placeGuestOrder,
} from '../../../support/guest-order-flows.js';
import { uniqueEmail } from '../../../support/api.js';

const MOBILE = { width: 390, height: 633 };

test.describe('Commande invitée mobile, rattachement par lien email', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE);
  });

  test('mobile nouveau compte: le lien importe la commande', async ({ page }) => {
    const flow = await prepareNewMobileClaim(page, 'guest-new-mobile-order');
    await expectClaimedOrder(page, flow.orderNumber);
  });

  test('mobile nouveau compte: le lien importe l’adresse mémorisée', async ({ page }) => {
    await prepareNewMobileClaim(page, 'guest-new-mobile-address');
    await expectClaimedAddress(page, true);
  });

  test('mobile nouveau compte: le lien importe la carte mémorisée', async ({ page }) => {
    await prepareNewMobileClaim(page, 'guest-new-mobile-card');
    await expectClaimedCard(page, true);
  });

  test('mobile compte existant: seule la commande revient après le lien si l’adresse et la carte n’étaient pas mémorisées', async ({ page }) => {
    const email = uniqueEmail('guest-existing-mobile');
    await createExistingAccount(email);
    const flow = await placeGuestOrder(page, { email, rememberAddress: false, rememberCard: false });
    await loginGuestEmail(page, email);
    await expectGuestOrderAndSavedDataAbsent(page, flow.orderNumber);
    await claimGuestOrder(page, flow.orderNumber, flow.manageToken, false);
  });
});

async function prepareNewMobileClaim(page: import('patchright/test').Page, slug: string) {
  const flow = await placeGuestOrder(page, {
    email: uniqueEmail(slug),
    rememberAddress: true,
    rememberCard: true,
  });
  await createAccountForGuestEmail(page, flow.email);
  await expectGuestOrderAndSavedDataAbsent(page, flow.orderNumber);
  await openGuestClaim(page, flow.manageToken);
  return flow;
}
