import { test, expect } from '../../../support/fixtures.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { giftHoldState } from '../../../support/gift.js';
import { registerMarcAndCreateOffer } from '../../../support/gift-flow.js';
import { GiftPages, giftSurfaceFromTitle, openPeerShopPage } from '../../../support/pages/gift.pages.js';
import { tid } from '../../../support/selectors.js';

async function runLastItemRemovalCancelsGift(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  const created = await registerMarcAndCreateOffer(page, request, surface, {
    hidePrices: false,
    budgetEuros: 40,
  });
  const peer = await openPeerShopPage(page, surface);
  try {
    const julie = new GiftPages(peer.page);
    await julie.enterReceiverWithPin(created.receiverUrl);
    await julie.addSeededSetAndGoToCart(E2E_PRODUCT_UIDS.A1);
    await julie.saveHomeDestination();
    await julie.confirmReceiverChoice();
  } finally {
    await peer.close();
  }

  const marc = new GiftPages(page);
  await marc.openGiverUrl(created.giverPath);
  await marc.unlockGiverCart();
  const cart = marc.cartPages();
  const line = page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${E2E_PRODUCT_UIDS.A1}"]`);

  await test.step('Expected: deleting the last set opens cancel-gift, not remove-line', async () => {
    await cart.clickNailDelete(E2E_PRODUCT_UIDS.A1);
    await expect(cart.giftCancelConfirm()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('dialog', { name: /retirer cet article/i })).toHaveCount(0);
  });

  await test.step('Expected: dismissing cancel-gift keeps the last set', async () => {
    await cart.dismissGiftCancelConfirm();
    await expect(line).toBeVisible({ timeout: 15_000 });
    expect(await giftHoldState(created.offerId)).toEqual({ purpose: 'gift', state: 'held' });
  });

  await test.step('Expected: confirming cancel-gift ends the offer', async () => {
    await cart.clickNailDelete(E2E_PRODUCT_UIDS.A1);
    await expect(cart.giftCancelConfirm()).toBeVisible({ timeout: 15_000 });
    await cart.confirmGiftCancelFromModal();
    await expect(page.getByTestId(tid.gift.cancelOffer)).toHaveCount(0);
    await expect(page.getByTestId(tid.cart.page)).not.toContainText(/destinataire n’a pas encore confirmé/i);
    expect(await giftHoldState(created.offerId)).toBeNull();
  });
}

test.describe('Functional gift last-item cancel', () => {
  test('web removing the last: confirmed gift set asks to cancel the offer', async ({
    page,
    request,
  }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('web');
    await runLastItemRemovalCancelsGift(page, request, 'web');
  });
  test('mobile removing the last: confirmed gift set asks to cancel the offer', async ({
    page,
    request,
  }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('mobile');
    await runLastItemRemovalCancelsGift(page, request, 'mobile');
  });
});
