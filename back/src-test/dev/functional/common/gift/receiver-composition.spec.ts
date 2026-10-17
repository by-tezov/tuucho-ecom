import { test, expect } from '../../../support/fixtures.js';
import { E2E_NAIL_PRICES, E2E_PRODUCT_UIDS, E2E_TITLES } from '../../../support/catalog.js';
import { clickVisible } from '../../../support/interact.js';
import { createGuestOfferFromShop, registerMarcAndCreateOffer } from '../../../support/gift-flow.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { ComposePages } from '../../../support/pages/compose.pages.js';
import { GiftPages, giftSurfaceFromTitle, openPeerShopPage } from '../../../support/pages/gift.pages.js';
import { tid } from '../../../support/selectors.js';

const BUDGET = 40;

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

function surfaceOf(title: string): 'web' | 'mobile' {
  return giftSurfaceFromTitle(title);
}

/** The receiver cart is the locked gift, not the header drawer. Confirm the
 * server accepted the set, then open that cart. */
async function submitCompositionToCart(page: import('patchright/test').Page): Promise<void> {
  const posted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/gift\/[^/]+\/compositions$/.test(new URL(response.url()).pathname),
    { timeout: 15_000 },
  );
  await clickVisible(page.getByTestId(tid.compose.submit));
  const response = await posted;
  const body = await response.text();
  expect(response.status(), `${response.request().postData() ?? ''}\n${body}`).toBe(201);
  await new CartPages(page).goto();
}

async function runSetOnly(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  const created = await createGuestOfferFromShop(page, request, {
    hidePrices: false,
    budgetEuros: BUDGET,
  });
  await withJulie(page, surface, created.receiverUrl, async (julie) => {
    await julie.addSeededSetAndGoToCart(E2E_PRODUCT_UIDS.A1);
    await expect(julie.page.getByTestId(tid.cart.line)).toHaveCount(1);
    await expect(julie.page.getByTestId(tid.compose.cartLine)).toHaveCount(0);
    await expect(julie.page.getByTestId(tid.cart.page).getByTestId(tid.gift.remainingBudget)).toContainText(
      /28 € restants/,
    );
  });
}

async function runSetAndComposition(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  // A composition is stored on the giver's cart. A guest offer has no account
  // yet, so Marc is signed in before Julie shops.
  const created = await registerMarcAndCreateOffer(page, request, surface, {
    hidePrices: false,
    budgetEuros: BUDGET,
  });
  await withJulie(page, surface, created.receiverUrl, async (julie) => {
    await julie.addSeededSetAndGoToCart(E2E_PRODUCT_UIDS.A1);
    const compose = new ComposePages(julie.page);
    await compose.goto();
    await compose.addNail(E2E_PRODUCT_UIDS.NAIL_A, 'left-thumb');
    await submitCompositionToCart(julie.page);
    await expect(julie.page.getByTestId(tid.cart.line)).toHaveCount(1);
    await expect(julie.page.getByTestId(tid.compose.cartLine)).toHaveCount(1);
    await expect(julie.page.getByTestId(tid.compose.cartLine)).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.NAIL_A]);
    await expect(julie.page.getByTestId(tid.cart.page).getByTestId(tid.gift.remainingBudget)).toContainText(
      /24 € restants/,
    );
  });
}

async function runCompositionOnly(
  page: import('patchright/test').Page,
  request: import('patchright/test').APIRequestContext,
  surface: 'web' | 'mobile',
) {
  const created = await registerMarcAndCreateOffer(page, request, surface, {
    hidePrices: false,
    budgetEuros: BUDGET,
  });
  await withJulie(page, surface, created.receiverUrl, async (julie) => {
    const compose = new ComposePages(julie.page);
    await compose.goto();
    await compose.addNail(E2E_PRODUCT_UIDS.NAIL_GAP, 'left-thumb');
    await compose.setSize('S');
    await compose.expectUnavailableStamp('left-thumb', 'S');
    await expect(julie.page.getByTestId(tid.compose.sizeRequest)).toHaveCount(0);
    await expect(julie.page.getByTestId(tid.compose.submit)).toBeDisabled();
    await expect(julie.page.getByTestId(tid.compose.blocked)).toContainText(/cette taille/i);

    await compose.setSize('M');
    await compose.expectNoUnavailableStamp('left-thumb');
    await expect(julie.page.getByTestId(tid.compose.submit)).toBeEnabled();
    await submitCompositionToCart(julie.page);
    await expect(julie.page.getByTestId(tid.cart.line)).toHaveCount(0);
    await expect(julie.page.getByTestId(tid.compose.cartLine)).toHaveCount(1);
    await expect(julie.page.getByTestId(tid.compose.cartLine)).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.NAIL_GAP]);
    await expect(julie.page.getByTestId(tid.cart.page).getByTestId(tid.gift.remainingBudget)).toContainText(
      new RegExp(`${BUDGET - E2E_NAIL_PRICES.NAIL_GAP} € restants`),
    );
  });
}

test.describe('Functional gift receiver composition', () => {
  test('web receiver: can buy a catalogue set without a composition', async ({ page, request }, testInfo) => {
    await runSetOnly(page, request, surfaceOf(testInfo.title));
  });

  test('mobile receiver: can buy a catalogue set without a composition', async ({ page, request }, testInfo) => {
    await runSetOnly(page, request, surfaceOf(testInfo.title));
  });

  test('web receiver: can buy a catalogue set and a composition', async ({ page, request }, testInfo) => {
    await runSetAndComposition(page, request, surfaceOf(testInfo.title));
  });

  test('mobile receiver: can buy a catalogue set and a composition', async ({ page, request }, testInfo) => {
    await runSetAndComposition(page, request, surfaceOf(testInfo.title));
  });

  test('web receiver: can buy only a composition, with no size request', async ({ page, request }, testInfo) => {
    await runCompositionOnly(page, request, surfaceOf(testInfo.title));
  });

  test('mobile receiver: can buy only a composition, with no size request', async ({ page, request }, testInfo) => {
    await runCompositionOnly(page, request, surfaceOf(testInfo.title));
  });
});
