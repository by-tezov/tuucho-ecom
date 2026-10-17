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

test.describe('Commande invitée, rattachement par lien email', () => {
  test('web nouveau compte: le lien importe la commande', async ({ page }) => {
    const flow = await prepareNewWebClaim(page, 'guest-new-web-order');
    await expectClaimedOrder(page, flow.orderNumber);
  });

  test('web nouveau compte: le lien importe l’adresse mémorisée', async ({ page }) => {
    await prepareNewWebClaim(page, 'guest-new-web-address');
    await expectClaimedAddress(page, true);
  });

  test('web nouveau compte: le lien importe la carte mémorisée', async ({ page }) => {
    await prepareNewWebClaim(page, 'guest-new-web-card');
    await expectClaimedCard(page, true);
  });

  test('web compte existant: rien avant le lien, puis seule la commande si rien ne doit être mémorisé', async ({ page }) => {
    const email = uniqueEmail('guest-existing-web');
    await createExistingAccount(email);
    const flow = await placeGuestOrder(page, { email, rememberAddress: false, rememberCard: false });
    await loginGuestEmail(page, email);
    await expectGuestOrderAndSavedDataAbsent(page, flow.orderNumber);
    await claimGuestOrder(page, flow.orderNumber, flow.manageToken, false);
  });
});

async function prepareNewWebClaim(page: import('patchright/test').Page, slug: string) {
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
