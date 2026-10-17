import { test, expect } from '../../../support/fixtures.js';
import { createZeroingVoucher } from '../../../support/api.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { TEST_GIFT_PIN, countOrdersForOffer, giftHoldState, waitForGiftPromiseMail } from '../../../support/gift.js';
import { createGuestOfferFromShop } from '../../../support/gift-flow.js';
import { GiftPages, giftSurfaceFromTitle, openPeerShopPage } from '../../../support/pages/gift.pages.js';
import { tid } from '../../../support/selectors.js';
import { shopPath } from '../../../support/shopPath.js';

async function runGuestFlow(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
  voucherCode: string,
) {
  const created = await createGuestOfferFromShop(page, request);
  const peer = await openPeerShopPage(page, surface);
  try {
    const julie = new GiftPages(peer.page);
    await julie.openReceiverUrl(created.receiverUrl);
    await julie.unlockPin(TEST_GIFT_PIN);
    await julie.expectReceiverUnlocked();

    await julie.page.goto(shopPath('/gift'));
    await expect(julie.page.getByTestId(tid.gift.createForm)).toHaveCount(0);
    await expect(julie.page.getByTestId(tid.gift.lockBanner)).toBeVisible({ timeout: 15_000 });

    await julie.addSeededSetAndGoToCart(E2E_PRODUCT_UIDS.A1);
    await julie.saveHomeDestination();
    await julie.confirmReceiverChoice();

    expect(await countOrdersForOffer(created.offerId)).toBe(0);
    const hold = await giftHoldState(created.offerId);
    expect(hold).toEqual({ purpose: 'gift', state: 'held' });

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
    expect(await countOrdersForOffer(created.offerId)).toBe(1);
  } finally {
    await peer.close();
  }
}

test.describe('Functional gift guest flow', () => {
  let voucherCode: string;

  test.beforeAll(async () => {
    voucherCode = await createZeroingVoucher('gift-fn');
  });

  test('web guest Offrir mails a QR card, Julie: confirms a hold, Marc pays', async ({
    page,
    request,
  }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('web');
    await runGuestFlow(page, request, 'web', voucherCode);
  });
  test('mobile guest Offrir mails a QR card, Julie: confirms a hold, Marc pays', async ({
    page,
    request,
  }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('mobile');
    await runGuestFlow(page, request, 'mobile', voucherCode);
  });
});
