import { test, expect } from '../../../support/fixtures.js';
import { createGuestOfferFromShop } from '../../../support/gift-flow.js';
import { GiftPages, giftSurfaceFromTitle, openOriginBlockedShopPage, openPeerShopPage } from '../../../support/pages/gift.pages.js';
import { tid } from '../../../support/selectors.js';
import { shopPath } from '../../../support/shopPath.js';

async function readOriginBlock(page: import('patchright/test').Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('psn-gift-lock-v1'));
}

async function enterOffer(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
  hidePrices: boolean,
) {
  const created = await createGuestOfferFromShop(page, request, { hidePrices });
  const peer = await openPeerShopPage(page, surface);
  const julie = new GiftPages(peer.page);
  await julie.enterReceiverWithPin(created.receiverUrl);
  return peer;
}

test.describe('Functional gift origin block gating', () => {
  for (const surface of ['web', 'mobile'] as const) {
    test(`${surface} hidden prices: lock other tabs`, async ({ page, request }, testInfo) => {
      expect(giftSurfaceFromTitle(testInfo.title)).toBe(surface);
      const peer = await enterOffer(page, request, surface, true);
      try {
        expect(await readOriginBlock(peer.page)).not.toBeNull();
        const extra = await openOriginBlockedShopPage(peer.page, surface);
        try {
          await extra.page.goto(shopPath('/gallery'));
          await new GiftPages(extra.page).expectContinueNotice();
          await extra.page.goto(shopPath('/gift'));
          await new GiftPages(extra.page).expectContinueNotice();
        } finally {
          await extra.close();
        }
      } finally {
        await peer.close();
      }
    });

    test(`${surface} visible prices: do not lock other tabs`, async ({ page, request }, testInfo) => {
      expect(giftSurfaceFromTitle(testInfo.title)).toBe(surface);
      const peer = await enterOffer(page, request, surface, false);
      try {
        expect(await readOriginBlock(peer.page)).toBeNull();
        const other = await openPeerShopPage(page, surface);
        try {
          await other.page.goto(shopPath('/gallery'));
          await expect(other.page.getByTestId(tid.gift.continueNotice)).toHaveCount(0);
          await expect(other.page.getByTestId(tid.gallery.page)).toBeVisible({ timeout: 15_000 });
        } finally {
          await other.close();
        }
      } finally {
        await peer.close();
      }
    });
  }
});
