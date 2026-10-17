import { test, expect } from '../../../support/fixtures.js';
import { E2E_ACCESSORY_TITLES, E2E_ACCESSORY_UIDS, E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { collectReceiverFeedProductUids } from '../../../support/gift.js';
import { createGuestOfferFromShop } from '../../../support/gift-flow.js';
import { GiftPages, giftSurfaceFromTitle, openPeerShopPage } from '../../../support/pages/gift.pages.js';
import { tid } from '../../../support/selectors.js';

async function withJulie<T>(
  page: import('patchright/test').Page,
  surface: 'web' | 'mobile',
  receiverUrl: string,
  run: (julie: GiftPages) => Promise<T>,
): Promise<T> {
  const peer = await openPeerShopPage(page, surface);
  try {
    const julie = new GiftPages(peer.page);
    await julie.enterReceiverWithPin(receiverUrl);
    return await run(julie);
  } finally {
    await peer.close();
  }
}

async function expectHiddenPrices(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  const hidden = await createGuestOfferFromShop(page, request, { hidePrices: true, budgetEuros: 15 });
  await withJulie(page, surface, hidden.receiverUrl, async (julie) => {
    const card = await julie.galleryPages().findSeededCard(E2E_PRODUCT_UIDS.A1);
    await expect(card.getByTestId(tid.gallery.cardPrice)).toHaveCount(0);
    await expect(julie.page.getByTestId(tid.gift.lockBanner).getByTestId(tid.gift.remainingBudget)).toHaveCount(0);
  });
}

async function expectShownPrices(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  const shown = await createGuestOfferFromShop(page, request, { hidePrices: false, budgetEuros: 15 });
  await withJulie(page, surface, shown.receiverUrl, async (julie) => {
    const card = await julie.galleryPages().findSeededCard(E2E_PRODUCT_UIDS.A1);
    await expect(card.getByTestId(tid.gallery.cardPrice)).toContainText(/12\.00\s*€/);
    await expect(julie.page.getByTestId(tid.gift.lockBanner).getByTestId(tid.gift.remainingBudget)).toContainText(
      /15 € restants/,
    );
  });
}

async function expectFeedKeepsA1(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  const clamped = await createGuestOfferFromShop(page, request, { hidePrices: false, budgetEuros: 13 });
  const feedUids = await collectReceiverFeedProductUids(request, clamped.portal.shareCard!.receiverToken!);
  expect(feedUids).toContain(E2E_PRODUCT_UIDS.A1);
  expect(feedUids).not.toContain(E2E_PRODUCT_UIDS.A2);
  expect(feedUids).not.toContain(E2E_PRODUCT_UIDS.B1);
  await withJulie(page, surface, clamped.receiverUrl, async (julie) => {
    await julie.galleryPages().findSeededCard(E2E_PRODUCT_UIDS.A1);
  });
}

async function expectLeftoverBuysGlue(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  const clamped = await createGuestOfferFromShop(page, request, { hidePrices: false, budgetEuros: 13 });
  await withJulie(page, surface, clamped.receiverUrl, async (julie) => {
    await julie.addSeededSetAndGoToCart(E2E_PRODUCT_UIDS.A1);
    await expect(julie.page.getByTestId(tid.cart.page).getByTestId(tid.gift.remainingBudget)).toContainText(
      /1 € restants/,
    );
    await julie.cartPages().addAccessoryFromCarousel(E2E_ACCESSORY_UIDS.GLUE_DOSES, {
      packLabel: 'x5',
      title: E2E_ACCESSORY_TITLES[E2E_ACCESSORY_UIDS.GLUE_DOSES],
    });
    await expect(
      julie.page.locator(
        `[data-testid="${tid.cart.accessoryLine}"][data-product-uid="${E2E_ACCESSORY_UIDS.GLUE_DOSES}"]`,
      ),
    ).toBeVisible();
    await expect(julie.page.getByTestId(tid.cart.page).getByTestId(tid.gift.remainingBudget)).toContainText(
      /0 € restants/,
    );
  });
}

async function expectDedicatedEnvelopeBuysGlue(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  const dedicated = await createGuestOfferFromShop(page, request, {
    hidePrices: false,
    budgetEuros: 15,
    accessories: true,
    accessoryEuros: 3,
  });
  await withJulie(page, surface, dedicated.receiverUrl, async (julie) => {
    await julie.addSeededSetAndGoToCart(E2E_PRODUCT_UIDS.A1);
    await expect(julie.page.getByTestId(tid.cart.page).getByTestId(tid.gift.remainingBudget)).toContainText(
      /3 € restants/,
    );
    await expect(julie.page.getByTestId(tid.cart.page).getByTestId(tid.gift.remainingAccessoryBudget)).toContainText(
      /6 € restants pour les accessoires/,
    );
    await julie.cartPages().addAccessoryFromCarousel(E2E_ACCESSORY_UIDS.GLUE_DOSES, {
      packLabel: 'x10',
      title: E2E_ACCESSORY_TITLES[E2E_ACCESSORY_UIDS.GLUE_DOSES],
    });
    await expect(julie.page.getByTestId(tid.cart.page).getByTestId(tid.gift.remainingAccessoryBudget)).toContainText(
      /4.5 € restants pour les accessoires/,
    );
  });
}

test.describe('Functional gift receiver budget', () => {
  for (const surface of ['web', 'mobile'] as const) {
    test(`${surface} hide prices: omits gallery amounts and remaining budget`, async ({ page, request }, testInfo) => {
      expect(giftSurfaceFromTitle(testInfo.title)).toBe(surface);
      await expectHiddenPrices(page, request, surface);
    });
    test(`${surface} show prices: keeps gallery amounts and remaining budget`, async ({ page, request }, testInfo) => {
      expect(giftSurfaceFromTitle(testInfo.title)).toBe(surface);
      await expectShownPrices(page, request, surface);
    });
    test(`${surface} 13 € feed: keeps A1 only`, async ({ page, request }, testInfo) => {
      expect(giftSurfaceFromTitle(testInfo.title)).toBe(surface);
      await expectFeedKeepsA1(page, request, surface);
    });
    test(`${surface} leftover budget: buys glue`, async ({ page, request }, testInfo) => {
      expect(giftSurfaceFromTitle(testInfo.title)).toBe(surface);
      await expectLeftoverBuysGlue(page, request, surface);
    });
    test(`${surface} dedicated accessory envelope: buys glue`, async ({ page, request }, testInfo) => {
      expect(giftSurfaceFromTitle(testInfo.title)).toBe(surface);
      await expectDedicatedEnvelopeBuysGlue(page, request, surface);
    });
  }
});
