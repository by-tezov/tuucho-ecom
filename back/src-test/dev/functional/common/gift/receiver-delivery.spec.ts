import { test, expect } from '../../../support/fixtures.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { createGuestOfferFromShop } from '../../../support/gift-flow.js';
import { GiftPages, giftSurfaceFromTitle, openPeerShopPage } from '../../../support/pages/gift.pages.js';
import { tid } from '../../../support/selectors.js';

async function runReceiverDelivery(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  const created = await createGuestOfferFromShop(page, request, { hidePrices: false });
  const peer = await openPeerShopPage(page, surface);
  try {
    const julie = new GiftPages(peer.page);
    await julie.enterReceiverWithPin(created.receiverUrl);
    await julie.addSeededSetAndGoToCart(E2E_PRODUCT_UIDS.A1);
    await julie.expectNoCourierFees();
    await julie.saveHomeDestination();
    await expect(julie.savedAddressLabel()).toContainText('Julie Test');
    await expect(julie.savedAddressLabel()).toContainText('12 rue des Fleurs');
    await julie.expectNoCourierFees();

    const home = peer.page.locator(
      `[data-testid="${tid.cart.courierOption}"][data-courier-code="mondial-relay-home"]`,
    );
    await expect(home).toBeEnabled();
    await julie.confirmReceiverChoice();
    await expect(peer.page.getByTestId(tid.gift.addAddress)).toHaveCount(0);
    await expect(peer.page.getByTestId(tid.gift.receiverConfirm)).toHaveCount(0);
    await expect(home).toHaveCount(0);
  } finally {
    await peer.close();
  }
}

test.describe('Functional gift receiver delivery', () => {
  test('web Julie: saves a home address, never sees courier fees, then freezes', async ({
    page,
    request,
  }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('web');
    await runReceiverDelivery(page, request, 'web');
  });
  test('mobile Julie: saves a home address, never sees courier fees, then freezes', async ({
    page,
    request,
  }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('mobile');
    await runReceiverDelivery(page, request, 'mobile');
  });
});
