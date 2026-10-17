import { test, expect } from '../../../support/fixtures.js';
import { createZeroingVoucher } from '../../../support/api.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { countOrdersForOffer, giftHoldState, waitForGiftPromiseMail } from '../../../support/gift.js';
import { registerMarcAndCreateOffer } from '../../../support/gift-flow.js';
import { GiftPages, giftSurfaceFromTitle, openPeerShopPage } from '../../../support/pages/gift.pages.js';
import { tid } from '../../../support/selectors.js';

async function runSignedInFlow(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
  voucherCode: string,
) {
  const created = await registerMarcAndCreateOffer(page, request, surface);
  const peer = await openPeerShopPage(page, surface);
  try {
    const julie = new GiftPages(peer.page);
    await julie.enterReceiverWithPin(created.receiverUrl);
    await julie.addSeededSetAndGoToCart(E2E_PRODUCT_UIDS.A1);
    await julie.saveHomeDestination();
    await julie.confirmReceiverChoice();
    expect(await countOrdersForOffer(created.offerId)).toBe(0);
    expect(await giftHoldState(created.offerId)).toEqual({ purpose: 'gift', state: 'held' });
    await waitForGiftPromiseMail(created.email, created.sinceMs);

    const marc = new GiftPages(page);
    await marc.openGiverUrl(created.giverPath);
    await marc.unlockGiverCart();
    const cart = marc.cartPages();
    await cart.applyVoucher(voucherCode);
    await expect(page.getByTestId(tid.cart.voucherSuccess)).toBeVisible({ timeout: 15_000 });
    const orderNumber = await cart.completeFreeOrderToSuccess();
    expect(orderNumber.length).toBeGreaterThan(3);
    await expect(page.getByText(/Cette commande est un cadeau pour Julie/i)).toBeVisible();
  } finally {
    await peer.close();
  }
}

test.describe('Functional gift signed-in flow', () => {
  let voucherCode: string;

  test.beforeAll(async () => {
    voucherCode = await createZeroingVoucher('gift-fn-auth');
  });

  test('web signed-in Offrir: skips the email field, Julie confirms, Marc pays', async ({
    page,
    request,
  }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('web');
    await runSignedInFlow(page, request, 'web', voucherCode);
  });
  test('mobile signed-in Offrir: skips the email field, Julie confirms, Marc pays', async ({
    page,
    request,
  }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('mobile');
    await runSignedInFlow(page, request, 'mobile', voucherCode);
  });
});
