import { test, expect } from '../../../support/fixtures.js';
import {
  forceOfferTimestamp,
  processGiftCron,
  waitForGiftCancelledMail,
} from '../../../support/gift.js';
import { createGuestOfferFromShop } from '../../../support/gift-flow.js';
import { GiftPages, giftSurfaceFromTitle, openPeerShopPage } from '../../../support/pages/gift.pages.js';
import { tid } from '../../../support/selectors.js';

async function runCancel(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  const created = await createGuestOfferFromShop(page, request);
  const marc = new GiftPages(page);
  await marc.openGiverUrl(created.giverPath);
  await expect(page.getByTestId(tid.gift.cancelOffer)).toBeVisible();
  await marc.cancelOfferFromCart();
  await waitForGiftCancelledMail(created.email, created.sinceMs);
  await forceOfferTimestamp(created.offerId, 'receiver_visible_until', new Date(Date.now() - 60_000));

  const peer = await openPeerShopPage(page, surface);
  try {
    const julie = new GiftPages(peer.page);
    await julie.openReceiverUrl(created.receiverUrl);
    await julie.expectGone();
  } finally {
    await peer.close();
  }
}

async function runExpire(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  const created = await createGuestOfferFromShop(page, request);
  await forceOfferTimestamp(created.offerId, 'offer_expires_at', new Date(Date.now() - 60_000));
  await processGiftCron();
  await forceOfferTimestamp(created.offerId, 'receiver_visible_until', new Date(Date.now() - 60_000));

  const peer = await openPeerShopPage(page, surface);
  try {
    const julie = new GiftPages(peer.page);
    await julie.openReceiverUrl(created.receiverUrl);
    await julie.expectGone();
  } finally {
    await peer.close();
  }
}

test.describe('Functional gift cancel and expire', () => {
  test('web Marc: cancels from the giver cart and Julie link is gone', async ({ page, request }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('web');
    await runCancel(page, request, 'web');
  });
  test('mobile Marc: cancels from the giver cart and Julie link is gone', async ({
    page,
    request,
  }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('mobile');
    await runCancel(page, request, 'mobile');
  });
  test('web an expired offer: shows the gone page on Julie link', async ({ page, request }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('web');
    await runExpire(page, request, 'web');
  });
  test('mobile an expired offer: shows the gone page on Julie link', async ({ page, request }, testInfo) => {
    expect(giftSurfaceFromTitle(testInfo.title)).toBe('mobile');
    await runExpire(page, request, 'mobile');
  });
});
