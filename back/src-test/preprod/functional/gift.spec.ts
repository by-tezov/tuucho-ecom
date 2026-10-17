import { test, expect } from '../../dev/support/fixtures.js';
import { uniqueEmail } from '../../dev/support/api.js';
import { testGiftPin } from '../../dev/support/env.js';
import { extractGiftGiverToken, resolveGiftReceiverUrl } from '../support/giftMail.js';
import { waitForMail } from '../../dev/support/mail.js';
import { GiftPages, openPeerShopPage } from '../../dev/support/pages/gift.pages.js';
import { GalleryPages } from '../../dev/support/pages/gallery.pages.js';
import { shopPath } from '../../dev/support/shopPath.js';
import { tid } from '../../dev/support/selectors.js';
import { clickVisible } from '../../dev/support/interact.js';
import { MOBILE, registerConfirmAndLogin } from '../support/criticalPath.js';

async function finishOfferFromMail(
  request: import('patchright/test').APIRequestContext,
  email: string,
  sinceMs: number,
  createReceiverUrl?: string | null,
): Promise<{ receiverUrl: string; giverPath: string }> {
  const shareMail = await waitForMail({
    kind: 'user',
    toIncludes: email,
    subjectIncludes: 'Carte cadeau',
    sinceMs,
  });
  const giverToken = extractGiftGiverToken(shareMail.html);
  const receiverPath = await resolveGiftReceiverUrl({
    request,
    giverToken,
    createReceiverUrl,
  });
  return {
    receiverUrl: shopPath(receiverPath),
    giverPath: shopPath(`/gift/giver/${giverToken}`),
  };
}

async function submitCreateCapturingReceiverUrl(
  page: import('patchright/test').Page,
  gift: GiftPages,
): Promise<string | null> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/gift\/offers\/?$/.test(new URL(response.url()).pathname),
  );
  await gift.submitCreate();
  const response = await responsePromise;
  const body = (await response.json().catch(() => ({}))) as { receiverUrl?: string | null };
  return typeof body.receiverUrl === 'string' ? body.receiverUrl : null;
}

async function receiverPicksAndConfirms(page: import('patchright/test').Page, receiverUrl: string): Promise<void> {
  const julie = new GiftPages(page);
  await julie.enterReceiverWithPin(receiverUrl, testGiftPin);
  const gallery = new GalleryPages(page);
  const uids = await gallery.collectFeedUids(1);
  if (!uids[0]) throw new Error('gallery has no product for the gift receiver');
  await gallery.addLiveProduct(uids[0], { dismissDrawer: false });
  await clickVisible(page.getByTestId(tid.cart.drawerCheckout));
  await julie.saveHomeDestination();
  await julie.confirmReceiverChoice();
}

test.describe('Preprod mobile Offrir', () => {
  test('mobile existing user (signed-in giver): complete Offrir', async ({ page, request }) => {
    await page.setViewportSize(MOBILE);
    const { email } = await registerConfirmAndLogin(page);
    const sinceMs = Date.now() - 1_000;
    const gift = new GiftPages(page);
    await gift.openOffrirFromNav();
    await gift.completeValidSignedInForm({ accessories: true, budgetEuros: 60, accessoryEuros: 5 });
    const createReceiverUrl = await submitCreateCapturingReceiverUrl(page, gift);
    await gift.expectSignedInCreated();
    const created = await finishOfferFromMail(request, email, sinceMs, createReceiverUrl);
    const peer = await openPeerShopPage(page, 'mobile');
    try {
      await receiverPicksAndConfirms(peer.page, created.receiverUrl);
      const marc = new GiftPages(page);
      await marc.openGiverUrl(created.giverPath);
      await marc.unlockGiverCart();
      const orderNumber = await marc.cartPages().addTestCardAndPayToSuccess();
      expect(orderNumber.length).toBeGreaterThan(3);
    } finally {
      await peer.close();
    }
  });

  test('mobile non-existing user (guest giver): complete Offrir', async ({ page, request }) => {
    await page.setViewportSize(MOBILE);
    const email = uniqueEmail('preprod-gift-guest');
    const sinceMs = Date.now() - 1_000;
    const gift = new GiftPages(page);
    await gift.openOffrirFromNav();
    await gift.completeValidGuestForm({
      email,
      accessories: true,
      budgetEuros: 60,
      accessoryEuros: 5,
    });
    const createReceiverUrl = await submitCreateCapturingReceiverUrl(page, gift);
    await gift.expectGuestCreated();
    const created = await finishOfferFromMail(request, email, sinceMs, createReceiverUrl);
    const peer = await openPeerShopPage(page, 'mobile');
    try {
      await receiverPicksAndConfirms(peer.page, created.receiverUrl);
      const marc = new GiftPages(page);
      await marc.openGiverUrl(created.giverPath);
      await marc.unlockGiverCart();
      const orderNumber = await marc.cartPages().addTestCardAndPayToSuccess();
      expect(orderNumber.length).toBeGreaterThan(3);
    } finally {
      await peer.close();
    }
  });
});
