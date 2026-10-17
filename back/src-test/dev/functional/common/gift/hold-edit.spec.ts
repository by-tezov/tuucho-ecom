import { test, expect } from '../../../support/fixtures.js';
import { E2E_PRODUCT_UIDS, resetE2eLastUnitStock } from '../../../support/catalog.js';
import {
  collectPublicFeedProductUids,
  giftHoldProductUids,
  giftHoldState,
} from '../../../support/gift.js';
import { registerMarcAndCreateOffer } from '../../../support/gift-flow.js';
import { expectCartLoyaltyEarnMatchesMerchandise } from '../../../support/loyalty-flows.js';
import { GiftPages, giftSurfaceFromTitle, openPeerShopPage } from '../../../support/pages/gift.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { tid } from '../../../support/selectors.js';

async function expectPublicFeedHas(
  request: import('patchright/test').APIRequestContext,
  productUid: string,
  present: boolean,
): Promise<void> {
  await expect
    .poll(async () => (await collectPublicFeedProductUids(request)).includes(productUid), {
      timeout: 15_000,
    })
    .toBe(present);
}

async function runHoldEditAndLoyalty(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  const holdUid = surface === 'web' ? E2E_PRODUCT_UIDS.HOLD_WEB : E2E_PRODUCT_UIDS.HOLD_MOBILE;
  await resetE2eLastUnitStock(holdUid);

  await test.step('Expected: the last-unit set is in the public gallery before Julie confirms', async () => {
    await expectPublicFeedHas(request, holdUid, true);
  });

  const created = await registerMarcAndCreateOffer(page, request, surface, {
    hidePrices: false,
    budgetEuros: 40,
  });
  const peer = await openPeerShopPage(page, surface);
  try {
    const julie = new GiftPages(peer.page);
    await julie.enterReceiverWithPin(created.receiverUrl);
    await julie.galleryPages().addSeededProduct(holdUid, { shapeKey: 'amande', size: 'M' });
    await julie.addSeededSetAndGoToCart(E2E_PRODUCT_UIDS.A1);
    await julie.saveHomeDestination();
    await julie.confirmReceiverChoice();
  } finally {
    await peer.close();
  }

  await test.step('Expected: confirming the gift hides the last-unit set from the public gallery and holds it', async () => {
    await expectPublicFeedHas(request, holdUid, false);
    expect(await giftHoldState(created.offerId)).toEqual({ purpose: 'gift', state: 'held' });
    expect(await giftHoldProductUids(created.offerId)).toEqual(
      [E2E_PRODUCT_UIDS.A1, holdUid].sort(),
    );
  });

  const marc = new GiftPages(page);
  await marc.openGiverUrl(created.giverPath);

  await test.step('Expected: the locked gift recap earns 10% of the price after the volume remise, including the held last unit', async () => {
    await expect(
      page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${holdUid}"]`),
    ).toBeVisible({ timeout: 15_000 });
    await expectCartLoyaltyEarnMatchesMerchandise(page);
  });

  await marc.unlockGiverCart();

  await test.step('Expected: removing the last-unit set releases its hold so it is sellable again', async () => {
    await marc.cartPages().removeNailByUid(holdUid);
    expect(await giftHoldProductUids(created.offerId)).toEqual([E2E_PRODUCT_UIDS.A1]);
    expect(await giftHoldState(created.offerId)).toEqual({ purpose: 'gift', state: 'held' });
    await expectPublicFeedHas(request, holdUid, true);
  });

  await test.step('Expected: the public gallery card is reachable again after the hold is released', async () => {
    const gallery = new GalleryPages(page);
    await gallery.findSeededCard(holdUid);
  });

  await test.step('Expected: removing the set updates the cagnotte to the cent', async () => {
    await marc.cartPages().goto();
    await expectCartLoyaltyEarnMatchesMerchandise(page);
  });

  await test.step('Expected: adding another set updates the cagnotte to the cent', async () => {
    const gallery = new GalleryPages(page);
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A2, { shapeKey: 'amande', size: 'M' });
    await marc.cartPages().goto();
    await expect(
      page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${E2E_PRODUCT_UIDS.A2}"]`),
    ).toBeVisible({ timeout: 15_000 });
    await expectCartLoyaltyEarnMatchesMerchandise(page);
  });
}

test.describe('Functional gift hold edit and loyalty', () => {
  test('web removing a confirmed gift set: returns stock and keeps cagnotte exact', async ({
    page,
    request,
  }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('web');
    await runHoldEditAndLoyalty(page, request, 'web');
  });
  test('mobile removing a confirmed gift set: returns stock and keeps cagnotte exact', async ({
    page,
    request,
  }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('mobile');
    await runHoldEditAndLoyalty(page, request, 'mobile');
  });
});
